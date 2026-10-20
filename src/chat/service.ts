import crypto from 'crypto';
import type { Pool, ResultSetHeader } from 'mysql2/promise';
import type { ChatConfig } from './config';
import type { Row } from './db';
import type { Mailer } from './mailer';
import type { FileStorage } from './storage';
import type { AgentClaims, AgentRole, Tokens } from './tokens';
import { DEFAULT_HOURS, HoursSettings, parseHoursSettings, staffHours } from './hours';
import type { CheckedFile } from './attachments';

/**
 * 채팅 업무 규칙 (DB) — 소켓·HTTP와 분리 (같은 규칙을 테스트에서 바로 확인)
 */
export type Mode = 'staff' | 'senior';
export type Status = 'waiting' | 'active' | 'closed';
export type Viewer = { kind: 'student'; email: string } | { kind: 'agent'; agent: AgentClaims };

export type SessionDTO = {
	id: string;
	mode: Mode;
	status: Status;
	studentEmail: string;
	language: string;
	studentLang: string | null; // 학생이 실제로 쓰는 언어 (메시지로 판단) — en이면 자동 번역
	profile: Record<string, string> | null;
	botContext: { q: string; a: string }[] | null;
	assignedUserId: number | null;
	assignedName: string | null;
	createdAt: string;
	startedAt: string | null;
	closedAt: string | null;
	closedBy: 'student' | 'agent' | 'system' | null;
	rating: number | null;
	ratingComment: string | null;
};

export type AttachmentDTO = { id: string; name: string; mime: string; size: number; width: number | null; height: number | null; url: string | null };
export type MessageDTO = {
	id: number;
	sessionId: string;
	sender: 'student' | 'agent' | 'system';
	senderName: string | null;
	senderUserId: number | null; // 담당자 메시지를 보낸 계정 (내 메시지인지 — 수정·삭제 메뉴)
	body: string;
	createdAt: string;
	attachment: AttachmentDTO | null;
	translation: { text: string; lang: string } | null; // 자동 번역 (상대가 읽는 언어)
	editedAt: string | null; // 고친 메시지
	removed: boolean; // 지운 메시지 (내용·첨부 없음)
};

export const LIMITS = {
	messageChars: 2000,
	codeTtlMin: 10,
	codeAttempts: 5,
	codesPerEmailPerHour: 5,
	codeIntervalSec: 60,
	codesPerIpPerHour: 20,
	offlinePerDay: 3,
	editWindowMin: 5, // 보낸 뒤 이 시간 안에만 수정·삭제
	retentionDays: 365, // 대화·인증 메일
	attachmentDays: 90, // 첨부 파일
} as const;

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null);
const json = <T>(v: unknown): T | null => {
	if (v === null || v === undefined) return null;
	if (typeof v === 'object') return v as T;
	try {
		return JSON.parse(String(v)) as T;
	} catch {
		return null;
	}
};
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** 근로장학생(학생) 담당자에게는 학생 메일을 가려서 보여줌 */
export function maskEmail(email: string): string {
	const [id = '', domain = ''] = email.split('@');
	return `${id.slice(0, 2)}${'*'.repeat(Math.max(2, id.length - 2))}@${domain}`;
}

export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

/** 챗봇 대화·프로필은 크기를 제한해서 저장 (화면에서 오는 값이므로) */
export function cleanContext(raw: unknown): { q: string; a: string }[] | null {
	if (!Array.isArray(raw)) return null;
	const items = raw
		.slice(-6)
		.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
		.map((x) => ({ q: String(x['q'] ?? '').slice(0, 300), a: String(x['a'] ?? '').slice(0, 600) }))
		.filter((x) => x.q || x.a);
	return items.length ? items : null;
}

/**
 * 학생이 채팅 시작 때 입력한 정보 — 과정(학부 undergrad / 대학원 grad)·이름·학번·학과·학적 상태
 * (예전 호빗 '내 정보' 항목 grade·admission_year·major_type도 받아 둠)
 */
