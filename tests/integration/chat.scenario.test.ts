import sharp from 'sharp';
import { startServer, Harness, waitFor, expectSilence, emit } from './harness';

/**
 * 실제 상황 시나리오 — 진짜 서버·DB·소켓으로
 * 시계: 기본은 학기 중 화요일 10:30 (채팅 가능)
 */
let h: Harness;
const TUE_1030 = new Date('2026-10-13T10:30:00+09:00');
const SAT_1100 = new Date('2026-10-10T11:00:00+09:00');

beforeAll(async () => {
	h = await startServer();
});
afterAll(async () => {
	await h?.stop();
});
beforeEach(async () => {
	h.clock.now = TUE_1030;
	await h.resetRateLimits();
});

const photo = () => sharp({ create: { width: 30, height: 20, channels: 3, background: '#123456' } }).jpeg().toBuffer();
const upload = (token: string, sessionId: string, data: Buffer, name: string, type: string) => {
	const form = new FormData();
	form.append('file', new Blob([data], { type }), name);
	return h.api('POST', `/sessions/${sessionId}/attachments`, { token, form });
};

describe('운영시간 밖 → 이메일 작성 (내용은 저장하지 않음)', () => {
	test('토요일에는 채팅을 열 수 없고, 행정실 메일로 보냄 (하루 3통까지)', async () => {
		h.clock.now = SAT_1100;
		const st = await h.api('GET', '/status?mode=staff');
		expect(st.json).toMatchObject({ open: false, reason: 'weekend', officeEmail: 'cscoi@korea.ac.kr' });

		const token = await h.verifiedStudent('weekend@korea.ac.kr');
		expect((await h.api('POST', '/sessions', { token, body: { mode: 'staff' } })).status).toBe(409);

		for (let i = 1; i <= 3; i++) {
			const r = await h.api('POST', '/offline-email', { token, body: { subject: `휴학 문의 ${i}`, body: '휴학 신청 기간이 궁금합니다.' } });
			expect(r.status).toBe(200);
		}
		const mail = h.mails.filter((m) => m.to === 'cscoi@korea.ac.kr').pop()!;
		expect(mail).toMatchObject({ replyTo: 'weekend@korea.ac.kr', subject: '[호빗 문의] 휴학 문의 3' });
		expect(mail.text).toContain('휴학 신청 기간이 궁금합니다.');

		const fourth = await h.api('POST', '/offline-email', { token, body: { subject: '또', body: '또 문의' } });
		expect(fourth.status).toBe(429);

		// 메일 내용은 DB에 없음 — 보낸 횟수(메일 주소·시각)만
		const [cols] = await h.chat.service.pool.query<any[]>(`SHOW COLUMNS FROM chat_offline_mails`);
		expect(cols.map((c) => c.Field).sort()).toEqual(['created_at', 'email', 'id']);
	});
});

describe('학교 메일 인증', () => {
	test('학교 메일만, 코드는 1분에 한 번, 5번 틀리면 무효, 한 번 쓰면 끝', async () => {
		expect((await h.api('POST', '/email/code', { body: { email: 'me@gmail.com' } })).json.error).toBe('invalid_email');
		expect((await h.api('POST', '/email/code', { body: { email: 'evil@korea.ac.kr.evil.com' } })).json.error).toBe('invalid_email');

		const email = 'Lee.Student@Korea.ac.kr'; // 대소문자 섞여도 같은 사람
		expect((await h.api('POST', '/email/code', { body: { email } })).status).toBe(200);
		expect((await h.api('POST', '/email/code', { body: { email } })).status).toBe(429); // 1분 안에 다시
		const code = /(\d{6})/.exec(h.mails.filter((m) => m.to === 'lee.student@korea.ac.kr').pop()!.text)![1]!;

		const wrong = code === '000000' ? '111111' : '000000';
		for (let i = 0; i < 4; i++) expect((await h.api('POST', '/email/verify', { body: { email, code: wrong } })).json.error).toBe('invalid');
		expect((await h.api('POST', '/email/verify', { body: { email, code: wrong } })).json.error).toBe('too_many');
		expect((await h.api('POST', '/email/verify', { body: { email, code } })).json.error).toBe('too_many'); // 맞는 코드도 이제 안 됨

		await h.resetRateLimits();
		const token = await h.verifiedStudent('fresh@korea.ac.kr');
		expect(token).toBeTruthy();
		const reuse = /(\d{6})/.exec(h.mails.filter((m) => m.to === 'fresh@korea.ac.kr').pop()!.text)![1];
		expect((await h.api('POST', '/email/verify', { body: { email: 'fresh@korea.ac.kr', code: reuse } })).status).toBe(400);
	});
});

