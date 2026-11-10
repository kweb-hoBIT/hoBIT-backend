// 챗봇 설정 — 기본값·범위 맞추기, 질문 검사가 넘겨받은 기준을 쓰는지 (DB 없이)
import {
	DEFAULT_BOT_SETTINGS,
	parseBotSettings,
	ragBotOptions,
	refreshBotSettings,
	registerBotSettingsLoader,
	resetBotSettings,
	currentBotSettings,
	BotSettings,
} from '../../src/services/bot_settings';
import { detectPersonalUse, resetAbuseRecords, screenQuestion, suspendMs } from '../../src/middleware/abuse';
import { questionLimited } from '../../src/middleware/question_limit';

const MIN = 60_000;
const never = () => false;
const withS = (patch: Partial<BotSettings>): BotSettings => ({ ...DEFAULT_BOT_SETTINGS, ...patch });

describe('설정 읽기', () => {
	test('빈 값은 기본값, 객체가 아니면 null', () => {
		expect(parseBotSettings({})).toEqual(DEFAULT_BOT_SETTINGS);
		expect(parseBotSettings(null)).toBeNull();
		expect(parseBotSettings('x')).toBeNull();
		expect(parseBotSettings([1, 2])).toBeNull();
	});

	test('범위를 벗어난 숫자는 끝값으로, 이상한 값은 무시', () => {
		const s = parseBotSettings({ temperature: 5, maxTokens: 10, placeRadiusM: 99999, placeSize: 0, warnLimit: 'abc', sessionPerMin: NaN, menuEnabled: 'no' })!;
		expect(s.temperature).toBe(1);
		expect(s.maxTokens).toBe(300);
		expect(s.placeRadiusM).toBe(3000);
		expect(s.placeSize).toBe(3);
		expect(s.warnLimit).toBe(DEFAULT_BOT_SETTINGS.warnLimit);
		expect(s.sessionPerMin).toBe(DEFAULT_BOT_SETTINGS.sessionPerMin);
		expect(s.menuEnabled).toBe(true);
	});

	test('숫자 문자열·소수 정리, 켜기/끄기', () => {
		const s = parseBotSettings({ temperature: '0.456', maxTokens: 1234.6, placeEnabled: false, blockPersonalUse: false })!;
		expect(s.temperature).toBe(0.46);
		expect(s.maxTokens).toBe(1235);
		expect(s.placeEnabled).toBe(false);
		expect(s.blockPersonalUse).toBe(false);
	});

	test('앞뒤가 맞게 — 반복 경고는 안내보다 늦게, 정지 시간은 단계마다 같거나 길게', () => {
		const s = parseBotSettings({ repeatNoticeAt: 5, repeatStrikeAt: 4, suspendMinutes: [30, 5, 0] })!;
		expect(s.repeatStrikeAt).toBe(6);
		expect(s.suspendMinutes).toEqual([30, 30, 30]);
	});

	test('없는 칸은 base(지금 값)에서 — 바꾼 칸만 보내도 됨', () => {
		const base = withS({ temperature: 0.8 });
		expect(parseBotSettings({ maxTokens: 1000 }, base)).toEqual({ ...base, maxTokens: 1000 });
	});

	test('RAG로 보내는 값', () => {
		expect(ragBotOptions(DEFAULT_BOT_SETTINGS)).toEqual({
			temperature: 0.3, max_tokens: 2000, place_enabled: true, place_radius_m: 1200, place_size: 8, menu_enabled: true,
		});
	});

	test('DB에서 읽어 메모리에 — 실패하면 쓰던 값 유지', async () => {
		resetBotSettings();
		registerBotSettingsLoader(async () => ({ temperature: 0.7 }));
		expect((await refreshBotSettings()).temperature).toBe(0.7);
		expect(currentBotSettings().temperature).toBe(0.7);
		resetBotSettings();
		registerBotSettingsLoader(async () => {
			throw new Error('db down');
		});
		const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(await refreshBotSettings()).toEqual(DEFAULT_BOT_SETTINGS);
		err.mockRestore();
		resetBotSettings();
	});
});