const PROFILE_KEYS = ['program', 'name', 'student_id', 'department', 'student_status', 'grade', 'admission_year', 'major_type'];
export const PROGRAMS = ['undergrad', 'grad'] as const;
export function cleanProfile(raw: unknown): Record<string, string> | null {
	if (!raw || typeof raw !== 'object') return null;
	const out: Record<string, string> = {};
	for (const k of PROFILE_KEYS) {
		const v = (raw as Record<string, unknown>)[k];
		if (v !== null && v !== undefined && String(v).trim()) out[k] = String(v).trim().slice(0, 40);
	}
	if (out['program'] && !(PROGRAMS as readonly string[]).includes(out['program'])) delete out['program'];
	if (out['student_id'] && !/^\d{4,12}$/.test(out['student_id'])) delete out['student_id'];
	return Object.keys(out).length ? out : null;
}

/**
 * "연결되었어요" 안내 — 학생에게는 계정 이름 대신 역할 (계정 이름은 "kwebhobit"처럼 의미가 없거나 직원 실명)
 * 누가 들어왔는지는 sender_name에 남겨 담당자 화면에서만 보여줌
 */
export const joinText = (agent: { role: string }) => (agent.role === 'senior' ? '선배가 연결되었어요.' : '행정실 담당자가 연결되었어요.');

/** 근로장학생(선배)에게는 이름·학번을 보이지 않음 — 메일을 가리는 것과 같은 이유 */
const SENIOR_HIDDEN = ['name', 'student_id'];

export class ChatService {
	private settingsCache: { at: number; value: HoursSettings } | null = null;

	constructor(
		readonly pool: Pool,
		readonly config: ChatConfig,
		readonly tokens: Tokens,
		readonly mailer: Mailer,
		readonly storage: FileStorage,
		readonly now: () => Date = () => (config.nowOverride ? new Date(config.nowOverride) : new Date())
	) {}

	// ── 운영 시간 ────────────────────────────────────────────
	async getHours(): Promise<HoursSettings> {
		if (this.settingsCache && Date.now() - this.settingsCache.at < 30_000) return this.settingsCache.value;
		const [rows] = await this.pool.query<Row[]>(`SELECT value FROM chat_settings WHERE name = 'hours'`);
		const value = parseHoursSettings(json(rows[0]?.['value'])) ?? DEFAULT_HOURS;
		this.settingsCache = { at: Date.now(), value };
		return value;
	}

	async setHours(raw: unknown): Promise<HoursSettings | null> {
		const value = parseHoursSettings(raw);
		if (!value) return null;
		await this.pool.query(`INSERT INTO chat_settings (name, value) VALUES ('hours', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`, [
			JSON.stringify(value),
		]);
		this.settingsCache = null;
		return value;
	}

	async staffStatus() {
		return staffHours(this.now(), await this.getHours());
	}

	// ── 학교 메일 인증 ───────────────────────────────────────
	validEmail(email: string): boolean {
		const domain = this.config.emailDomain.toLowerCase();
		return email.length <= 254 && new RegExp(`^[a-z0-9._%+-]{1,64}@${domain.replace(/\./g, '\\.')}$`).test(email);
	}

	async isBlocked(email: string): Promise<boolean> {
		const [rows] = await this.pool.query<Row[]>(`SELECT 1 FROM chat_blocks WHERE email = ?`, [email]);
		return rows.length > 0;
	}