describe('일반 채팅 전체 흐름 (학생 ↔ 행정실)', () => {
	test('요청 → 알림 → 동시에 시작 눌러도 한 명만 → 대화·욕설 차단·첨부 → 종료·만족도', async () => {
		const staffA = await h.connect({ kind: 'agent', token: h.agentToken(1, '김행정', 'staff') });
		const staffB = await h.connect({ kind: 'agent', token: h.agentToken(2, '박행정', 'staff') });
		const senior = await h.connect({ kind: 'agent', token: h.agentToken(3, '이근로', 'senior') });

		const t1 = await h.verifiedStudent('kim@korea.ac.kr');
		const s1 = await h.connect({ kind: 'student', token: t1 });

		// 학생 요청 → staff 둘 다 알림, 근로장학생은 일반 채팅 알림을 받지 않음
		const newA = waitFor(staffA, 'session:new');
		const newB = waitFor(staffB, 'session:new');
		const seniorQuiet = expectSilence(senior, 'session:new');
		const created = await h.api('POST', '/sessions', {
			token: t1,
			body: { mode: 'staff', language: 'KO', profile: { department: '컴퓨터학과', admission_year: 20 }, botContext: [{ q: '졸업 요건?', a: '...' }] },
		});
		expect(created.status).toBe(200);
		const sessionId = created.json.session.id as string;
		expect(created.json.position).toBe(0);
		const notified = await newA;
		await newB;
		await seniorQuiet;
		expect(notified).toMatchObject({ id: sessionId, studentEmail: 'kim@korea.ac.kr', profile: { department: '컴퓨터학과', admission_year: '20' } });
		expect(notified.botContext[0].q).toBe('졸업 요건?');

		// 두 번째 학생은 대기 순번 1
		const t2 = await h.verifiedStudent('park@korea.ac.kr');
		const second = await h.api('POST', '/sessions', { token: t2, body: { mode: 'staff' } });
		expect(second.json.position).toBe(1);

		// 같은 학생이 다시 요청하면 새로 만들지 않고 이어감
		expect((await h.api('POST', '/sessions', { token: t1, body: { mode: 'staff' } })).json).toMatchObject({ created: false });

		// 두 담당자가 동시에 시작 → 한 명만
		const connected = waitFor(s1, 'message', (m) => m.sender === 'system');
		const [ra, rb] = await Promise.all([emit(staffA, 'session:claim', { sessionId }), emit(staffB, 'session:claim', { sessionId })]);
		expect([ra['ok'], rb['ok']].sort()).toEqual([false, true]);
		const winner = ra['ok'] ? staffA : staffB;
		const loser = ra['ok'] ? rb : ra;
		expect(loser['error']).toBe('taken');
		expect((await connected).body).toBe('행정실 담당자가 연결되었어요.');

		// 대화
		const got = waitFor(winner, 'message', (m) => m.sender === 'student');
		expect((await emit(s1, 'message:send', { sessionId, body: '졸업 요건 문의드려요' }))['ok']).toBe(true);
		expect((await got).body).toBe('졸업 요건 문의드려요');

		const reply = waitFor(s1, 'message', (m) => m.sender === 'agent');
		await emit(winner, 'message:send', { sessionId, body: '학번을 알려주세요.' });
		expect(await reply).toMatchObject({ body: '학번을 알려주세요.', senderName: ra['ok'] ? '김행정' : '박행정' });

		// 욕설은 서버에서 막고 담당자에게 가지 않음 / 비슷한 일상어는 통과
		const quiet = expectSilence(winner, 'message');
		expect((await emit(s1, 'message:send', { sessionId, body: '아 시발 왜 안돼' }))['error']).toBe('moderated');
		await quiet;
		expect((await emit(s1, 'message:send', { sessionId, body: '질병 신청서도 같이 내야 하나요?' }))['ok']).toBe(true);

		// 길이·속도 제한
		expect((await emit(s1, 'message:send', { sessionId, body: 'a'.repeat(2001) }))['error']).toBe('too_long');
		const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => emit(s1, 'message:send', { sessionId, body: `빠르게 ${i}` })));
		expect(burst.some((r) => r['error'] === 'rate_limited')).toBe(true);

		// 입력 중 표시
		const typing = waitFor(winner, 'typing');
		s1.emit('typing', { sessionId });
		expect(await typing).toMatchObject({ sessionId, from: 'student' });

		// 근로장학생은 일반 채팅에 들어갈 수 없음 / 다른 행정실 담당자는 감독 가능
		expect((await emit(senior, 'session:join', { sessionId }))['error']).toBe('forbidden');
		const other = ra['ok'] ? staffB : staffA;
		const watch = await emit<any>(other, 'session:join', { sessionId });
		expect(watch.ok).toBe(true);
		expect(watch.messages.some((m: any) => m.body === '졸업 요건 문의드려요')).toBe(true);

		// 사진 첨부 → 담당자에게 링크와 함께, 링크로만 열람
		const withFile = waitFor(winner, 'message', (m) => !!m.attachment);
		const up = await upload(t1, sessionId, await photo(), 'IMG_0001.HEIC.jpg', 'image/jpeg');
		expect(up.status).toBe(200);
		const fileMsg = await withFile;
		expect(fileMsg.attachment).toMatchObject({ mime: 'image/jpeg', width: 30, height: 20 });
		// 한글 파일 이름이 깨지지 않음
		const named = waitFor(winner, 'message', (m) => !!m.attachment && m.attachment.name.startsWith('성적'));
		await upload(t1, sessionId, await photo(), '성적표 2학기.jpg', 'image/jpeg');
		expect((await named).attachment.name).toBe('성적표 2학기.jpg');
		const file = await fetch(`${h.url}${fileMsg.attachment.url}`);
		expect(file.status).toBe(200);
		expect(file.headers.get('content-type')).toBe('image/jpeg');
		expect(file.headers.get('x-content-type-options')).toBe('nosniff');
		expect(file.headers.get('content-security-policy')).toContain('sandbox');
		const tampered = fileMsg.attachment.url.replace(/t=[^&]+/, 't=forged');
		expect((await fetch(`${h.url}${tampered}`)).status).toBe(403);
		// 다른 학생은 링크를 새로 받을 수 없음
		expect((await h.api('GET', `/attachments/${fileMsg.attachment.id}/link`, { token: t2 })).status).toBe(404);
		// 이미지로 속인 HTML은 거부
		expect((await upload(t1, sessionId, Buffer.from('<script>alert(1)</script>'), 'x.png', 'image/png')).status).toBe(415);

		// 담당자가 종료 → 학생 화면 갱신, 이후 메시지 불가, 만족도는 한 번
		const closed = waitFor(s1, 'session:update', (s) => s.status === 'closed');
		expect((await emit(winner, 'session:close', { sessionId }))['ok']).toBe(true);
		expect((await closed).closedBy).toBe('agent');
		// (s1은 위에서 속도 제한에 걸린 상태라 새 창으로 확인)
		const s1b = await h.connect({ kind: 'student', token: t1 });
		expect((await emit(s1b, 'message:send', { sessionId, body: '감사합니다' }))['error']).toBe('closed');
		expect((await h.api('POST', `/sessions/${sessionId}/rating`, { token: t1, body: { rating: 5, comment: '빨라요' } })).status).toBe(200);
		expect((await h.api('POST', `/sessions/${sessionId}/rating`, { token: t1, body: { rating: 1 } })).status).toBe(400);
	});
});

