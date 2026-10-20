import express, { NextFunction, Request, Response } from 'express';
import { koreanHolidays } from './holidays';
import multer from 'multer';
import type { ChatService, Mode, Viewer } from './service';
import type { Row } from './db';
import type { ChatRealtime } from './socket';
import { checkFile, MAX_FILE_BYTES } from './attachments';
import type { AgentClaims } from './tokens';
import { STUDENT_TOKEN_TTL_SEC } from './tokens';

/**
 * 채팅 HTTP API (/api/v0/chat) — 메시지는 소켓, 그 밖(인증·채팅 시작·첨부·설정)은 여기
 */
type Authed = Request & { viewer?: Viewer };

const ip = (req: Request) => (req.ip ?? req.socket.remoteAddress ?? 'unknown').slice(0, 64);
const bearer = (req: Request) => {
	const h = req.headers.authorization ?? '';
	return h.startsWith('Bearer ') ? h.slice(7) : '';
};

const ERROR_TEXT: Record<string, string> = {
	invalid_email: '고려대학교 메일(@korea.ac.kr)만 인증할 수 있어요.',
	blocked: '채팅을 이용할 수 없는 계정이에요. 행정실로 문의해 주세요.',
	rate_limited: '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.',
	invalid: '인증 코드가 맞지 않아요.',
	expired: '인증 코드가 만료되었어요. 다시 받아 주세요.',
	too_many: '인증 코드를 여러 번 틀렸어요. 코드를 다시 받아 주세요.',
	closed_hours: '지금은 채팅 운영 시간이 아니에요.',
	away: '지금은 선배가 자리를 비웠어요.',
	invalid_year: '연도를 확인해 주세요.',
	holiday_source_unavailable: '공휴일 캘린더를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
};
const fail = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error, message: ERROR_TEXT[error] ?? error });

type H = (req: Authed, res: Response, next: NextFunction) => unknown;
/** 핸들러 감싸기 — 반환값 무시, async 오류는 express 오류 처리로 */
const h =
	(fn: H): express.RequestHandler =>
	(req, res, next) => {
		Promise.resolve(fn(req as Authed, res, next)).catch(next);
	};

