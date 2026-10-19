import { checkRules, moderate } from '../../src/chat/moderation';

describe('메시지 욕설 검사', () => {
	test.each([
		'시발 왜 안돼요',
		'씨 발',
		'시1발',
		'ㅅㅂ 답답하네',
		'ㅅ.ㅂ',
		'ㅆ*ㅂ', // 기호를 끼워도 규칙으로 잡음
		'병신같은 시스템',
		'개새끼야',
		'존나 느려요',
		'꺼져',
		'ㅗ',
		'what the fuck',
		'this is shit',
		'ㅈ같네', // korcen 사전
		'좆같네',
		'느금마',
	])('막음: %s', (text) => {
		expect(checkRules(text).blocked).toBe(true);
	});

	test.each([
		'질병 신청서는 어디서 받나요?', // 띄어쓰기를 지우면 '병신'이 생기는 문장
		'질병신청 기간 알려주세요',
		'컴퓨터가 꺼져 있어요',
		'어제 잠을 자지 못했어요',
		'그 공지는 보지 못했어요',
		'시바견 키워도 되나요',
		'수강신청 언제예요?',
		'행정실 응대가 너무 불친절해서 실망했어요', // 정당한 불만은 막지 않음
		'Is the dictionary allowed in the exam?',
		'성적 정정 기간이 언제인가요?',
		'휴학 병 신청',
		'시발점이 어디예요',
		'병원 진단서 제출해야 하나요',
	])('보냄: %s', (text) => {
		expect(checkRules(text).blocked).toBe(false);
	});

	test.each(['ㅋㅋㅋㅋㅋㅋㅋ', 'ㅋㅋㅋ', 'ㅉㅉ', 'ㅡㅡ', ';;;', 'ㅎㅎㅎㅎㅎ'])('조롱 글자만 → 규칙으로 막음: %s', async (text) => {
		expect(checkRules(text).rude).toBe(true);
		await expect(moderate(text)).resolves.toEqual({ allowed: false, reason: 'rude' });
	});

	test.each(['ㅋㅋㅋㅋ 일 잘하네', '어이없네 진짜', '월급 받고 이것도 못 해요?', '잘~하시네요', '장난하세요?'])(
		'비꼼일 수 있음 → LLM이 판단: %s',
		async (text) => {
			expect(checkRules(text).suspicious).toBe(true);
			const llm = jest.fn(async () => true);
			await expect(moderate(text, llm)).resolves.toEqual({ allowed: false, reason: 'llm' });
			expect(llm).toHaveBeenCalledTimes(1);
		}
	);

	test.each(['감사합니다 ㅎㅎ', '네 알겠습니다!', '혹시 수강신청 기간이 언제인가요?', '?', 'ㅎㅎ'])('평범한 메시지는 모델을 부르지 않고 보냄: %s', async (text) => {
		const llm = jest.fn(async () => true);
		await expect(moderate(text, llm)).resolves.toEqual({ allowed: true });
		expect(llm).not.toHaveBeenCalled();
	});

	test('가려 쓴 욕설은 규칙으로 확정 못 함 → LLM에만 물어봄', async () => {
		const llm = jest.fn(async () => true);
		expect(checkRules('시** 진짜').suspicious).toBe(true);
		await expect(moderate('시** 진짜', llm)).resolves.toEqual({ allowed: false, reason: 'llm' });
		expect(llm).toHaveBeenCalledTimes(1);
	});

	test('평범한 메시지는 LLM을 부르지 않음 (지연·비용 없음)', async () => {
		const llm = jest.fn(async () => true);
		await expect(moderate('졸업 요건 문의드려요', llm)).resolves.toEqual({ allowed: true });
		expect(llm).not.toHaveBeenCalled();
	});

	test('LLM이 실패해도 채팅은 막지 않음', async () => {
		await expect(moderate('시** 진짜', async () => Promise.reject(new Error('down')))).resolves.toEqual({ allowed: true });
	});
});
