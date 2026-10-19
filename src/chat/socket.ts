import crypto from 'crypto';
import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import type { ChatService, Mode, Viewer } from './service';
import { LIMITS, joinText } from './service';
import type { AgentClaims } from './tokens';
import { moderate, LlmCheck } from './moderation';
import { detectLang, Translator } from './translate';

/**
 * 실시간 연결 (socket.io)
 *  - 연결할 때 토큰 확인 (학생 / 담당자) + 허용된 사이트에서 온 연결만
 *  - 방: student:<메일 해시>, session:<채팅 ID>, agents:staff, agents:senior
 *  - 학생은 자기 채팅 방에만, senior는 선배 채팅 방에만 (서버가 권한을 확인한 뒤 넣어 줌)
 */
type SocketData = { viewer: Viewer };
type ChatSocket = Socket<Record<string, any>, Record<string, any>, Record<string, never>, SocketData>;
type Ack = (res: Record<string, unknown>) => void;

export const studentRoom = (email: string) => `student:${crypto.createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
export const sessionRoom = (id: string) => `session:${id}`;
export const agentsRoom = (mode: Mode) => `agents:${mode}`;

/** 근로장학생 "채팅 가능" 상태 — 연결이 끊겨도 다시 붙으면 이어짐 (서버 메모리, 인스턴스 1대 기준) */
export class Presence {
	private sockets = new Map<string, AgentClaims>();
	private available = new Map<number, boolean>();

	add(id: string, agent: AgentClaims) {
		this.sockets.set(id, agent);
	}
	remove(id: string) {
		this.sockets.delete(id);
	}
	setAvailable(uid: number, on: boolean) {
		this.available.set(uid, on);
	}
	isAvailable(uid: number) {
		return this.available.get(uid) ?? false;
	}
	/** 지금 채팅을 받을 수 있는 근로장학생 수 (연결되어 있고 "채팅 가능"을 켠 사람) */
	seniorsAvailable(): number {
		const uids = new Set<number>();
		for (const a of this.sockets.values()) if (a.role === 'senior' && this.isAvailable(a.uid)) uids.add(a.uid);
		return uids.size;
	}
	staffOnline(): number {
		return new Set([...this.sockets.values()].filter((a) => a.role === 'staff').map((a) => a.uid)).size;
	}
}

/** 소켓마다 10초에 메시지 8개까지 */
class RateLimiter {
	private hits = new Map<string, number[]>();
	allow(key: string, max = 8, windowMs = 10_000): boolean {
		const now = Date.now();
		const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
		if (recent.length >= max) {
			this.hits.set(key, recent);
			return false;
		}
		recent.push(now);
		this.hits.set(key, recent);
		return true;
	}
	forget(key: string) {
		this.hits.delete(key);
	}
}

export function attachSocket(httpServer: HttpServer, service: ChatService, llm?: LlmCheck, translator?: Translator) {
	const { allowedOrigins } = service.config;
	// 브라우저가 아닌 클라이언트(테스트 등)는 Origin이 없음 — 그때는 토큰으로만 확인
	const originOk = (origin: string | undefined) =>
		!origin || allowedOrigins.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));
	const io = new Server(httpServer, {
		path: '/api/v0/chat/socket',
		cors: {
			origin: (origin, cb) => (originOk(origin) ? cb(null, true) : cb(new Error('origin not allowed'), false)),
		},
		// cors 설정은 HTTP(polling)에만 적용됨 → 웹소켓 연결도 여기서 Origin 확인 (다른 사이트에서 학생 토큰으로 붙는 것 방지)
		allowRequest: (req, cb) => cb(null, originOk(req.headers.origin)),
		maxHttpBufferSize: 64 * 1024, // 메시지만 (파일은 HTTP로)
	});
	const presence = new Presence();
	const limiter = new RateLimiter();

	// ── 연결할 때 토큰 확인 ─────────────────────────────────
	io.use((socket, next) => {
		const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
		const token = typeof auth['token'] === 'string' ? auth['token'] : '';
		if (auth['kind'] === 'agent') {
			const agent = service.tokens.verifyAgent(token);
			if (!agent) return next(new Error('unauthorized'));
			(socket as ChatSocket).data.viewer = { kind: 'agent', agent };
			return next();
		}
		const student = service.tokens.verifyStudent(token);
		if (!student) return next(new Error('unauthorized'));
		(socket as ChatSocket).data.viewer = { kind: 'student', email: student.email };
		return next();
	});

	const broadcastQueue = async (mode: Mode) => {
		const waiting = await service.listForAgent({ typ: 'agent', uid: 0, name: '', role: 'staff' }, 'waiting');
		const forMode = waiting.filter((r) => r['mode'] === mode);
		// staff 방에는 전부, senior 방에는 선배 채팅만 (senior에게는 메일을 가려서)
		// staff는 senior 방에도 들어가 있으므로 senior용(가린 메일)은 staff를 빼고 보냄
		io.to(agentsRoom('staff')).emit('queue:update', {
			waiting: waiting.map((r) => service.toSession(r, { kind: 'agent', agent: { typ: 'agent', uid: 0, name: '', role: 'staff' } })),
		});
		if (mode === 'senior') {
			io.to(agentsRoom('senior')).except(agentsRoom('staff')).emit('queue:update', {
				waiting: forMode.map((r) => service.toSession(r, { kind: 'agent', agent: { typ: 'agent', uid: 0, name: '', role: 'senior' } })),
			});
		}
		// 대기 중인 학생들에게 순번 갱신
		for (const r of forMode) {
			io.to(sessionRoom(String(r['id']))).emit('queue:position', { sessionId: r['id'], position: await service.queuePosition(r) });
		}
	};

	const emitSessionUpdate = (row: Record<string, unknown> & { [k: string]: unknown }) => {
		const id = String(row['id']);
		const mode = row['mode'] as Mode;
		// 학생에게는 메일 그대로(본인), 담당자 방에는 역할에 맞게
		io.to(sessionRoom(id)).except(agentsRoom('staff')).except(agentsRoom('senior')).emit('session:update', service.toSession(row as never));
		io.to(agentsRoom('staff')).emit('session:update', service.toSession(row as never, { kind: 'agent', agent: { typ: 'agent', uid: 0, name: '', role: 'staff' } }));
		if (mode === 'senior') {
			io.to(agentsRoom('senior')).except(agentsRoom('staff')).emit('session:update', service.toSession(row as never, { kind: 'agent', agent: { typ: 'agent', uid: 0, name: '', role: 'senior' } }));
		}
	};

	/**
	 * 자동 번역 — 원문은 이미 보냈고, 번역이 되면 'message:translated'로 덧붙임 (번역을 기다리느라 대화가 늦어지지 않게)
	 *  학생이 영어로 쓰면 → 담당자용 한국어 / 영어 화면 학생이거나 영어로 쓴 학생이면 담당자 한국어 답변 → 영어
	 */
	const translateFor = async (row: Record<string, unknown>, messageId: number, from: 'student' | 'agent', body: string) => {
		if (!translator) return;
		const sessionId = String(row['id']);
		try {
			const lang = detectLang(body);
			let target: 'ko' | 'en' | null = null;
			if (from === 'student' && lang === 'en') {
				target = 'ko';
				await service.setStudentLang(sessionId, 'en');
			} else if (from === 'student' && lang === 'ko') {
				await service.setStudentLang(sessionId, 'ko');
			} else if (from === 'agent' && lang === 'ko') {
				// 영어 화면으로 시작한 학생은 중간에 한국어로 써도 계속 영어로 (학생 화면에서 원문도 볼 수 있음)
				// 한국어 화면 학생은 영어로 쓴 적이 있을 때만
				const fresh = await service.getSessionRow(sessionId);
				if (row['language'] === 'EN' || fresh?.['student_lang'] === 'en') target = 'en';
			}
			if (!target || !lang) return;
			const text = (await translator(body, lang, target)).trim();
			if (!text || text === body) return;
			await service.setTranslation(messageId, text, target);
			io.to(sessionRoom(sessionId)).emit('message:translated', { id: messageId, sessionId, translation: { text, lang: target } });
		} catch (e) {
			console.error('[chat] 번역 실패 (원문만 보임):', (e as Error).message);
		}
	};

	/** 채팅 종료 알림 — 종료 안내 메시지, 상태 변경, 대기 순서 (소켓·HTTP 둘 다) */
	const announceClosed = async (before: Record<string, unknown>, closed: Record<string, unknown>) => {
		const msgs = await service.listMessages(String(before['id']));
		io.to(sessionRoom(String(before['id']))).emit('message', msgs[msgs.length - 1]);
		emitSessionUpdate(closed as never);
		if (before['status'] === 'waiting') await broadcastQueue(before['mode'] as Mode);
	};

	io.on('connection', (raw) => {
		const socket = raw as ChatSocket;
		const viewer = socket.data.viewer;

		// 방 넣기·이벤트 등록은 기다림 없이 먼저 — DB를 기다리는 사이 들어온 이벤트가 사라지지 않게
		if (viewer.kind === 'agent') {
			presence.add(socket.id, viewer.agent);
			socket.join(agentsRoom(viewer.agent.role));
			if (viewer.agent.role === 'staff') socket.join(agentsRoom('senior')); // staff는 선배 채팅도 감독
			socket.emit('presence:self', { available: presence.isAvailable(viewer.agent.uid) });
		} else {
			socket.join(studentRoom(viewer.email));
		}

		// 채팅방 들어가기 (기록 받기) — 권한 확인
		socket.on('session:join', async (p: { sessionId?: string }, ack?: Ack) => {
			const row = await service.getSessionRow(String(p?.sessionId ?? ''));
			if (!row || !service.canAccess(viewer, row)) return ack?.({ ok: false, error: 'forbidden' });
			socket.join(sessionRoom(String(row['id'])));
			if (viewer.kind === 'agent') await service.markRead(String(row['id']), viewer.agent.uid);
			ack?.({
				ok: true,
				session: service.toSession(row, viewer),
				messages: await service.listMessages(String(row['id'])),
				position: await service.queuePosition(row),
			});
		});

		// 채팅 시작 (담당자)
		socket.on('session:claim', async (p: { sessionId?: string }, ack?: Ack) => {
			if (viewer.kind !== 'agent') return ack?.({ ok: false, error: 'forbidden' });
			const row = await service.claim(String(p?.sessionId ?? ''), viewer.agent);
			if (!row) return ack?.({ ok: false, error: 'taken' }); // 다른 담당자가 먼저 시작함
			const id = String(row['id']);
			socket.join(sessionRoom(id));
			await service.markRead(id, viewer.agent.uid);
			const msgs = await service.listMessages(id);
			io.to(sessionRoom(id)).emit('message', msgs[msgs.length - 1]); // "담당자가 연결되었어요"
			emitSessionUpdate(row);
			await broadcastQueue(row['mode'] as Mode);
			ack?.({ ok: true, session: service.toSession(row, viewer), messages: msgs });
		});

		// 메시지 보내기 — 권한, 상태, 길이, 속도, 욕설
		socket.on('message:send', async (p: { sessionId?: string; body?: string }, ack?: Ack) => {
			const body = String(p?.body ?? '').trim();
			if (!body) return ack?.({ ok: false, error: 'empty' });
			if (body.length > LIMITS.messageChars) return ack?.({ ok: false, error: 'too_long' });
			if (!limiter.allow(socket.id)) return ack?.({ ok: false, error: 'rate_limited' });
			const row = await service.getSessionRow(String(p?.sessionId ?? ''));
			if (!row || !service.canAccess(viewer, row)) return ack?.({ ok: false, error: 'forbidden' });
			if (row['status'] === 'closed') return ack?.({ ok: false, error: 'closed' });
			if (viewer.kind === 'agent') {
				// 배정된 담당자만 (staff는 감독 중에도 대신 답할 수 있음)
				if (row['status'] !== 'active') return ack?.({ ok: false, error: 'not_started' });
				if (viewer.agent.role !== 'staff' && Number(row['assigned_user_id']) !== viewer.agent.uid) return ack?.({ ok: false, error: 'forbidden' });
			} else {
				const check = await moderate(body, llm);
				if (!check.allowed) return ack?.({ ok: false, error: 'moderated' });
			}
			// 맡은 담당자가 아닌 다른 담당자(감독 중인 행정실 등)이 처음 답하면 "행정실 담당자가 연결되었어요" (말풍선마다 이름을 붙이지 않음)
			if (viewer.kind === 'agent' && Number(row['assigned_user_id']) !== viewer.agent.uid && !(await service.hasSpoken(String(row['id']), viewer.agent.uid))) {
				const join = await service.addMessage(String(row['id']), 'system', joinText(viewer.agent), { name: viewer.agent.name });
				io.to(sessionRoom(String(row['id']))).emit('message', join);
			}
			const msg =
				viewer.kind === 'agent'
					? await service.addMessage(String(row['id']), 'agent', body, { userId: viewer.agent.uid, name: viewer.agent.name })
					: await service.addMessage(String(row['id']), 'student', body);
			io.to(sessionRoom(String(row['id']))).emit('message', msg);
			ack?.({ ok: true, message: msg });
			void translateFor(row, msg.id, viewer.kind === 'agent' ? 'agent' : 'student', body);
		});

		// 내 메시지 고치기 (5분 안) — 학생은 다시 욕설 검사, 번역도 다시
		socket.on('message:edit', async (p: { messageId?: number; body?: string }, ack?: Ack) => {
			const body = String(p?.body ?? '').trim();
			if (!body) return ack?.({ ok: false, error: 'empty' });
			if (body.length > LIMITS.messageChars) return ack?.({ ok: false, error: 'too_long' });
			if (!limiter.allow(socket.id)) return ack?.({ ok: false, error: 'rate_limited' });
			if (viewer.kind === 'student') {
				const check = await moderate(body, llm);
				if (!check.allowed) return ack?.({ ok: false, error: 'moderated' });
			}
			const r = await service.editMessage(viewer, Number(p?.messageId), body);
			if ('error' in r) return ack?.({ ok: false, error: r.error });
			io.to(sessionRoom(r.message.sessionId)).emit('message:updated', r.message);
			ack?.({ ok: true, message: r.message });
			void translateFor(r.session, r.message.id, viewer.kind === 'agent' ? 'agent' : 'student', body);
		});

		// 내 메시지 지우기 (5분 안) — 내용·첨부를 실제로 지우고 양쪽에 "삭제된 메시지"
		socket.on('message:remove', async (p: { messageId?: number }, ack?: Ack) => {
			if (!limiter.allow(socket.id)) return ack?.({ ok: false, error: 'rate_limited' });
			const r = await service.removeMessage(viewer, Number(p?.messageId));
			if ('error' in r) return ack?.({ ok: false, error: r.error });
			io.to(sessionRoom(r.message.sessionId)).emit('message:updated', r.message);
			ack?.({ ok: true, message: r.message });
		});

		// 담당자가 보고 있는 채팅의 새 메시지를 읽음
		socket.on('session:read', async (p: { sessionId?: string }) => {
			if (viewer.kind !== 'agent') return;
			const row = await service.getSessionRow(String(p?.sessionId ?? ''));
			if (row && service.canAccess(viewer, row)) await service.markRead(String(row['id']), viewer.agent.uid);
		});

		// 입력 중 표시
		socket.on('typing', async (p: { sessionId?: string }) => {
			const id = String(p?.sessionId ?? '');
			if (!socket.rooms.has(sessionRoom(id))) return;
			socket.to(sessionRoom(id)).emit('typing', { sessionId: id, from: viewer.kind });
		});

		// 채팅 종료 (학생·담당자)
		socket.on('session:close', async (p: { sessionId?: string }, ack?: Ack) => {
			const row = await service.getSessionRow(String(p?.sessionId ?? ''));
			if (!row || !service.canAccess(viewer, row)) return ack?.({ ok: false, error: 'forbidden' });
			const closed = await service.close(String(row['id']), viewer.kind === 'agent' ? 'agent' : 'student');
			if (!closed) return ack?.({ ok: false, error: 'closed' });
			await announceClosed(row, closed);
			ack?.({ ok: true });
		});

		// 근로장학생 "채팅 가능" 켜기/끄기
		socket.on('presence:set', (p: { available?: boolean }, ack?: Ack) => {
			if (viewer.kind !== 'agent') return ack?.({ ok: false });
			presence.setAvailable(viewer.agent.uid, Boolean(p?.available));
			io.to(agentsRoom('staff')).to(agentsRoom('senior')).emit('presence:update', { seniorsAvailable: presence.seniorsAvailable() });
			ack?.({ ok: true, available: presence.isAvailable(viewer.agent.uid) });
		});

		// 연결 직후 할 일 (DB) — 이벤트 등록 뒤에
		void (async () => {
			try {
				if (viewer.kind === 'agent') {
					for (const id of await service.activeAssignedTo(viewer.agent.uid)) socket.join(sessionRoom(id));
					await broadcastQueue(viewer.agent.role);
				}
				else {
					const open = await service.openSessionOf(viewer.email);
					if (open) socket.join(sessionRoom(String(open['id'])));
				}
			} catch (e) {
				console.error('[chat] 연결 처리 실패:', e);
			}
		})();

		socket.on('disconnect', () => {
			limiter.forget(socket.id);
			if (viewer.kind === 'agent') {
				presence.remove(socket.id);
				io.to(agentsRoom('staff')).to(agentsRoom('senior')).emit('presence:update', { seniorsAvailable: presence.seniorsAvailable() });
			}
		});
	});

	return {
		io,
		presence,
		/** HTTP로 만든 채팅·첨부를 실시간으로 알림 */
		async announceNewSession(row: Record<string, unknown>) {
			const id = String(row['id']);
			const mode = row['mode'] as Mode;
			const email = String(row['student_email']);
			io.in(studentRoom(email)).socketsJoin(sessionRoom(id)); // 이미 연결된 학생 창을 채팅 방에 넣음
			const staffView = service.toSession(row as never, { kind: 'agent', agent: { typ: 'agent', uid: 0, name: '', role: 'staff' } });
			io.to(agentsRoom('staff')).emit('session:new', staffView); // 알림 (소리·브라우저 알림)
			if (mode === 'senior') {
				io.to(agentsRoom('senior')).except(agentsRoom('staff')).emit(
					'session:new',
					service.toSession(row as never, { kind: 'agent', agent: { typ: 'agent', uid: 0, name: '', role: 'senior' } })
				);
			}
			await broadcastQueue(mode);
		},
		announceMessage(sessionId: string, msg: unknown) {
			io.to(sessionRoom(sessionId)).emit('message', msg);
		},
		announceSessionUpdate: emitSessionUpdate,
		announceClosed,
	};
}

export type ChatRealtime = ReturnType<typeof attachSocket>;
