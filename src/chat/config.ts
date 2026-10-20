import path from 'path';

/**
 * 실시간 채팅 설정 — 모두 환경 변수 (테스트는 값을 바꿔 새로 만듦)
 * 비밀키가 없으면 개발용 무작위 키를 쓰되, production에서는 시작을 막음
 */
export type ChatConfig = {
	db: { host: string; user: string; password: string; database: string; timezone: string };
	studentSecret: string;
	agentSecret: string; // 관리자 백엔드와 공유 (담당자 토큰)
	fileSecret: string;
	emailDomain: string; // 학교 메일만 인증
	officeEmail: string; // 운영시간 밖 메일을 받을 행정실 주소
	mailFrom: string;
	smtp: { host: string; port: number; user: string; pass: string; secure: boolean } | null;
	outboxDir: string; // SMTP가 없을 때 메일을 파일로 남기는 곳 (개발·테스트)
	storageDir: string; // 첨부 파일 (로컬 디스크)
	allowedOrigins: (string | RegExp)[];
	llmModeration: boolean;
	nowOverride: string | null; // 개발·E2E에서 시각 고정 (production에서는 무시)
	skipEmailVerify: boolean; // 학교 메일 코드 인증 생략 — CHAT_SKIP_EMAIL_VERIFY=1일 때만 (베타 시연용 스위치: beta.sh email-verify off)
	production: boolean;
};

const env = (name: string): string | undefined => {
	const v = process.env[name];
	return v === undefined || v === '' ? undefined : v;
};

const devSecret = (name: string) => `dev-only-${name}-change-me`;

export function loadChatConfig(): ChatConfig {
	const production = env('NODE_ENV') === 'production';
	const secret = (name: string): string => {
		const v = env(name);
		if (v) return v;
		if (production) throw new Error(`[chat] ${name} 환경 변수가 필요합니다`);
		return devSecret(name);
	};
	const root = process.cwd();
	const smtpHost = env('SMTP_HOST');
	return {
		db: {
			host: env('CHAT_DB_HOST') ?? env('DB_HOST') ?? '127.0.0.1',
			user: env('CHAT_DB_USER') ?? env('DB_USER') ?? 'root',
			password: env('CHAT_DB_PASSWORD') ?? env('DB_PASSWORD') ?? '',
			database: env('CHAT_DB_NAME') ?? 'hobit_beta',
			timezone: '+09:00',
		},
		studentSecret: secret('CHAT_STUDENT_SECRET'),
		agentSecret: secret('CHAT_AGENT_SECRET'),
		fileSecret: secret('CHAT_FILE_SECRET'),
		emailDomain: env('CHAT_EMAIL_DOMAIN') ?? 'korea.ac.kr',
		officeEmail: env('CHAT_OFFICE_EMAIL') ?? 'cscoi@korea.ac.kr',
		mailFrom: env('CHAT_MAIL_FROM') ?? 'hoBIT <no-reply@hobit.kr>',
		smtp: smtpHost
			? {
					host: smtpHost,
					port: Number(env('SMTP_PORT') ?? 587),
					user: env('SMTP_USER') ?? '',
					pass: env('SMTP_PASS') ?? '',
					secure: env('SMTP_SECURE') === '1',
				}
			: null,
		outboxDir: env('CHAT_MAIL_OUTBOX') ?? path.join(root, '.mail-outbox'),
		storageDir: env('CHAT_STORAGE_DIR') ?? path.join(root, '.chat-storage'),
		allowedOrigins: (env('CHAT_ALLOWED_ORIGINS') ?? 'https://www.hobit.kr,https://beta.hobit.kr,https://admin.hobit.kr')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.concat(production ? [] : ['regex:^http://localhost:\\d+$'])
			.map((o) => (o.startsWith('regex:') ? new RegExp(o.slice(6)) : o)),
		// 애매한 메시지만 LLM으로 (비꼼·무례 판단) — 키가 있으면 기본으로 켬, CHAT_LLM_MODERATION=0이면 끔
		llmModeration: env('CHAT_LLM_MODERATION') !== '0',
		nowOverride: production ? null : (env('CHAT_NOW') ?? null),
		skipEmailVerify: env('CHAT_SKIP_EMAIL_VERIFY') === '1',
		production,
	};
}