describe('선배 채팅 (근로장학생) · 권한', () => {
	test('아무도 없으면 자리비움 → 채팅 가능을 켜면 열림 → 메일은 가려서 → 행정실 전용 기능은 막힘', async () => {
		const senior = await h.connect({ kind: 'agent', token: h.agentToken(13, '최근로', 'senior') });
		const staff = await h.connect({ kind: 'agent', token: h.agentToken(11, '정행정', 'staff') });

		expect((await h.api('GET', '/status?mode=senior')).json).toMatchObject({ open: false, reason: 'away' });
		const t = await h.verifiedStudent('junior@korea.ac.kr');
		expect((await h.api('POST', '/sessions', { token: t, body: { mode: 'senior' } })).json.error).toBe('away');

		expect((await emit(senior, 'presence:set', { available: true }))['available']).toBe(true);
		expect((await h.api('GET', '/status?mode=senior')).json.open).toBe(true);

		const seniorSees = waitFor(senior, 'session:new');
		const staffSees = waitFor(staff, 'session:new');
		const created = await h.api('POST', '/sessions', { token: t, body: { mode: 'senior' } });
		expect(created.status).toBe(200);
		expect((await seniorSees).studentEmail).toBe('ju****@korea.ac.kr'); // 학생 담당자에게는 가림
		expect((await staffSees).studentEmail).toBe('junior@korea.ac.kr');
		expect((await emit(senior, 'session:claim', { sessionId: created.json.session.id }))['ok']).toBe(true);

		// 근로장학생: 설정 변경·차단 불가 / 행정실: 가능
		const seniorToken = h.agentToken(13, '최근로', 'senior');
		const staffToken = h.agentToken(11, '정행정', 'staff');
		const hours = (await h.api('GET', '/agent/settings', { token: staffToken })).json.hours;
		expect((await h.api('PUT', '/agent/settings', { token: seniorToken, body: { hours } })).status).toBe(403);
		expect((await h.api('PUT', '/agent/settings', { token: staffToken, body: { hours: { ...hours, holidays: ['2026-10-14'] } } })).status).toBe(200);
		expect((await h.api('PUT', '/agent/settings', { token: staffToken, body: { hours: { nope: 1 } } })).status).toBe(400);
		h.clock.now = new Date('2026-10-14T10:30:00+09:00'); // 방금 휴무일로 지정한 날
		expect((await h.api('GET', '/status?mode=staff')).json.reason).toBe('holiday');
		h.clock.now = TUE_1030;

		// 차단 → 채팅 종료, 이후 인증 코드도 못 받음
		expect((await h.api('POST', '/agent/blocks', { token: seniorToken, body: { sessionId: created.json.session.id } })).status).toBe(403);
		expect((await h.api('POST', '/agent/blocks', { token: staffToken, body: { sessionId: created.json.session.id, reason: '장난' } })).status).toBe(200);
		await h.resetRateLimits();
		expect((await h.api('POST', '/email/code', { body: { email: 'junior@korea.ac.kr' } })).json.error).toBe('blocked');

		// 근로장학생 목록에는 선배 채팅만
		const list = await h.api('GET', '/agent/sessions?status=closed', { token: seniorToken });
		expect(list.json.sessions.every((s: any) => s.mode === 'senior')).toBe(true);
	});
});

