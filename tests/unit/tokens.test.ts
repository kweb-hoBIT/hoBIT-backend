import jwt from 'jsonwebtoken';
import { makeTokens } from '../../src/chat/tokens';
import { loadChatConfig } from '../../src/chat/config';

const config = {
	...loadChatConfig(),
	studentSecret: 'student-secret',
	agentSecret: 'agent-secret',
	fileSecret: 'file-secret',
};
const t = makeTokens(config);

describe('메일 인증 생략 스위치', () => {
	const saved = { ...process.env };
	afterEach(() => {
		process.env = { ...saved };
	});
	test('기본은 인증함, 1로 명시했을 때만 생략 (production 포함)', () => {
		process.env.NODE_ENV = 'production';
		process.env.CHAT_STUDENT_SECRET = process.env.CHAT_AGENT_SECRET = process.env.CHAT_FILE_SECRET = 'x';
		delete process.env.CHAT_SKIP_EMAIL_VERIFY;
		expect(loadChatConfig().skipEmailVerify).toBe(false);
		process.env.CHAT_SKIP_EMAIL_VERIFY = '0';
		expect(loadChatConfig().skipEmailVerify).toBe(false);
		process.env.CHAT_SKIP_EMAIL_VERIFY = '1';
		expect(loadChatConfig().skipEmailVerify).toBe(true);
	});
});

describe('토큰', () => {
	test('학생 토큰 → 학생으로만 인정', () => {
		const token = t.signStudent('kim@korea.ac.kr');
		expect(t.verifyStudent(token)?.email).toBe('kim@korea.ac.kr');
		expect(t.verifyAgent(token)).toBeNull(); // 다른 비밀키 + 종류 확인
	});

	test('담당자 토큰의 역할', () => {
		expect(t.verifyAgent(t.signAgent(3, '김행정', 'staff'))).toMatchObject({ uid: 3, role: 'staff' });
		expect(t.verifyAgent(t.signAgent(4, '이근로', 'senior'))).toMatchObject({ uid: 4, role: 'senior' });
	});

	test('같은 비밀키로 만들었어도 종류가 다르면 거부 (학생 토큰에 typ만 바꿔치기)', () => {
		const forged = jwt.sign({ typ: 'agent', uid: 1, name: 'x', role: 'staff' }, 'student-secret', { issuer: 'hobit-chat' });
		expect(t.verifyAgent(forged)).toBeNull();
	});

	test('알고리즘 none·변조·만료 거부', () => {
		const none = jwt.sign({ typ: 'student', email: 'a@korea.ac.kr' }, '', { algorithm: 'none', issuer: 'hobit-chat' } as jwt.SignOptions);
		expect(t.verifyStudent(none)).toBeNull();
		const token = t.signStudent('a@korea.ac.kr');
		expect(t.verifyStudent(token.slice(0, -2) + 'xx')).toBeNull();
		const expired = jwt.sign({ typ: 'student', email: 'a@korea.ac.kr', exp: Math.floor(Date.now() / 1000) - 10 }, 'student-secret', {
			issuer: 'hobit-chat',
		});
		expect(t.verifyStudent(expired)).toBeNull();
	});

	test('파일 링크는 그 첨부에만 쓸 수 있음', () => {
		const f = t.signFile('11111111-1111-1111-1111-111111111111');
		expect(t.verifyFile(f, '11111111-1111-1111-1111-111111111111')).toBe(true);
		expect(t.verifyFile(f, '22222222-2222-2222-2222-222222222222')).toBe(false);
	});
});
