import { isMeaningless, screenQuestion, DAILY_CHAR_BUDGET } from '../../src/middleware/abuse';

const never = () => false;

describe('뜻 없는 입력', () => {
	it.each(['ㅋㅋㅋㅋ', 'ㅁㄴㅇㄹ', '!!!!', '?', '1111', '아아아아아아아', 'asdfasdf', 'qwerty', 'sdfgh'])('막음: %s', (q) =>
		expect(isMeaningless(q)).toBe(true));
	it.each(['졸업요건 알려줘', 'CS 졸업요건', 'AI학과', 'html css', 'what is KUPID', '졸업요건ㅋㅋㅋㅋㅋㅋ', '24학번', 'ㅇㅋ 고마워', 'LMS 어디야'])(
		'통과: %s', (q) => expect(isMeaningless(q)).toBe(false));
});

describe('같은 질문 반복·하루 사용량', () => {
	const ip = '10.9.8.7';
	it('같은 질문 3번째부터 안내, 6번째 경고', () => {
		const sid = 'repeat-1';
		const t0 = 1_800_000_000_000;
		const r = [1, 2, 3, 4, 5, 6].map((i) => screenQuestion({ text: '졸업요건 알려줘?', ip, sessionId: sid, now: t0 + i * 1000, limited: never }));
		expect(r[0]).toBeNull();
		expect(r[1]).toBeNull();
		expect(r[2]?.moderation.reason).toBe('repeat');
		expect(r[5]?.moderation.level).toBe('warning');
	});
	it('다른 질문은 막지 않음', () => {
		const t0 = 1_800_000_100_000;
		const qs = ['졸업요건 알려줘', '휴학 신청 방법', '장학금 공지', '수강신청 언제야'];
		qs.forEach((q, i) => expect(screenQuestion({ text: q, ip, sessionId: 'repeat-2', now: t0 + i, limited: never })).toBeNull());
	});
	it('하루 글자 수를 넘으면 그날은 안내만', () => {
		const t0 = 1_800_000_200_000;
		const long = '가'.repeat(1900);
		let blocked = null;
		for (let i = 0; i < Math.ceil(DAILY_CHAR_BUDGET / 1900) + 2 && !blocked; i++) {
			blocked = screenQuestion({ text: `${i}번 ${long}`, ip, sessionId: 'budget-1', now: t0 + i * 60_000, limited: never });
		}
		expect(blocked?.moderation.reason).toBe('daily_budget');
	});
	it('서버 안(localhost) 질문은 반복해도 막지 않음', () => {
		const r = [1, 2, 3, 4].map((i) => screenQuestion({ text: '오늘 학식 뭐야?', ip: '127.0.0.1', sessionId: 'local', now: 1_800_000_300_000 + i, limited: never }));
		expect(r.every((x) => x === null)).toBe(true);
	});
});