describe('보안', () => {
	test('토큰 없이·다른 종류 토큰·허용 안 된 사이트에서의 연결 거부, 남의 채팅 접근 불가', async () => {
		await expect(h.connect({ kind: 'student', token: '' })).rejects.toThrow('unauthorized');
		const studentToken = await h.verifiedStudent('sec1@korea.ac.kr');
		await expect(h.connect({ kind: 'agent', token: studentToken })).rejects.toThrow('unauthorized');
		await expect(h.connect({ kind: 'student', token: h.agentToken(1, 'x', 'staff') })).rejects.toThrow('unauthorized');
		await expect(h.connect({ kind: 'student', token: studentToken }, 'http://evil.test')).rejects.toThrow();
		await expect(h.connect({ kind: 'student', token: studentToken }, 'http://allowed.test')).resolves.toBeTruthy();

		// 다른 학생의 채팅방에 들어가거나 메시지를 보낼 수 없음
		const other = await h.verifiedStudent('sec2@korea.ac.kr');
		const theirs = await h.api('POST', '/sessions', { token: other, body: { mode: 'staff' } });
		const me = await h.connect({ kind: 'student', token: studentToken });
		expect((await emit(me, 'session:join', { sessionId: theirs.json.session.id }))['error']).toBe('forbidden');
		expect((await emit(me, 'message:send', { sessionId: theirs.json.session.id, body: '안녕' }))['error']).toBe('forbidden');

		// 메일 인증 생략(개발용)은 설정이 꺼져 있으면 없음 — 기본·production에서 우회 불가
		expect((await h.api('GET', '/status?mode=staff')).json.emailVerification).toBe(true);
		expect((await h.api('POST', '/email/dev-login', { body: { email: 'skip@korea.ac.kr' } })).status).toBe(404);

		// 학생 토큰으로 담당자 API 불가
		expect((await h.api('GET', '/agent/sessions', { token: studentToken })).status).toBe(401);
	});

	test('담당자가 연결되기 전에 학생이 끝낸 채팅은 만족도를 받지 않음', async () => {
		const t = await h.verifiedStudent('norate@korea.ac.kr');
		const st = await h.connect({ kind: 'student', token: t });
		const sid = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff' } })).json.session.id as string;
		expect((await emit(st, 'session:close', { sessionId: sid }))['ok']).toBe(true);
		expect((await h.api('POST', `/sessions/${sid}/rating`, { token: t, body: { rating: 5 } })).status).toBe(400);
	});

	test('다른 종류 채팅으로 바꿀 때: 진행 중인 채팅을 HTTP로 종료 → 새 채팅 가능, 남의 채팅은 못 끔', async () => {
		const t = await h.verifiedStudent('switch@korea.ac.kr');
		const first = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff' } })).json.session.id as string;
		expect((await h.api('GET', '/me', { token: t })).json.session.mode).toBe('staff');
		const other = await h.verifiedStudent('switch-other@korea.ac.kr');
		expect((await h.api('POST', `/sessions/${first}/close`, { token: other })).status).toBe(403);
		expect((await h.api('POST', `/sessions/${first}/close`, { token: t })).status).toBe(200);
		expect((await h.api('GET', '/me', { token: t })).json.session).toBeNull();
	});
});

