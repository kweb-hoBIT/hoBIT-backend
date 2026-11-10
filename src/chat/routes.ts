import express, { NextFunction, Request, Response } from 'express';
import { koreanHolidays } from './holidays';
import multer from 'multer';
import type { ChatService, Mode, Viewer } from './service';
import { LIMITS, normalizeProgram } from './service';
import type { Row } from './db';
import type { ChatRealtime } from './socket';
import { checkFile, MAX_FILE_BYTES } from './attachments';
import type { AgentClaims } from './tokens';
import { STUDENT_TOKEN_TTL_SEC } from './tokens';
import { BOT_SETTING_LIMITS, currentBotSettings, DEFAULT_BOT_SETTINGS, SUSPEND_MINUTES_LIMIT } from '../services/bot_settings';
import { BOARDS_HOURS_OPTIONS, checkCrawlUrl, crawlTickAt, DEFAULT_CRAWL_SCHEDULE, DEFAULT_CRAWL_SOURCES, markCrawlTick, MAX_CRAWL_PAGES, QUICK_MIN_OPTIONS } from '../services/crawl_pages';
import axios from 'axios';
import { envs } from '../envs';

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
	invalid_url: '주소를 다시 확인해 주세요 (https://로 시작하는 주소).',
	not_school: '학교 사이트(korea.ac.kr)의 페이지만 더할 수 있어요.',
	already_crawled: '정보대학 홈페이지는 이미 전부 수집하고 있어요.',
	unreadable: '이 페이지에서 본문을 읽지 못했어요. 로그인이 필요하거나 내용이 그림·첨부파일뿐인 페이지일 수 있어요.',
	rag_unavailable: '답변 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
	invalid_email: '고려대학교 메일(@korea.ac.kr)만 인증할 수 있어요.',
	blocked: '채팅을 이용할 수 없는 계정이에요. 행정실로 문의해 주세요.',
	rate_limited: '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.',
	invalid: '인증 코드가 맞지 않아요.',
	expired: '인증 코드가 만료되었어요. 다시 받아 주세요.',
	too_many: '인증 코드를 여러 번 틀렸어요. 코드를 다시 받아 주세요.',
	closed_hours: '지금은 채팅 운영 시간이 아니에요.',
	away: '지금은 근로장학생이 자리를 비웠어요.',
	disabled: '지금은 이 채팅을 운영하지 않아요.',
	invalid_year: '연도를 확인해 주세요.',
	holiday_source_unavailable: '공휴일 캘린더를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
};
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
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
		// 관리자가 끈 채팅 — 호빗 화면은 버튼을 숨기지만, 예전 화면에서 들어와도 시작하지 못하게
		if (!(await service.getFeatures())[mode]) return { mode, open: false, reason: 'disabled', hours: null };
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
		const program = normalizeProgram(req.query['program']); // 학생 화면의 학부/대학원 스위치
		const f = await service.getFeatures();
		res.json({ ok: true, ...(await modeStatus(mode)), program, officeEmail: service.officeEmailFor(program), emailVerification: f.emailVerification });
	});

	// 어떤 채팅을 쓰는지 (호빗 화면이 버튼을 보일지 정함, 누구나)
	route.get('/features', async (_req, res) => {
		const f = await service.getFeatures();
		res.set('Cache-Control', 'no-store');
		// gradEnabled: 챗봇 설정에서 대학원 답변을 끄면 학생 화면이 학부/대학원 스위치를 숨김
		res.json({ ok: true, staff: f.staff, senior: f.senior, emailVerification: f.emailVerification, gradEnabled: currentBotSettings().gradEnabled });
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

	// 메일 인증 생략 — 관리자 사이트에서 메일 인증을 켜 두었으면(기본) 없는 주소처럼 404
	route.post('/email/dev-login', express.json({ limit: '4kb' }), async (req, res) => {
		if ((await service.getFeatures()).emailVerification) return res.status(404).json({ ok: false, error: 'not_found' });
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
			officeEmail: service.officeEmailFor(normalizeProgram(row['program'])),
		});
	});

	route.post('/sessions', express.json({ limit: '32kb' }), student, async (req: Authed, res) => {
		const mode: Mode = req.body?.mode === 'senior' ? 'senior' : 'staff';
		const email = emailOf(req);
		if (await service.isBlocked(email)) return fail(res, 403, 'blocked');
		const existing = await service.openSessionOf(email);
		if (!existing) {
			const st = await modeStatus(mode);
			if (!st.open) return fail(res, 409, st.reason === 'disabled' ? 'disabled' : mode === 'senior' ? 'away' : 'closed_hours');
		}
		// 과정: 화면이 보낸 program(스위치) → 없으면 학생 정보의 과정(grad) → 학부
		const profileProgram = (req.body?.profile as Record<string, unknown> | undefined)?.['program'];
		const program = normalizeProgram(req.body?.program ?? profileProgram);
		const { row, created } = await service.createSession(email, {
			mode,
			program,
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
			officeEmail: service.officeEmailFor(normalizeProgram(row['program'])),
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
		// 받는 곳: 화면이 보낸 과정 → 없으면 진행 중인 채팅의 과정 → 학부 행정팀
		const open = req.body?.program === undefined ? await service.openSessionOf(emailOf(req)) : null;
		const program = normalizeProgram(req.body?.program ?? open?.['program']);
		const r = await service.sendOfflineMail(emailOf(req), String(req.body?.subject ?? ''), String(req.body?.body ?? ''), program);
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

	// 채팅 기록 삭제 — 종료된 채팅만, 행정실·개발자 계정만 (메시지·첨부 파일까지 지우고 되돌릴 수 없음)
	route.post('/agent/sessions/delete', express.json({ limit: '64kb' }), agent, staffOnly, async (req: Authed, res) => {
		const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
		if (!ids.length) return fail(res, 400, 'invalid');
		const deleted = await service.deleteClosedSessions(ids);
		console.log(`[chat] 채팅 기록 삭제 ${deleted}건 (담당자 ${agentOf(req).uid})`);
		return res.json({ ok: true, deleted });
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

	// 번역 미리보기 — 영어로 받는 학생에게 보낼 답변이 어떻게 번역될지 (보내기 전, 같은 번역이 그대로 감)
	route.post('/agent/sessions/:id/translate-preview', express.json({ limit: '16kb' }), agent, async (req: Authed, res) => {
		const body = String(req.body?.body ?? '').trim();
		if (!body || body.length > LIMITS.messageChars) return fail(res, 400, 'invalid');
		const row = await service.getSessionRow(String(req.params['id']));
		if (!row || !service.canAccess(req.viewer!, row)) return fail(res, 404, 'not_found');
		if (row['status'] === 'closed') return fail(res, 409, 'closed');
		const r = await realtime.previewTranslation(agentOf(req), row, body);
		if (r === 'rate_limited') return fail(res, 429, 'rate_limited');
		return res.json({ ok: true, needed: r.needed, translation: r.text });
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
	// 채팅 켜고 끄기 — 보기는 담당자 누구나, 바꾸기는 행정실·개발자만
	route.get('/agent/features', agent, async (_req, res) => res.json({ ok: true, features: await service.getFeatures() }));
	route.put('/agent/features', express.json({ limit: '4kb' }), agent, staffOnly, async (req, res) => {
		const features = await service.setFeatures(req.body?.features);
		return features ? res.json({ ok: true, features }) : fail(res, 400, 'invalid');
	});
	// 챗봇 설정 (답변 자유도·주변 장소·학식·과다 사용) — 보기는 담당자 누구나, 바꾸기는 행정실·개발자만
	const botPayload = (data: Awaited<ReturnType<ChatService['getBotSettings']>>) => ({
		ok: true,
		...data,
		defaults: DEFAULT_BOT_SETTINGS,
		limits: { ...BOT_SETTING_LIMITS, suspendMinutes: SUSPEND_MINUTES_LIMIT },
	});
	route.get('/agent/bot-settings', agent, async (_req, res) => res.json(botPayload(await service.getBotSettings())));
	route.put('/agent/bot-settings', express.json({ limit: '8kb' }), agent, staffOnly, async (req, res) => {
		const saved = await service.setBotSettings(req.body?.settings, agentOf(req).name);
		return saved ? res.json(botPayload(saved)) : fail(res, 400, 'invalid');
	});
	// 정기 수집 — 시간표·최근 결과(RAG가 읽음)·추가한 페이지. 보기는 담당자 누구나, 바꾸기는 행정실·개발자만
	const RAG = envs.RAG_SERVER_URL ?? 'http://localhost:8000';
	const crawlPayload = async () => {
		const status = await axios
			.get(`${RAG}/crawl/status`, { timeout: 4000 })
			.then((r) => r.data)
			.catch(() => null); // RAG가 꺼져 있어도 목록은 보이게
		return {
			ok: true,
			...(await service.getCrawlConfig()),
			defaults: { schedule: DEFAULT_CRAWL_SCHEDULE, sources: DEFAULT_CRAWL_SOURCES },
			options: { quickMin: QUICK_MIN_OPTIONS, boardsHours: BOARDS_HOURS_OPTIONS },
			maxPages: MAX_CRAWL_PAGES,
			tickAt: crawlTickAt(),
			status,
		};
	};
	route.get('/agent/crawl', agent, async (_req, res) => res.json(await crawlPayload()));
	route.put('/agent/crawl', express.json({ limit: '32kb' }), agent, staffOnly, async (req, res) => {
		const saved = await service.setCrawlConfig(req.body, agentOf(req).name);
		if (!('pages' in saved)) return res.status(400).json({ ok: false, error: saved.error, url: (saved as { url?: string }).url });
		return res.json(await crawlPayload());
	});
	// 더하기 전에 글이 잘 읽히는지 미리 보기 (RAG가 한 번 받아 본문 앞부분을 돌려줌)
	route.post('/agent/crawl/preview', express.json({ limit: '4kb' }), agent, staffOnly, async (req, res) => {
		const checked = checkCrawlUrl(String(req.body?.url ?? ''));
		if ('error' in checked) return fail(res, 400, checked.error);
		try {
			const r = await axios.post(`${RAG}/crawl/preview`, { url: checked.url }, { timeout: 20000 });
			return res.json({ ok: true, ...r.data });
		} catch (e) {
			const code = axios.isAxiosError(e) && e.response?.status === 422 ? 'unreadable' : 'rag_unavailable';
			return fail(res, code === 'unreadable' ? 422 : 502, code);
		}
	});
	// RAG 정기 수집이 서버 안에서만 부름 — 켜 둔 페이지 목록 (Caddy를 거친 요청은 IP가 학생 IP라 여기에 안 걸림)
	route.get('/internal/crawl-pages', async (req, res) => {
		if (!LOOPBACK.has(req.ip ?? '') || req.headers['x-forwarded-for']) return fail(res, 403, 'forbidden');
		const { pages, sources } = await service.getCrawlConfig();
		return res.json({ ok: true, pages: sources.customPages ? pages.filter((p) => p.enabled) : [] });
	});
	// 서버 crontab(5분마다 beta.sh crawl-tick)과 수집 파이프라인이 부름 — 일정·켜 둔 대상 (?tick=1이면 받아 간 시각 기록)
	route.get('/internal/crawl-config', async (req, res) => {
		if (!LOOPBACK.has(req.ip ?? '') || req.headers['x-forwarded-for']) return fail(res, 403, 'forbidden');
		if (req.query['tick'] === '1') markCrawlTick();
		const { pages, schedule, sources } = await service.getCrawlConfig();
		return res.json({ ok: true, schedule, sources, pages: sources.customPages ? pages.filter((p) => p.enabled) : [] });
	});
	route.put('/agent/settings', express.json({ limit: '16kb' }), agent, staffOnly, async (req, res) => {
		const hours = await service.setHours(req.body?.hours);
		return hours ? res.json({ ok: true, hours }) : fail(res, 400, 'invalid');
	});

	return router;
}
