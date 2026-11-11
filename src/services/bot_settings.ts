/**
 * 챗봇 설정 (관리자 사이트 > 관리 > 챗봇 설정) — 답변 자유도·주변 장소·학식·과다 사용 기준
 *
 * 채팅 DB(chat_settings, name='bot')에 JSON 하나로 저장. 저장된 값이 없거나 이상하면 아래 기본값
 * (= 설정 화면을 만들기 전까지 코드에 박혀 있던 값). 범위를 벗어난 값은 끝값으로 맞춤 — 잘못 적어도 봇이 멈추지 않게.
 * 질문마다 DB를 읽지 않도록 메모리에 두고 15초마다 새로 읽음 (서버 한 대라 저장하면 바로 반영, 그 외에도 15초 안에)
 */
export type BotSettings = {
	// 답변
	temperature: number; // 답변 자유도 — 낮을수록 근거 그대로, 높을수록 표현이 자유로움
	maxTokens: number; // 최대 답변 길이 (토큰)
	// 답변 아래 '이어서 물어볼 만한 질문'
	recCount: number; // 칩 수 (0 = 안 보임)
	recBreadth: number; // 자유도 — 0: 이번 질문과 확실히 이어지는 것만, 1: 조금 먼 주제까지
	// 주변 장소 (카카오맵)
	placeEnabled: boolean;
	placeRadiusM: number;
	placeSize: number;
	blockFarPlace: boolean; // 학교 밖 다른 지역·내 위치 주변 장소 질문 막기
	// 학식
	menuEnabled: boolean;
	// 웹 검색 — 학교 자료에서 못 찾았을 때만 (OpenAI web_search, 1,000번에 약 $10)
	webSearchEnabled: boolean;
	webSearchWide: boolean; // true: 웹 전체(유튜브·블로그 포함), false: 학교 사이트(korea.ac.kr)만
	webSearchDaily: number; // 하루 최대 검색 수 (0 = 안 함)
	// 대학원 — 끄면 학부 기준으로만 답함 (학생 화면의 학부/대학원 스위치도 숨김)
	gradEnabled: boolean;
	// 호빗 캐릭터 (학생 화면 시작 화면) — 움직이기 켜기·끄기, 가만히 두면 졸기까지 시간
	mascotEnabled: boolean;
	mascotIdleSec: number;
	// 과다 사용
	sessionPerMin: number;
	sessionPerDay: number;
	ipPerMin: number;
	ipPerDay: number;
	maxQuestionChars: number;
	dailyCharBudget: number;
	repeatNoticeAt: number;
	repeatStrikeAt: number;
	meaninglessStrikeAt: number;
	warnLimit: number;
	suspendMinutes: [number, number, number]; // 경고가 warnLimit번·+1번·+2번 이상일 때 정지 시간 (분)
	blockPersonalUse: boolean; // 코드·과제·번역 같은 개인 AI 용도 질문 막기
};

type NumKey = { [K in keyof BotSettings]: BotSettings[K] extends number ? K : never }[keyof BotSettings];
type BoolKey = { [K in keyof BotSettings]: BotSettings[K] extends boolean ? K : never }[keyof BotSettings];

export const DEFAULT_BOT_SETTINGS: BotSettings = {
	temperature: 0.3,
	maxTokens: 2000,
	recCount: 3,
	recBreadth: 0.5,
	placeEnabled: true,
	placeRadiusM: 1200,
	placeSize: 8,
	blockFarPlace: true,
	menuEnabled: true,
	webSearchEnabled: false,
	webSearchWide: true,
	webSearchDaily: 300,
	gradEnabled: true,
	mascotEnabled: true,
	mascotIdleSec: 30,
	sessionPerMin: 20,
	sessionPerDay: 300,
	ipPerMin: 120,
	ipPerDay: 3000,
	maxQuestionChars: 2000,
	dailyCharBudget: 20_000,
	repeatNoticeAt: 3,
	repeatStrikeAt: 6,
	meaninglessStrikeAt: 5,
	warnLimit: 3,
	suspendMinutes: [10, 60, 1440],
	blockPersonalUse: true,
};

/** 숫자 칸의 범위 (설정 화면도 이 값을 받아 슬라이더·입력 칸 범위로 씀) */
export const BOT_SETTING_LIMITS: Record<NumKey, { min: number; max: number; step: number }> = {
	temperature: { min: 0, max: 1, step: 0.1 },
	maxTokens: { min: 300, max: 3000, step: 100 },
	recCount: { min: 0, max: 5, step: 1 },
	recBreadth: { min: 0, max: 1, step: 0.1 },
	mascotIdleSec: { min: 10, max: 600, step: 5 },
	placeRadiusM: { min: 300, max: 3000, step: 100 },
	placeSize: { min: 3, max: 15, step: 1 },
	webSearchDaily: { min: 0, max: 3000, step: 10 }, // 카카오 검색 한 번에 최대 15개
	sessionPerMin: { min: 3, max: 100, step: 1 },
	sessionPerDay: { min: 20, max: 3000, step: 10 },
	ipPerMin: { min: 10, max: 1000, step: 10 }, // 학교 와이파이는 여러 학생이 IP 하나를 같이 씀
	ipPerDay: { min: 100, max: 30_000, step: 100 },
	maxQuestionChars: { min: 200, max: 4000, step: 100 },
	dailyCharBudget: { min: 2000, max: 200_000, step: 1000 },
	repeatNoticeAt: { min: 2, max: 10, step: 1 },
	repeatStrikeAt: { min: 3, max: 20, step: 1 },
	meaninglessStrikeAt: { min: 2, max: 20, step: 1 },
	warnLimit: { min: 2, max: 10, step: 1 },
};
export const SUSPEND_MINUTES_LIMIT = { min: 1, max: 10_080, step: 1 }; // 최대 7일