describe('안 읽은 메시지 · 홈 요약', () => {
	test('담당자가 다른 화면에 있거나 새로고침해도 안 읽은 수가 정확함', async () => {
		const token = h.agentToken(31, '한행정', 'staff');
		const agent = await h.connect({ kind: 'agent', token });
		const t = await h.verifiedStudent('unread@korea.ac.kr');
		const st = await h.connect({ kind: 'student', token: t });
		const sid = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff' } })).json.session.id as string;

		let sum = (await h.api('GET', '/agent/summary', { token })).json;
		expect(sum.waiting.some((s: any) => s.id === sid)).toBe(true);

		await emit(agent, 'session:claim', { sessionId: sid });
		await emit(st, 'message:send', { sessionId: sid, body: '첫 번째 질문' });
		await emit(st, 'message:send', { sessionId: sid, body: '두 번째 질문' });

		sum = (await h.api('GET', '/agent/summary', { token })).json;
		const mine = sum.mine.find((s: any) => s.id === sid);
		expect(mine.unread).toBe(2);
		expect(mine.lastMessage.body).toBe('두 번째 질문');
		expect(sum.unread).toBe(2);

		// 담당자가 새로고침(다시 연결)해도 내가 맡은 채팅의 새 메시지를 받음
		agent.disconnect();
		const again = await h.connect({ kind: 'agent', token });
		await new Promise((r) => setTimeout(r, 200)); // 연결 직후 방 다시 들어가기
		const got = waitFor(again, 'message', (m) => m.body === '세 번째 질문');
		await emit(st, 'message:send', { sessionId: sid, body: '세 번째 질문' });
		await got;

		// 채팅을 열면 읽음 → 0
		await emit(again, 'session:join', { sessionId: sid });
		expect((await h.api('GET', '/agent/summary', { token })).json.unread).toBe(0);

		// 열어 둔 채 새 메시지 → session:read로 읽음 유지
		await emit(st, 'message:send', { sessionId: sid, body: '네 번째' });
		again.emit('session:read', { sessionId: sid });
		await new Promise((r) => setTimeout(r, 150));
		expect((await h.api('GET', '/agent/summary', { token })).json.unread).toBe(0);
	});
});