	async requestCode(rawEmail: string, ip: string): Promise<{ ok: true } | { ok: false; error: 'invalid_email' | 'blocked' | 'rate_limited' }> {
		const email = normalizeEmail(rawEmail);
		if (!this.validEmail(email)) return { ok: false, error: 'invalid_email' };
		if (await this.isBlocked(email)) return { ok: false, error: 'blocked' };
		const [[byEmail], [byIp]] = await Promise.all([
			this.pool.query<Row[]>(
				`SELECT COUNT(*) AS n, TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS since FROM chat_email_codes WHERE email = ? AND created_at > NOW() - INTERVAL 1 HOUR`,
				[email]
			),
			this.pool.query<Row[]>(`SELECT COUNT(*) AS n FROM chat_email_codes WHERE ip = ? AND created_at > NOW() - INTERVAL 1 HOUR`, [ip]),
		]);
		const e = byEmail[0];
		const since = e?.['since'] === null || e?.['since'] === undefined ? Infinity : Number(e['since']); // 시간 비교는 DB 안에서 (서버 시간대와 무관)
		if (
			Number(e?.['n'] ?? 0) >= LIMITS.codesPerEmailPerHour ||
			Number(byIp[0]?.['n'] ?? 0) >= LIMITS.codesPerIpPerHour ||
			since < LIMITS.codeIntervalSec
		) {
			return { ok: false, error: 'rate_limited' };
		}
		const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
		await this.pool.query(
			`INSERT INTO chat_email_codes (email, code_hash, expires_at, ip) VALUES (?, ?, NOW() + INTERVAL ${LIMITS.codeTtlMin} MINUTE, ?)`,
			[email, hash(`${email}:${code}`), ip]
		);
		await this.mailer.send({
			to: email,
			subject: `[호빗] 채팅 인증 코드 ${code}`,
			text: `호빗 실시간 채팅 인증 코드는 ${code} 입니다.\n${LIMITS.codeTtlMin}분 안에 입력해 주세요.\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
		});
		return { ok: true };
	}

	async verifyCode(
		rawEmail: string,
		code: string
	): Promise<{ ok: true; token: string; email: string } | { ok: false; error: 'invalid' | 'expired' | 'too_many' | 'blocked' }> {
		const email = normalizeEmail(rawEmail);
		const [rows] = await this.pool.query<Row[]>(
			`SELECT id, code_hash, expires_at > NOW() AS alive, attempts FROM chat_email_codes WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1`,
			[email]
		);
		const row = rows[0];
		if (!row) return { ok: false, error: 'invalid' };
		if (!Number(row['alive'])) return { ok: false, error: 'expired' };
		if (Number(row['attempts']) >= LIMITS.codeAttempts) return { ok: false, error: 'too_many' };
		const given = hash(`${email}:${String(code).trim()}`);
		const expected = String(row['code_hash']);
		if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
			await this.pool.query(`UPDATE chat_email_codes SET attempts = attempts + 1 WHERE id = ?`, [row['id']]);
			return { ok: false, error: Number(row['attempts']) + 1 >= LIMITS.codeAttempts ? 'too_many' : 'invalid' };
		}
		if (await this.isBlocked(email)) return { ok: false, error: 'blocked' };
		await this.pool.query(`UPDATE chat_email_codes SET used = 1 WHERE id = ?`, [row['id']]);
		return { ok: true, token: this.tokens.signStudent(email), email };
	}

	/** 코드 없이 학생 토큰 (CHAT_SKIP_EMAIL_VERIFY=1일 때만 라우트가 열림 — 누구나 그 메일인 척할 수 있으니 시연용으로만) */
	async devLogin(rawEmail: string): Promise<{ ok: true; token: string; email: string } | { ok: false; error: 'invalid_email' | 'blocked' }> {
		const email = normalizeEmail(rawEmail);
		if (!this.validEmail(email)) return { ok: false, error: 'invalid_email' };
		if (await this.isBlocked(email)) return { ok: false, error: 'blocked' };
		return { ok: true, token: this.tokens.signStudent(email), email };
	}

	// ── 채팅 ────────────────────────────────────────────────
	toSession(r: Row, viewer?: Viewer): SessionDTO {
		const email = String(r['student_email']);
		const maskForSenior = viewer?.kind === 'agent' && viewer.agent.role === 'senior';
		return {
			id: String(r['id']),
			mode: r['mode'] as Mode,
			status: r['status'] as Status,
			studentEmail: maskForSenior ? maskEmail(email) : email,
			language: String(r['language']),
			studentLang: (r['student_lang'] as string | null) ?? null,
			profile: (() => {
				const p = json<Record<string, string>>(r['profile']);
				if (!p || !maskForSenior) return p;
				return Object.fromEntries(Object.entries(p).filter(([k]) => !SENIOR_HIDDEN.includes(k)));
			})(),
			botContext: json<{ q: string; a: string }[]>(r['bot_context']),
			assignedUserId: r['assigned_user_id'] === null ? null : Number(r['assigned_user_id']),
			assignedName: (r['assigned_username'] as string | null) ?? null,
			createdAt: iso(r['created_at']) ?? '',
			startedAt: iso(r['started_at']),
			closedAt: iso(r['closed_at']),
			closedBy: (r['closed_by'] as SessionDTO['closedBy']) ?? null,
			rating: r['rating'] === null ? null : Number(r['rating']),
			ratingComment: (r['rating_comment'] as string | null) ?? null,
		};
	}

	async getSessionRow(id: string): Promise<Row | null> {
		if (!/^[0-9a-f-]{36}$/.test(id)) return null;
		const [rows] = await this.pool.query<Row[]>(`SELECT * FROM chat_sessions WHERE id = ?`, [id]);
		return rows[0] ?? null;
	}

	/** 볼 수 있는 채팅인지 — 학생은 자기 메일, senior는 선배 채팅, staff는 전부 */
	canAccess(viewer: Viewer, row: Row): boolean {
		if (viewer.kind === 'student') return String(row['student_email']) === viewer.email;
		return viewer.agent.role === 'staff' || row['mode'] === 'senior';
	}

	async openSessionOf(email: string): Promise<Row | null> {
		const [rows] = await this.pool.query<Row[]>(
			`SELECT * FROM chat_sessions WHERE student_email = ? AND status <> 'closed' ORDER BY created_at DESC LIMIT 1`,
			[email]
		);
		return rows[0] ?? null;
	}

	async createSession(
		email: string,
		input: { mode: Mode; language: string; profile: unknown; botContext: unknown }
	): Promise<{ row: Row; created: boolean }> {
		const existing = await this.openSessionOf(email);
		if (existing) return { row: existing, created: false }; // 진행 중인 채팅이 있으면 그대로 이어감
		const id = crypto.randomUUID();
		await this.pool.query(
			`INSERT INTO chat_sessions (id, mode, student_email, language, profile, bot_context) VALUES (?, ?, ?, ?, ?, ?)`,
			[
				id,
				input.mode,
				email,
				input.language === 'EN' ? 'EN' : 'KO',
				JSON.stringify(cleanProfile(input.profile)),
				JSON.stringify(cleanContext(input.botContext)),
			]
		);
		const row = (await this.getSessionRow(id))!;
		return { row, created: true };
	}

	async queuePosition(row: Row): Promise<number> {
		if (row['status'] !== 'waiting') return 0;
		const [rows] = await this.pool.query<Row[]>(
			// 같은 시각(밀리초)에 들어온 요청은 ID로 순서를 정함
			`SELECT COUNT(*) AS n FROM chat_sessions WHERE status = 'waiting' AND mode = ? AND (created_at < ? OR (created_at = ? AND id < ?))`,
			[row['mode'], row['created_at'], row['created_at'], row['id']]
		);
		return Number(rows[0]?.['n'] ?? 0);
	}

	async listForAgent(agent: AgentClaims, status: Status, limit = 50): Promise<Row[]> {
		const modeFilter = agent.role === 'senior' ? `AND mode = 'senior'` : '';
		const order = status === 'closed' ? 'closed_at DESC' : 'created_at ASC, id ASC';
		const [rows] = await this.pool.query<Row[]>(
			`SELECT * FROM chat_sessions WHERE status = ? ${modeFilter} ORDER BY ${order} LIMIT ?`,
			[status, Math.min(limit, 200)]
		);
		return rows;
	}

	/** 채팅 시작 — 대기 중인 채팅을 먼저 누른 담당자 한 명에게만 (조건부 UPDATE로 동시 클릭 방지) */
	async claim(id: string, agent: AgentClaims): Promise<Row | null> {
		const row = await this.getSessionRow(id);
		if (!row || !this.canAccess({ kind: 'agent', agent }, row)) return null;
		const [res] = await this.pool.query<ResultSetHeader>(
			`UPDATE chat_sessions SET status = 'active', assigned_user_id = ?, assigned_username = ?, started_at = NOW() WHERE id = ? AND status = 'waiting'`,
			[agent.uid, agent.name, id]
		);
		if (!res.affectedRows) return null;
		await this.addMessage(id, 'system', joinText(agent), { name: agent.name });
		return this.getSessionRow(id);
	}

	async close(id: string, by: 'student' | 'agent' | 'system'): Promise<Row | null> {
		const [res] = await this.pool.query<ResultSetHeader>(
			`UPDATE chat_sessions SET status = 'closed', closed_at = NOW(), closed_by = ? WHERE id = ? AND status <> 'closed'`,
			[by, id]
		);
		if (!res.affectedRows) return null;
		await this.addMessage(id, 'system', by === 'student' ? '학생이 채팅을 종료했어요.' : '채팅이 종료되었어요.');
		return this.getSessionRow(id);
	}

	async rate(id: string, email: string, rating: number, comment: string): Promise<boolean> {
		if (!Number.isInteger(rating) || rating < 1 || rating > 5) return false;
		const [res] = await this.pool.query<ResultSetHeader>(
			`UPDATE chat_sessions SET rating = ?, rating_comment = ? WHERE id = ? AND student_email = ? AND status = 'closed' AND started_at IS NOT NULL AND rating IS NULL`, // 담당자가 연결된 적 없으면 평가 없음
			[rating, comment.slice(0, 500) || null, id, email]
		);
		return res.affectedRows > 0;
	}

	// ── 읽음 · 요약 (담당자) ────────────────────────────────
	/** 담당자가 이 채팅의 지금까지 메시지를 읽음 */
	async markRead(sessionId: string, userId: number) {
		await this.pool.query(
			`INSERT INTO chat_reads (session_id, user_id, last_read_id)
			 SELECT ?, ?, COALESCE(MAX(id), 0) FROM chat_messages WHERE session_id = ?
			 ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id))`,
			[sessionId, userId, sessionId]
		);
	}

	/** 채팅별 안 읽은 학생 메시지 수 + 마지막 메시지 (목록·홈 요약용) */
	async listExtras(userId: number, ids: string[]): Promise<Record<string, { unread: number; lastMessage: { body: string; sender: string; createdAt: string; attachment: boolean } | null }>> {
		const out: Record<string, { unread: number; lastMessage: { body: string; sender: string; createdAt: string; attachment: boolean } | null }> = {};
		if (!ids.length) return out;
		ids.forEach((id) => (out[id] = { unread: 0, lastMessage: null }));
		const [unread] = await this.pool.query<Row[]>(
			`SELECT m.session_id, COUNT(*) AS n FROM chat_messages m
			 LEFT JOIN chat_reads r ON r.session_id = m.session_id AND r.user_id = ?
			 WHERE m.session_id IN (?) AND m.sender = 'student' AND m.id > COALESCE(r.last_read_id, 0)
			 GROUP BY m.session_id`,
			[userId, ids]
		);
		unread.forEach((r) => {
			const e = out[String(r['session_id'])];
			if (e) e.unread = Number(r['n']);
		});
		const [last] = await this.pool.query<Row[]>(
			`SELECT m.session_id, m.sender, m.body, m.attachment_id, m.created_at, m.removed_at FROM chat_messages m
			 JOIN (SELECT session_id, MAX(id) AS id FROM chat_messages WHERE session_id IN (?) AND sender <> 'system' GROUP BY session_id) x ON x.id = m.id`,
			[ids]
		);
		last.forEach((r) => {
			const e = out[String(r['session_id'])];
			if (e)
				e.lastMessage = {
					body: r['removed_at'] ? '(삭제된 메시지)' : String(r['body']).slice(0, 120),
					sender: String(r['sender']),
					createdAt: iso(r['created_at']) ?? '',
					attachment: !!r['attachment_id'],
				};
		});
		return out;
	}

	/** 내가 맡은 진행 중 채팅 (연결할 때 그 방에 다시 넣어 새 메시지·안 읽음을 받게) */
	async activeAssignedTo(userId: number): Promise<string[]> {
		const [rows] = await this.pool.query<Row[]>(`SELECT id FROM chat_sessions WHERE status = 'active' AND assigned_user_id = ?`, [userId]);
		return rows.map((r) => String(r['id']));
	}

	// ── 메시지 ──────────────────────────────────────────────
	async addMessage(
		sessionId: string,
		sender: 'student' | 'agent' | 'system',
		body: string,
		opts: { userId?: number; name?: string; attachmentId?: string } = {}
	): Promise<MessageDTO> {
		const [res] = await this.pool.query<ResultSetHeader>(
			`INSERT INTO chat_messages (session_id, sender, sender_user_id, sender_name, body, attachment_id) VALUES (?, ?, ?, ?, ?, ?)`,
			[sessionId, sender, opts.userId ?? null, opts.name ?? null, body, opts.attachmentId ?? null]
		);
		await this.pool.query(`UPDATE chat_sessions SET last_message_at = NOW() WHERE id = ?`, [sessionId]);
		const msgs = await this.listMessages(sessionId, { afterId: res.insertId - 1, limit: 1 });
		return msgs[0]!;
	}

	async listMessages(sessionId: string, opts: { afterId?: number; limit?: number } = {}): Promise<MessageDTO[]> {
		const [rows] = await this.pool.query<Row[]>(
			`SELECT m.*, a.original_name, a.mime, a.size, a.width, a.height, a.deleted_at
			 FROM chat_messages m LEFT JOIN chat_attachments a ON a.id = m.attachment_id
			 WHERE m.session_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ?`,
			[sessionId, opts.afterId ?? 0, Math.min(opts.limit ?? 500, 1000)]
		);
		return rows.map((r) => ({
			id: Number(r['id']),
			sessionId: String(r['session_id']),
			sender: r['sender'] as MessageDTO['sender'],
			senderName: (r['sender_name'] as string | null) ?? null,
			senderUserId: r['sender_user_id'] === null || r['sender_user_id'] === undefined ? null : Number(r['sender_user_id']),
			body: String(r['body']),
			createdAt: iso(r['created_at']) ?? '',
			attachment: r['attachment_id']
				? {
						id: String(r['attachment_id']),
						name: String(r['original_name'] ?? 'file'),
						mime: String(r['mime'] ?? ''),
						size: Number(r['size'] ?? 0),
						width: r['width'] === null ? null : Number(r['width']),
						height: r['height'] === null ? null : Number(r['height']),
						// 보관 기간이 지나 지운 파일은 링크 없음
						url: r['deleted_at'] ? null : this.fileUrl(String(r['attachment_id'])),
					}
				: null,
			translation: r['translation'] ? { text: String(r['translation']), lang: String(r['translation_lang'] ?? '') } : null,
			editedAt: iso(r['edited_at']),
			removed: !!r['removed_at'],
		}));
	}

	/**
	 * 내 메시지 고치기·지우기 — 보낸 사람 본인만, 보낸 뒤 5분 안, 채팅이 끝나지 않았을 때
	 * 지우면 내용·번역·첨부 파일을 실제로 지움 (잘못 보낸 개인정보가 남지 않게)
	 */
	private async ownMessage(viewer: Viewer, messageId: number): Promise<{ row: Row; session: Row } | { error: string }> {
		// 경과 시간은 DB 시계로 (개발용 고정 시계 CHAT_NOW와 무관하게)
		const [rows] = await this.pool.query<Row[]>(`SELECT *, TIMESTAMPDIFF(SECOND, created_at, NOW(3)) AS age_sec FROM chat_messages WHERE id = ?`, [messageId]);
		const row = rows[0];
		if (!row) return { error: 'not_found' };
		const session = await this.getSessionRow(String(row['session_id']));
		if (!session || !this.canAccess(viewer, session)) return { error: 'forbidden' };
		const mine =
			viewer.kind === 'student' ? row['sender'] === 'student' : row['sender'] === 'agent' && Number(row['sender_user_id']) === viewer.agent.uid;
		if (!mine) return { error: 'forbidden' };
		if (row['removed_at']) return { error: 'removed' };
		if (session['status'] === 'closed') return { error: 'closed' };
		if (Number(row['age_sec']) > LIMITS.editWindowMin * 60) return { error: 'edit_expired' };
		return { row, session };
	}

	async editMessage(viewer: Viewer, messageId: number, body: string): Promise<{ message: MessageDTO; session: Row } | { error: string }> {
		const own = await this.ownMessage(viewer, messageId);
		if ('error' in own) return own;
		if (own.row['attachment_id']) return { error: 'not_editable' }; // 첨부는 지우기만
		await this.pool.query(`UPDATE chat_messages SET body = ?, edited_at = NOW(3), translation = NULL, translation_lang = NULL WHERE id = ?`, [
			body,
			messageId,
		]);
		const [msg] = await this.listMessages(String(own.row['session_id']), { afterId: messageId - 1, limit: 1 });
		return { message: msg!, session: own.session };
	}

	async removeMessage(viewer: Viewer, messageId: number): Promise<{ message: MessageDTO } | { error: string }> {
		const own = await this.ownMessage(viewer, messageId);
		if ('error' in own) return own;
		const attachmentId = own.row['attachment_id'] as string | null;
		if (attachmentId) {
			const [files] = await this.pool.query<Row[]>(`SELECT storage_key FROM chat_attachments WHERE id = ? AND deleted_at IS NULL`, [attachmentId]);
			if (files[0]) await this.storage.remove(String(files[0]['storage_key'])).catch(() => undefined);
			await this.pool.query(`DELETE FROM chat_attachments WHERE id = ?`, [attachmentId]);
		}
		await this.pool.query(
			`UPDATE chat_messages SET body = '', attachment_id = NULL, translation = NULL, translation_lang = NULL, removed_at = NOW(3) WHERE id = ?`,
			[messageId]
		);
		const [msg] = await this.listMessages(String(own.row['session_id']), { afterId: messageId - 1, limit: 1 });
		return { message: msg! };
	}

	/** 이 담당자가 이 채팅에서 메시지를 보낸 적이 있는지 */
	async hasSpoken(sessionId: string, userId: number): Promise<boolean> {
		const [rows] = await this.pool.query<Row[]>(`SELECT 1 FROM chat_messages WHERE session_id = ? AND sender = 'agent' AND sender_user_id = ? LIMIT 1`, [
			sessionId,
			userId,
		]);
		return rows.length > 0;
	}

	fileUrl(attachmentId: string): string {
		return `/api/v0/chat/files/${attachmentId}?t=${this.tokens.signFile(attachmentId)}`;
	}

	// ── 자동 번역 ──────────────────────────────────────────
	async setTranslation(messageId: number, text: string, lang: string) {
		await this.pool.query(`UPDATE chat_messages SET translation = ?, translation_lang = ? WHERE id = ?`, [text, lang, messageId]);
	}

	async setStudentLang(sessionId: string, lang: string) {
		await this.pool.query(`UPDATE chat_sessions SET student_lang = ? WHERE id = ? AND (student_lang IS NULL OR student_lang <> ?)`, [
			lang,
			sessionId,
			lang,
		]);
	}

	// ── 첨부 ────────────────────────────────────────────────
	async saveAttachment(sessionId: string, file: CheckedFile, by: 'student' | 'agent'): Promise<string> {
		const id = crypto.randomUUID();
		const d = this.now();
		const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}`;
		await this.storage.put(key, file.data);
		await this.pool.query(
			`INSERT INTO chat_attachments (id, session_id, storage_key, mime, size, original_name, width, height, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[id, sessionId, key, file.mime, file.data.length, file.name, file.width, file.height, by]
		);
		return id;
	}

	async getAttachment(id: string): Promise<Row | null> {
		if (!/^[0-9a-f-]{36}$/.test(id)) return null;
		const [rows] = await this.pool.query<Row[]>(`SELECT * FROM chat_attachments WHERE id = ? AND deleted_at IS NULL`, [id]);
		return rows[0] ?? null;
	}

	// ── 차단 · 운영시간 밖 메일 ─────────────────────────────
	async block(email: string, reason: string, by: number) {
		await this.pool.query(`INSERT IGNORE INTO chat_blocks (email, reason, created_by) VALUES (?, ?, ?)`, [
			normalizeEmail(email),
			reason.slice(0, 255) || null,
			by,
		]);
	}

	async sendOfflineMail(
		email: string,
		subject: string,
		body: string
	): Promise<{ ok: true } | { ok: false; error: 'rate_limited' | 'invalid' }> {
		const s = subject.trim().slice(0, 120);
		const b = body.trim().slice(0, 5000);
		if (!s || !b) return { ok: false, error: 'invalid' };
		const [rows] = await this.pool.query<Row[]>(
			`SELECT COUNT(*) AS n FROM chat_offline_mails WHERE email = ? AND created_at > NOW() - INTERVAL 1 DAY`,
			[email]
		);
		if (Number(rows[0]?.['n'] ?? 0) >= LIMITS.offlinePerDay) return { ok: false, error: 'rate_limited' };
		await this.mailer.send({
			to: this.config.officeEmail,
			replyTo: email,
			subject: `[호빗 문의] ${s}`,
			text: `${b}\n\n— 보낸 사람: ${email} (호빗 학교 메일 인증 완료)\n이 메일에 답장하면 학생에게 전달됩니다.`,
		});
		await this.pool.query(`INSERT INTO chat_offline_mails (email) VALUES (?)`, [email]); // 횟수만 기록
		return { ok: true };
	}

	// ── 보관 기간 ───────────────────────────────────────────
	/** 매일 실행: 첨부 90일, 대화 1년, 인증 코드·메일 기록 1일·1주 */
	async runRetention(): Promise<{ files: number; sessions: number }> {
		const [old] = await this.pool.query<Row[]>(
			`SELECT id, storage_key FROM chat_attachments WHERE deleted_at IS NULL AND created_at < NOW() - INTERVAL ${LIMITS.attachmentDays} DAY`
		);
		for (const a of old) {
			await this.storage.remove(String(a['storage_key'])).catch(() => undefined);
			await this.pool.query(`UPDATE chat_attachments SET deleted_at = NOW() WHERE id = ?`, [a['id']]);
		}
		const [expired] = await this.pool.query<Row[]>(
			`SELECT id FROM chat_sessions WHERE status = 'closed' AND closed_at < NOW() - INTERVAL ${LIMITS.retentionDays} DAY`
		);
		const ids = expired.map((r) => String(r['id']));
		if (ids.length) {
			const [files] = await this.pool.query<Row[]>(`SELECT storage_key FROM chat_attachments WHERE session_id IN (?) AND deleted_at IS NULL`, [ids]);
			for (const f of files) await this.storage.remove(String(f['storage_key'])).catch(() => undefined);
			await this.pool.query(`DELETE FROM chat_attachments WHERE session_id IN (?)`, [ids]);
			await this.pool.query(`DELETE FROM chat_messages WHERE session_id IN (?)`, [ids]);
			await this.pool.query(`DELETE FROM chat_reads WHERE session_id IN (?)`, [ids]);
			await this.pool.query(`DELETE FROM chat_sessions WHERE id IN (?)`, [ids]);
		}
		await this.pool.query(`DELETE FROM chat_email_codes WHERE created_at < NOW() - INTERVAL 1 DAY`);
		await this.pool.query(`DELETE FROM chat_offline_mails WHERE created_at < NOW() - INTERVAL 7 DAY`);
		return { files: old.length, sessions: ids.length };
	}
}

export type { AgentRole };