export function chatRouter(service: ChatService, realtime: ChatRealtime) {
	const router = express.Router();
	const route = {
		get: (path: string, ...fns: H[]) => router.get(path, ...fns.map(h)),
		post: (path: string, ...fns: H[]) => router.post(path, ...fns.map(h)),
		put: (path: string, ...fns: H[]) => router.put(path, ...fns.map(h)),
	};
	const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

	const student = (req: Authed, res: Response, next: NextFunction) => {
		const c = service.tokens.verifyStudent(bearer(req));
		if (!c) return fail(res, 401, 'unauthorized');
		req.viewer = { kind: 'student', email: c.email };
		return next();
	};
	const anyone = (req: Authed, res: Response, next: NextFunction) => {
		const t = bearer(req);
		const a = service.tokens.verifyAgent(t);
		if (a) req.viewer = { kind: 'agent', agent: a };
		else {
			const s = service.tokens.verifyStudent(t);
			if (!s) return fail(res, 401, 'unauthorized');
			req.viewer = { kind: 'student', email: s.email };
		}
		return next();
	};
	const agent = (req: Authed, res: Response, next: NextFunction) => {
		const a = service.tokens.verifyAgent(bearer(req));
		if (!a) return fail(res, 401, 'unauthorized');
		req.viewer = { kind: 'agent', agent: a };
		return next();
	};
	const staffOnly = (req: Authed, res: Response, next: NextFunction) =>
		req.viewer?.kind === 'agent' && req.viewer.agent.role === 'staff' ? next() : fail(res, 403, 'forbidden');
	const agentOf = (req: Authed) => (req.viewer as { kind: 'agent'; agent: AgentClaims }).agent;
	const emailOf = (req: Authed) => (req.viewer as { kind: 'student'; email: string }).email;

	const modeStatus = async (mode: Mode) => {
		if (mode === 'senior') {
			const n = realtime.presence.seniorsAvailable();
			return { mode, open: n > 0, reason: n > 0 ? 'open' : 'away', hours: null };
		}
		const h = await service.staffStatus();
		return { mode, open: h.open, reason: h.reason, hours: { today: h.today, lunch: h.lunch, period: h.period } };
	};

	// ── 상태 (누구나) ───────────────────────────────────────
	route.get('/status', async (req, res) => {
		const mode: Mode = req.query['mode'] === 'senior' ? 'senior' : 'staff';
		res.json({ ok: true, ...(await modeStatus(mode)), officeEmail: service.config.officeEmail, emailVerification: !service.config.skipEmailVerify });
	});

	// ── 학교 메일 인증 ──────────────────────────────────────
	route.post('/email/code', express.json({ limit: '4kb' }), async (req, res) => {
		const r = await service.requestCode(String(req.body?.email ?? ''), ip(req));
		if (!r.ok) return fail(res, r.error === 'rate_limited' ? 429 : 400, r.error);
		return res.json({ ok: true });
	});

	route.post('/email/verify', express.json({ limit: '4kb' }), async (req, res) => {
		const r = await service.verifyCode(String(req.body?.email ?? ''), String(req.body?.code ?? ''));
		if (!r.ok) return fail(res, 400, r.error);
		return res.json({ ok: true, token: r.token, email: r.email, expiresIn: STUDENT_TOKEN_TTL_SEC });
	});

	// 메일 인증 생략 — 설정이 꺼져 있으면(기본) 없는 주소처럼 404
	route.post('/email/dev-login', express.json({ limit: '4kb' }), async (req, res) => {
		if (!service.config.skipEmailVerify) return res.status(404).json({ ok: false, error: 'not_found' });
		const r = await service.devLogin(String(req.body?.email ?? ''));
		if (!r.ok) return fail(res, 400, r.error);
		return res.json({ ok: true, token: r.token, email: r.email, expiresIn: STUDENT_TOKEN_TTL_SEC });
	});

	// ── 학생 ────────────────────────────────────────────────
	route.get('/me', student, async (req: Authed, res) => {
		const row = await service.openSessionOf(emailOf(req));
		if (!row) return res.json({ ok: true, email: emailOf(req), session: null, messages: [] });
		return res.json({
			ok: true,
			email: emailOf(req),
			session: service.toSession(row, req.viewer),
			messages: await service.listMessages(String(row['id'])),
			position: await service.queuePosition(row),
		});
	});

	route.post('/sessions', express.json({ limit: '32kb' }), student, async (req: Authed, res) => {
		const mode: Mode = req.body?.mode === 'senior' ? 'senior' : 'staff';
		const email = emailOf(req);
		if (await service.isBlocked(email)) return fail(res, 403, 'blocked');
		const existing = await service.openSessionOf(email);
		if (!existing) {
			const st = await modeStatus(mode);
			if (!st.open) return fail(res, 409, mode === 'senior' ? 'away' : 'closed_hours');
		}
		const { row, created } = await service.createSession(email, {
			mode,
			language: String(req.body?.language ?? 'KO'),
			profile: req.body?.profile,
			botContext: req.body?.botContext,
		});
		if (created) await realtime.announceNewSession(row);
		return res.json({
			ok: true,
			created,
			session: service.toSession(row, req.viewer),
			messages: await service.listMessages(String(row['id'])),
			position: await service.queuePosition(row),
		});
	});

	// 학생이 채팅 종료 (다른 종류 채팅으로 바꿀 때 — 창에서는 소켓으로도 종료)
	route.post('/sessions/:id/close', student, async (req: Authed, res) => {
		const row = await service.getSessionRow(String(req.params['id']));
		if (!row || !service.canAccess(req.viewer!, row)) return fail(res, 403, 'forbidden');
		const closed = await service.close(String(row['id']), 'student');
		if (closed) await realtime.announceClosed(row, closed);
		return res.json({ ok: true });
	});

	route.post('/sessions/:id/rating', express.json({ limit: '4kb' }), student, async (req: Authed, res) => {
		const ok = await service.rate(String(req.params['id']), emailOf(req), Number(req.body?.rating), String(req.body?.comment ?? ''));
		return ok ? res.json({ ok: true }) : fail(res, 400, 'invalid');
	});

	route.post('/offline-email', express.json({ limit: '16kb' }), student, async (req: Authed, res) => {
		const r = await service.sendOfflineMail(emailOf(req), String(req.body?.subject ?? ''), String(req.body?.body ?? ''));
		if (!r.ok) return fail(res, r.error === 'rate_limited' ? 429 : 400, r.error);
		return res.json({ ok: true });
	});

	// ── 첨부 (학생·담당자) ──────────────────────────────────
	route.post(
		'/sessions/:id/attachments',
		anyone,
		(req, res, next) =>
			upload.single('file')(req, res, (err: unknown) => {
				if (err) return fail(res, err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'upload_failed');
				return next();
			}),
		async (req: Authed, res) => {
			const viewer = req.viewer!;
			const row = await service.getSessionRow(String(req.params['id']));
			if (!row || !service.canAccess(viewer, row)) return fail(res, 403, 'forbidden');
			if (row['status'] === 'closed') return fail(res, 409, 'closed');
			if (viewer.kind === 'agent' && row['status'] !== 'active') return fail(res, 409, 'not_started');
			const file = (req as Request & { file?: Express.Multer.File }).file;
			if (!file) return fail(res, 400, 'no_file');
			// multer는 파일 이름을 latin1로 읽음 → 한글 이름이 깨지지 않게 UTF-8로 다시 읽음
			const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
			const checked = await checkFile(file.buffer, originalName);
			if (typeof checked === 'string') return fail(res, checked === 'too_large' ? 413 : 415, checked);
			const by = viewer.kind === 'agent' ? 'agent' : 'student';
			const aid = await service.saveAttachment(String(row['id']), checked, by);
			const msg =
				viewer.kind === 'agent'
					? await service.addMessage(String(row['id']), 'agent', '', { userId: viewer.agent.uid, name: viewer.agent.name, attachmentId: aid })
					: await service.addMessage(String(row['id']), 'student', '', { attachmentId: aid });
			realtime.announceMessage(String(row['id']), msg);
			return res.json({ ok: true, message: msg });
		}
	);

	// 열람 링크 다시 받기 (서명 링크는 10분)
	route.get('/attachments/:id/link', anyone, async (req: Authed, res) => {
		const a = await service.getAttachment(String(req.params['id']));
		const row = a ? await service.getSessionRow(String(a['session_id'])) : null;
		if (!a || !row || !service.canAccess(req.viewer!, row)) return fail(res, 404, 'not_found');
		return res.json({ ok: true, url: service.fileUrl(String(a['id'])) });
	});

	// 파일 내려주기 — 서명 링크로만. 브라우저가 형식을 추측하거나 페이지처럼 실행하지 못하게
	route.get('/files/:id', async (req, res) => {
		const id = String(req.params['id']);
		if (!service.tokens.verifyFile(String(req.query['t'] ?? ''), id)) return res.status(403).end();
		const a = await service.getAttachment(id);
		if (!a) return res.status(404).end();
		const isImage = String(a['mime']).startsWith('image/');
		res.setHeader('Content-Type', String(a['mime']));
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
		res.setHeader('Cache-Control', 'private, max-age=600');
		res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
		res.setHeader(
			'Content-Disposition',
			`${isImage ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(String(a['original_name']))}`
		);
		try {
			return (await service.storage.read(String(a['storage_key']))).pipe(res);
		} catch {
			return res.status(404).end();
		}
	});

	// ── 담당자 ─────────────────────────────────────────────
	route.get('/agent/sessions', agent, async (req: Authed, res) => {
		const status = (['waiting', 'active', 'closed'] as const).find((s) => s === req.query['status']) ?? 'waiting';
		const rows = await service.listForAgent(agentOf(req), status);
		const extras = await service.listExtras(agentOf(req).uid, rows.map((r) => String(r['id'])));
		return res.json({ ok: true, sessions: rows.map((r) => ({ ...service.toSession(r, req.viewer), ...extras[String(r['id'])] })) });
	});

	route.get('/agent/sessions/:id', agent, async (req: Authed, res) => {
		const row = await service.getSessionRow(String(req.params['id']));
		if (!row || !service.canAccess(req.viewer!, row)) return fail(res, 404, 'not_found');
		return res.json({ ok: true, session: service.toSession(row, req.viewer), messages: await service.listMessages(String(row['id'])) });
	});

	// 홈·헤더 요약: 대기, 내가 맡은 진행 중 채팅(안 읽음·마지막 메시지), 오늘 처리 수
	route.get('/agent/summary', agent, async (req: Authed, res) => {
		const me = agentOf(req);
		const waiting = await service.listForAgent(me, 'waiting');
		const active = (await service.listForAgent(me, 'active', 200)).filter((r) => me.role === 'staff' || Number(r['assigned_user_id']) === me.uid);
		const mine = active.filter((r) => Number(r['assigned_user_id']) === me.uid);
		const ids = [...waiting, ...mine].map((r) => String(r['id']));
		const extras = await service.listExtras(me.uid, ids);
		const withExtras = (r: Row) => ({ ...service.toSession(r, req.viewer), ...extras[String(r['id'])] });
		const [today] = await service.pool.query<Row[]>(
			`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM chat_sessions WHERE status = 'closed' AND closed_at >= CURDATE() ${me.role === 'senior' ? "AND mode = 'senior'" : ''}`
		);
		return res.json({
			ok: true,
			waiting: waiting.map(withExtras),
			mine: mine.map(withExtras),
			activeCount: active.length,
			unread: mine.reduce((sum, r) => sum + (extras[String(r['id'])]?.unread ?? 0), 0),
			// 행정실 채팅 / 선배 채팅 나눠서 (홈 카드)
			unreadByMode: {
				staff: mine.filter((r) => r['mode'] === 'staff').reduce((sum, r) => sum + (extras[String(r['id'])]?.unread ?? 0), 0),
				senior: mine.filter((r) => r['mode'] === 'senior').reduce((sum, r) => sum + (extras[String(r['id'])]?.unread ?? 0), 0),
			},
			closedToday: Number(today[0]?.['n'] ?? 0),
			avgRatingToday: today[0]?.['avg'] === null || today[0]?.['avg'] === undefined ? null : Number(Number(today[0]['avg']).toFixed(1)),
			seniorsAvailable: realtime.presence.seniorsAvailable(),
		});
	});

	route.get('/agent/presence', agent, (_req, res) =>
		res.json({ ok: true, seniorsAvailable: realtime.presence.seniorsAvailable(), staffOnline: realtime.presence.staffOnline() })
	);

	route.post('/agent/blocks', express.json({ limit: '4kb' }), agent, staffOnly, async (req: Authed, res) => {
		const row = await service.getSessionRow(String(req.body?.sessionId ?? ''));
		if (!row) return fail(res, 404, 'not_found');
		await service.block(String(row['student_email']), String(req.body?.reason ?? ''), agentOf(req).uid);
		const closed = await service.close(String(row['id']), 'agent');
		if (closed) realtime.announceSessionUpdate(closed);
		return res.json({ ok: true });
	});

	route.get('/agent/settings', agent, async (_req, res) => res.json({ ok: true, hours: await service.getHours() }));
	// 공휴일 불러오기 (설정 화면에서 골라서 휴무일에 추가) — 저장은 PUT /agent/settings
	route.get('/agent/holidays', agent, staffOnly, async (req, res) => {
		const year = Number(req.query['year']);
		if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail(res, 400, 'invalid_year');
		try {
			return res.json({ ok: true, year, holidays: await koreanHolidays(year) });
		} catch (e) {
			console.error('[chat] 공휴일 불러오기 실패:', (e as Error).message);
			return fail(res, 502, 'holiday_source_unavailable');
		}
	});
	route.put('/agent/settings', express.json({ limit: '16kb' }), agent, staffOnly, async (req, res) => {
		const hours = await service.setHours(req.body?.hours);
		return hours ? res.json({ ok: true, hours }) : fail(res, 400, 'invalid');
	});

	return router;
}