describe('자동 번역 (한국어 ↔ 영어)', () => {
	test('영어로 물으면 담당자에게 한국어로, 담당자의 한국어 답변은 학생에게 영어로', async () => {
		const token = h.agentToken(41, '윤행정', 'staff');
		const agent = await h.connect({ kind: 'agent', token });
		const t = await h.verifiedStudent('intl@korea.ac.kr');
		const st = await h.connect({ kind: 'student', token: t });
		const sid = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff', language: 'EN' } })).json.session.id as string;
		await emit(agent, 'session:claim', { sessionId: sid });

		// 학생 영어 → 원문 먼저, 곧 한국어 번역이 덧붙음
		const tr1 = waitFor(agent, 'message:translated');
		const sent = await emit<any>(st, 'message:send', { sessionId: sid, body: 'When is the course registration period?' });
		expect(sent.message.translation).toBeNull();
		expect(await tr1).toMatchObject({ id: sent.message.id, translation: { lang: 'ko', text: '[ko] When is the course registration period?' } });

		// 담당자 한국어 → 학생에게 영어 번역
		const tr2 = waitFor(st, 'message:translated');
		const reply = await emit<any>(agent, 'message:send', { sessionId: sid, body: '수강신청은 8월 11일부터예요.' });
		expect(await tr2).toMatchObject({ id: reply.message.id, translation: { lang: 'en', text: '[en] 수강신청은 8월 11일부터예요.' } });

		// 다시 열어도 번역이 남아 있음 / 학생 언어가 기록됨
		const joined = await emit<any>(agent, 'session:join', { sessionId: sid });
		expect(joined.session.studentLang).toBe('en');
		expect(joined.messages.find((m: any) => m.id === sent.message.id).translation.lang).toBe('ko');

		// 영어 화면 학생이 중간에 한국어로 써도 담당자 답변은 계속 영어로
		await emit(st, 'message:send', { sessionId: sid, body: '행정실은 어디에 있나요?' });
		const tr3 = waitFor(st, 'message:translated');
		const reply2 = await emit<any>(agent, 'message:send', { sessionId: sid, body: '정보관 1층에 있어요.' });
		expect(await tr3).toMatchObject({ id: reply2.message.id, translation: { lang: 'en' } });
	});

	test('한국어로 묻는 학생과의 대화는 번역하지 않음', async () => {
		const token = h.agentToken(42, '서행정', 'staff');
		const agent = await h.connect({ kind: 'agent', token });
		const t = await h.verifiedStudent('local@korea.ac.kr');
		const st = await h.connect({ kind: 'student', token: t });
		const sid = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff' } })).json.session.id as string;
		await emit(agent, 'session:claim', { sessionId: sid });
		const quiet = expectSilence(agent, 'message:translated');
		const quiet2 = expectSilence(st, 'message:translated');
		await emit(st, 'message:send', { sessionId: sid, body: '수강신청 언제예요?' });
		await emit(agent, 'message:send', { sessionId: sid, body: '8월 11일부터예요.' });
		await quiet;
		await quiet2;
	});
});

