import jwt from 'jsonwebtoken';
import type { ChatConfig } from './config';

/**
 * 토큰 3종 (모두 HS256, 용도별 다른 비밀키 + typ 확인 → 한 종류를 다른 데 쓰지 못함)
 *  - 학생: 학교 메일 인증 후 12시간
 *  - 담당자: 관리자 백엔드가 발급 (같은 CHAT_AGENT_SECRET), 15분
 *  - 파일: 첨부 하나를 몇 분 동안 열람
 */
export type AgentRole = 'staff' | 'senior';
export type StudentClaims = { typ: 'student'; email: string };
export type AgentClaims = { typ: 'agent'; uid: number; name: string; role: AgentRole };
export type FileClaims = { typ: 'file'; aid: string };

export const STUDENT_TOKEN_TTL_SEC = 12 * 60 * 60;
const FILE_TOKEN_TTL_SEC = 10 * 60;

const ISSUER = 'hobit-chat';

function verify<T>(token: string, secret: string, typ: string): T | null {
	try {
		const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER }) as Record<string, unknown>;
		return claims['typ'] === typ ? (claims as T) : null;
	} catch {
		return null;
	}
}

export function makeTokens(config: ChatConfig) {
	return {
		signStudent: (email: string) =>
			jwt.sign({ typ: 'student', email }, config.studentSecret, { algorithm: 'HS256', expiresIn: STUDENT_TOKEN_TTL_SEC, issuer: ISSUER }),
		verifyStudent: (token: string) => {
			const c = verify<StudentClaims>(token, config.studentSecret, 'student');
			return c && typeof c.email === 'string' ? c : null;
		},
		/** 관리자 백엔드와 같은 방식 (테스트·개발용으로도 씀) */
		signAgent: (uid: number, name: string, role: AgentRole) =>
			jwt.sign({ typ: 'agent', uid, name, role }, config.agentSecret, { algorithm: 'HS256', expiresIn: 15 * 60, issuer: ISSUER }),
		verifyAgent: (token: string) => {
			const c = verify<AgentClaims>(token, config.agentSecret, 'agent');
			return c && Number.isInteger(c.uid) && (c.role === 'staff' || c.role === 'senior') ? c : null;
		},
		signFile: (aid: string) =>
			jwt.sign({ typ: 'file', aid }, config.fileSecret, { algorithm: 'HS256', expiresIn: FILE_TOKEN_TTL_SEC, issuer: ISSUER }),
		verifyFile: (token: string, aid: string) => {
			const c = verify<FileClaims>(token, config.fileSecret, 'file');
			return !!c && c.aid === aid;
		},
	};
}

export type Tokens = ReturnType<typeof makeTokens>;