const NUM_KEYS = Object.keys(BOT_SETTING_LIMITS) as NumKey[];
const BOOL_KEYS: BoolKey[] = ['placeEnabled', 'blockFarPlace', 'menuEnabled', 'webSearchEnabled', 'webSearchWide', 'gradEnabled', 'mascotEnabled', 'blockPersonalUse'];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const roundStep = (v: number, step: number) => (step < 1 ? Math.round(v * 100) / 100 : Math.round(v));

/**
 * 저장된 값·화면에서 보낸 값 → 쓸 수 있는 설정. 없는 칸은 base(기본: 기본값)에서, 숫자는 범위 안으로.
 * 객체가 아니면 null (화면에서 보낸 값이 잘못됨)
 */
export function parseBotSettings(raw: unknown, base: BotSettings = DEFAULT_BOT_SETTINGS): BotSettings | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const out: BotSettings = { ...base, suspendMinutes: [...base.suspendMinutes] as BotSettings['suspendMinutes'] };
	for (const k of NUM_KEYS) {
		const v = typeof r[k] === 'string' && r[k] !== '' ? Number(r[k]) : r[k];
		if (typeof v !== 'number' || !Number.isFinite(v)) continue;
		const { min, max, step } = BOT_SETTING_LIMITS[k];
		out[k] = clamp(roundStep(v, step), min, max);
	}
	for (const k of BOOL_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
	if (Array.isArray(r['suspendMinutes'])) {
		const { min, max } = SUSPEND_MINUTES_LIMIT;
		const s = r['suspendMinutes'];
		out.suspendMinutes = [0, 1, 2].map((i) => {
			const v = Number(s[i]);
			return Number.isFinite(v) ? clamp(Math.round(v), min, max) : base.suspendMinutes[i];
		}) as BotSettings['suspendMinutes'];
	}
	// 앞뒤가 맞게 — 경고는 안내보다 늦게, 정지 시간은 단계마다 같거나 길게
	if (out.repeatStrikeAt <= out.repeatNoticeAt) out.repeatStrikeAt = Math.min(BOT_SETTING_LIMITS.repeatStrikeAt.max, out.repeatNoticeAt + 1);
	out.suspendMinutes[1] = Math.max(out.suspendMinutes[1], out.suspendMinutes[0]);
	out.suspendMinutes[2] = Math.max(out.suspendMinutes[2], out.suspendMinutes[1]);
	return out;
}

// ── 지금 쓰는 값 (메모리) ─────────────────────────────────
const CACHE_MS = 15_000;
let current: BotSettings = DEFAULT_BOT_SETTINGS;
let loadedAt = 0;
let loader: (() => Promise<unknown>) | null = null;
let inflight: Promise<BotSettings> | null = null;

/** 지금 쓰는 설정 (동기) — 채팅 DB가 없거나 아직 못 읽었으면 기본값 */
export const currentBotSettings = (): BotSettings => current;

/** 저장 직후 바로 반영 */
export function setCurrentBotSettings(s: BotSettings) {
	current = s;
	loadedAt = Date.now();
}

/** 채팅 DB가 준비되면 읽는 함수를 등록 (chat/index.ts) */
export function registerBotSettingsLoader(fn: () => Promise<unknown>) {
	loader = fn;
	loadedAt = 0;
}

/** 15초 지났으면 DB에서 다시 읽음 — 실패하면 쓰던 값 그대로 (질문 답변이 멈추지 않게) */
export async function refreshBotSettings(): Promise<BotSettings> {
	if (!loader || Date.now() - loadedAt < CACHE_MS) return current;
	if (!inflight) {
		inflight = loader()
			.then((raw) => {
				setCurrentBotSettings(parseBotSettings(raw) ?? DEFAULT_BOT_SETTINGS);
				return current;
			})
			.catch((e) => {
				console.error('[bot-settings] 불러오기 실패 — 쓰던 값 유지:', (e as Error).message);
				loadedAt = Date.now(); // 실패해도 15초는 다시 시도하지 않음
				return current;
			})
			.finally(() => {
				inflight = null;
			});
	}
	return inflight;
}

/** 테스트용 */
export function resetBotSettings() {
	current = DEFAULT_BOT_SETTINGS;
	loadedAt = 0;
	loader = null;
	inflight = null;
}

/** RAG /chat·/chat/stream에 함께 보내는 값 (RAG도 범위를 한 번 더 확인) */
export const ragBotOptions = (s: BotSettings) => ({
	temperature: s.temperature,
	max_tokens: s.maxTokens,
	place_enabled: s.placeEnabled,
	place_radius_m: s.placeRadiusM,
	place_size: s.placeSize,
	menu_enabled: s.menuEnabled,
	rec_count: s.recCount,
	web_search: s.webSearchEnabled,
	web_search_wide: s.webSearchWide,
	web_search_daily: s.webSearchDaily,
	rec_breadth: s.recBreadth,
});