describe('다른 담당자가 대신 답할 때', () => {
	test('맡지 않은 행정실이 처음 답하면 "행정실 담당자가 연결되었어요" 한 번만 (누군지는 담당자 화면에만)', async () => {
		const owner = await h.connect({ kind: 'agent', token: h.agentToken(61, '담당행정', 'staff') });
		const helper = await h.connect({ kind: 'agent', token: h.agentToken(62, '도움행정', 'staff') });
		const t = await h.verifiedStudent('help@korea.ac.kr');
		const st = await h.connect({ kind: 'student', token: t });
		const sid = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff' } })).json.session.id as string;
		await emit(owner, 'session:claim', { sessionId: sid });
		await emit(helper, 'session:join', { sessionId: sid });
		const joined = waitFor<any>(st, 'message', (m) => m.sender === 'system' && m.senderName === '도움행정');
		await emit(helper, 'message:send', { sessionId: sid, body: '제가 이어서 도와드릴게요.' });
		expect((await joined).body).toBe('행정실 담당자가 연결되었어요.'); // 학생에게는 이름 대신 역할
		await emit(helper, 'message:send', { sessionId: sid, body: '학번을 알려주세요.' });
		await emit(owner, 'message:send', { sessionId: sid, body: '감사합니다.' }); // 담당자는 안내 없음
		const sys = (await h.chat.service.listMessages(sid)).filter((m) => m.sender === 'system').map((m) => m.senderName);
		expect(sys.filter((b) => b === '도움행정')).toHaveLength(1);
		expect(sys.filter((b) => b === '담당행정')).toHaveLength(1); // 시작할 때 한 번
	});
});