describe('질문 검사가 설정을 따름', () => {
	beforeEach(() => resetAbuseRecords());
	const ip = '10.9.0.1';

	test('기본 정지 단계는 그대로, 바꾸면 바뀐 기준', () => {
		expect([1, 2, 3, 4, 5].map((n) => suspendMs(n))).toEqual([0, 0, 10 * MIN, 60 * MIN, 1440 * MIN]);
		const s = withS({ warnLimit: 2, suspendMinutes: [1, 2, 3] });
		expect([1, 2, 3, 4, 9].map((n) => suspendMs(n, s))).toEqual([0, MIN, 2 * MIN, 3 * MIN, 3 * MIN]);
	});

	test('최대 질문 길이', () => {
		const s = withS({ maxQuestionChars: 300 });
		const g = screenQuestion({ text: '가'.repeat(301), ip, sessionId: 'len-1', now: 1, limited: never, settings: s });
		expect(g?.moderation.reason).toBe('too_long');
		expect(g?.message.ko).toContain('300자');
		// 2배(600자) 넘으면 경고까지
		expect(screenQuestion({ text: '가'.repeat(601), ip, sessionId: 'len-1', now: 2, limited: never, settings: s })?.moderation.level).toBe('warning');
		expect(screenQuestion({ text: '가'.repeat(301), ip, sessionId: 'len-2', now: 3, limited: never })).toBeNull();
	});

	test('경고 몇 번에 정지 — 경고 문구도 n/한도', () => {
		const s = withS({ warnLimit: 2, suspendMinutes: [5, 5, 5] });
		const first = screenQuestion({ text: "' or 1=1 --", ip, sessionId: 'warn-1', now: 1000, limited: never, settings: s });
		expect(first?.message.ko).toContain('경고 1/2');
		const second = screenQuestion({ text: "' or 1=1 --", ip, sessionId: 'warn-1', now: 2000, limited: never, settings: s });
		expect(second?.moderation.level).toBe('suspended');
		expect(second?.moderation.retry_after_sec).toBe(300);
	});

	test('같은 질문 반복 안내·경고 횟수', () => {
		const s = withS({ repeatNoticeAt: 2, repeatStrikeAt: 3 });
		const r = [1, 2, 3].map((i) => screenQuestion({ text: '졸업요건 알려줘', ip, sessionId: 'rep-1', now: 5000 + i, limited: never, settings: s }));
		expect(r[0]).toBeNull();
		expect(r[1]?.moderation.reason).toBe('repeat');
		expect(r[2]?.moderation.level).toBe('warning');
	});

	test('하루 글자 수 합', () => {
		const s = withS({ dailyCharBudget: 2000 });
		const q = (i: number) => screenQuestion({ text: `${i}번 ${'가'.repeat(900)}`, ip, sessionId: 'day-1', now: 9000 + i * MIN, limited: never, settings: s });
		expect(q(1)).toBeNull();
		expect(q(2)).toBeNull();
		expect(q(3)?.moderation.reason).toBe('daily_budget');
	});

	test('개인 AI 용도·학교 밖 지역 막기 끄기', () => {
		expect(detectPersonalUse('파이썬으로 정렬 코드 짜줘')).toBe('code');
		expect(detectPersonalUse('파이썬으로 정렬 코드 짜줘', withS({ blockPersonalUse: false }))).toBeNull();
		expect(detectPersonalUse('강남역 맛집 추천해줘')).toBe('far_place');
		expect(detectPersonalUse('강남역 맛집 추천해줘', withS({ blockFarPlace: false }))).toBeNull();
		expect(detectPersonalUse('강남역 맛집 추천해줘', withS({ blockPersonalUse: false }))).toBe('far_place');
	});

	test('세션 1분 질문 수', () => {
		const s = withS({ sessionPerMin: 3 });
		const r = [1, 2, 3, 4].map((i) => questionLimited('10.9.0.2', 'rate-1', 50_000 + i, s));
		expect(r).toEqual([false, false, false, true]);
	});
});