describe('메시지 수정·삭제 (본인, 5분 안)', () => {
	test('고치면 양쪽에 바로 반영·수정됨 표시, 지우면 내용·첨부가 실제로 사라짐, 남의 것·5분 지난 것·끝난 채팅은 불가', async () => {
		const agent = await h.connect({ kind: 'agent', token: h.agentToken(51, '정행정', 'staff') });
		const t = await h.verifiedStudent('edit@korea.ac.kr');
		const st = await h.connect({ kind: 'student', token: t });
		const sid = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff' } })).json.session.id as string;
		await emit(agent, 'session:claim', { sessionId: sid });
		const sent = await emit<any>(st, 'message:send', { sessionId: sid, body: '학번은 2024000000이에요' });
		const id = sent.message.id as number;

		// 고치기 → 담당자 화면에 바로
		const updated = waitFor<any>(agent, 'message:updated', (m) => m.id === id);
		expect((await emit<any>(st, 'message:edit', { messageId: id, body: '학번은 2024000001이에요' })).ok).toBe(true);
		expect(await updated).toMatchObject({ body: '학번은 2024000001이에요', removed: false });
		expect((await updated).editedAt).toBeTruthy();
		// 고친 글도 욕설 검사
		expect((await emit<any>(st, 'message:edit', { messageId: id, body: '시발 왜 안돼' })).error).toBe('moderated');
		// 남의 메시지는 못 고치고 못 지움
		expect((await emit<any>(agent, 'message:edit', { messageId: id, body: '바꿈' })).error).toBe('forbidden');
		expect((await emit<any>(agent, 'message:remove', { messageId: id })).error).toBe('forbidden');

		// 지우기 → 내용 없음, DB에도 원문 없음
		const removed = waitFor<any>(agent, 'message:updated', (m) => m.id === id && m.removed);
		expect((await emit<any>(st, 'message:remove', { messageId: id })).ok).toBe(true);
		expect((await removed).body).toBe('');
		const [rows] = await h.chat.service.pool.query<any[]>(`SELECT body, removed_at FROM chat_messages WHERE id = ?`, [id]);
		expect(rows[0].body).toBe('');
		expect(rows[0].removed_at).toBeTruthy();
		expect((await emit<any>(st, 'message:edit', { messageId: id, body: '다시' })).error).toBe('removed');

		// 첨부를 지우면 파일·첨부 기록도 지움
		const up = await upload(t, sid, await photo(), 'id-card.jpg', 'image/jpeg');
		const fileMsg = up.json.message;
		expect((await emit<any>(st, 'message:edit', { messageId: fileMsg.id, body: '글로 바꿈' })).error).toBe('not_editable');
		expect((await emit<any>(st, 'message:remove', { messageId: fileMsg.id })).ok).toBe(true);
		const [att] = await h.chat.service.pool.query<any[]>(`SELECT id FROM chat_attachments WHERE id = ?`, [fileMsg.attachment.id]);
		expect(att).toHaveLength(0);
		const listed = (await h.chat.service.listMessages(sid)).find((m) => m.id === fileMsg.id)!;
		expect(listed).toMatchObject({ removed: true, attachment: null });

		// 5분 지나면 불가
		const late = await emit<any>(agent, 'message:send', { sessionId: sid, body: '확인했어요' });
		await h.chat.service.pool.query(`UPDATE chat_messages SET created_at = NOW(3) - INTERVAL 6 MINUTE WHERE id = ?`, [late.message.id]);
		expect((await emit<any>(agent, 'message:edit', { messageId: late.message.id, body: '확인했습니다' })).error).toBe('edit_expired');

		// 끝난 채팅은 불가
		const fresh = await emit<any>(agent, 'message:send', { sessionId: sid, body: '감사합니다' });
		await emit(agent, 'session:close', { sessionId: sid });
		expect((await emit<any>(agent, 'message:remove', { messageId: fresh.message.id })).error).toBe('closed');
	});
});

describe('보관 기간', () => {
	test('첨부 90일, 대화 1년이 지나면 자동 삭제', async () => {
		const pool = h.chat.service.pool;
		const t = await h.verifiedStudent('old@korea.ac.kr');
		const staff = await h.connect({ kind: 'agent', token: h.agentToken(21, '오행정', 'staff') });
		const s = (await h.api('POST', '/sessions', { token: t, body: { mode: 'staff' } })).json.session.id as string;
		await emit(staff, 'session:claim', { sessionId: s });
		const up = await upload(t, s, await photo(), 'old.jpg', 'image/jpeg');
		const aid = up.json.message.attachment.id as string;

		// 첨부가 91일 지남 → 파일은 지우고 기록에는 "삭제됨"(링크 없음)
		await pool.query(`UPDATE chat_attachments SET created_at = NOW() - INTERVAL 91 DAY WHERE id = ?`, [aid]);
		expect((await h.chat.service.runRetention()).files).toBe(1);
		const msgs = await h.chat.service.listMessages(s);
		expect(msgs.find((m) => m.attachment?.id === aid)?.attachment?.url).toBeNull();

		// 종료 후 1년 지난 채팅은 통째로 삭제
		await emit(staff, 'session:close', { sessionId: s });
		await pool.query(`UPDATE chat_sessions SET closed_at = NOW() - INTERVAL 366 DAY WHERE id = ?`, [s]);
		expect((await h.chat.service.runRetention()).sessions).toBe(1);
		expect(await h.chat.service.getSessionRow(s)).toBeNull();
		const [left] = await pool.query<any[]>(`SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?`, [s]);
		expect(Number(left[0].n)).toBe(0);
	});
});
