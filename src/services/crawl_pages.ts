/**
 * 정기 수집 설정 (관리자 사이트 > 챗봇 설정 > 정기 수집) — 채팅 DB chat_settings, name='crawl' 한 줄
 *
 * - schedule: 언제 돌릴지. 서버 crontab은 5분마다 `beta.sh crawl-tick` 하나만 두고, 그때마다 이 값을 받아
 *   지금 돌릴 수집을 정함 (deploy/beta/crawl_tick.py) → 화면에서 바꾸면 다음 5분 안에 적용
 * - sources: 기본 수집 대상 켜기·끄기. 끄면 정기 수집 때 다시 받지 않음 (이미 모은 자료는 그대로 답변에 쓰임)
 * - pages: 관리자가 더한 학교 페이지 (전체 수집 때 본문을 읽어 색인, RAG collector/custom_pages.py)
 * 학교 밖 사이트는 받지 않음 — 챗봇은 학교 안내만 답함 (고파스·커뮤니티 등은 넣지 않기로 함)
 */
export type CrawlPage = { url: string; title: string; enabled: boolean };
export type CrawlSchedule = {
	quickMin: number; // 새 공지 확인 간격 (분, 0 = 끔)
	boardsHours: number; // 게시판 전체 수집 간격 (시간, 매시 20분, 0 = 끔)
	allTime: string; // 매일 전체 수집 시각 'HH:MM' ('' = 끔)
	recDay: number; // 추천 질문 점검 요일 (0 = 일요일 … 6, -1 = 끔)
	recTime: string; // 추천 질문 점검 시각
};
export type CrawlSources = {
	boards: boolean; // 정보대학 게시판 (공지·장학·행사·진로)
	infoPages: boolean; // 정보대학 안내 페이지
	registrar: boolean; // 학교 학사일정
	campusLife: boolean; // 학교생활 안내 (korea.ac.kr 21쪽)
	customPages: boolean; // 관리자가 더한 페이지 전체
};
export type CrawlConfig = { pages: CrawlPage[]; schedule: CrawlSchedule; sources: CrawlSources };

export const MAX_CRAWL_PAGES = 50;
const TITLE_MAX = 60;

// 고를 수 있는 값 (화면의 선택 칸도 이 값으로)
export const QUICK_MIN_OPTIONS = [0, 5, 10, 15, 20, 30, 60];
export const BOARDS_HOURS_OPTIONS = [0, 1, 2, 3, 4, 6, 8, 12, 24];

// 예전 crontab에 박혀 있던 값 = 기본값
export const DEFAULT_CRAWL_SCHEDULE: CrawlSchedule = { quickMin: 15, boardsHours: 3, allTime: '04:30', recDay: 0, recTime: '05:40' };
export const DEFAULT_CRAWL_SOURCES: CrawlSources = { boards: true, infoPages: true, registrar: true, campusLife: true, customPages: true };

/** 'HH:MM' (5분 단위 — 서버가 5분마다 확인) → 맞으면 그대로, 아니면 null */
const hhmm = (v: unknown): string | null => {
	const m = String(v ?? '').match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const h = Number(m[1]);
	const mi = Number(m[2]);
	if (h > 23 || mi > 59 || mi % 5) return null;
	return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
};

export function parseCrawlSchedule(raw: unknown, base: CrawlSchedule = DEFAULT_CRAWL_SCHEDULE): CrawlSchedule {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const out = { ...base };
	if (QUICK_MIN_OPTIONS.includes(Number(r['quickMin']))) out.quickMin = Number(r['quickMin']);
	if (BOARDS_HOURS_OPTIONS.includes(Number(r['boardsHours']))) out.boardsHours = Number(r['boardsHours']);
	if (r['allTime'] === '') out.allTime = '';
	else if (hhmm(r['allTime'])) out.allTime = hhmm(r['allTime'])!;
	const day = Number(r['recDay']);
	if (Number.isInteger(day) && day >= -1 && day <= 6) out.recDay = day;
	if (hhmm(r['recTime'])) out.recTime = hhmm(r['recTime'])!;
	return out;
}

export function parseCrawlSources(raw: unknown, base: CrawlSources = DEFAULT_CRAWL_SOURCES): CrawlSources {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const out = { ...base };
	for (const k of Object.keys(DEFAULT_CRAWL_SOURCES) as (keyof CrawlSources)[]) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
	return out;
}

/** 학교 도메인(korea.ac.kr과 그 아래)만 — 정보대학 홈페이지는 이미 전체를 수집하므로 따로 받지 않음 */
export function checkCrawlUrl(raw: string): { url: string } | { error: 'invalid_url' | 'not_school' | 'already_crawled' } {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return { error: 'invalid_url' };
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'invalid_url' };
	const host = u.hostname.toLowerCase();
	if (host !== 'korea.ac.kr' && !host.endsWith('.korea.ac.kr')) return { error: 'not_school' };
	if (host === 'info.korea.ac.kr') return { error: 'already_crawled' };
	u.hash = '';
	return { url: u.toString() };
}

/** 화면에서 보낸 목록 → 저장할 목록. 잘못된 주소가 하나라도 있으면 그 이유와 함께 */
export function parseCrawlPages(raw: unknown): { pages: CrawlPage[] } | { error: string; url?: string } {
	if (!Array.isArray(raw)) return { error: 'invalid' };
	if (raw.length > MAX_CRAWL_PAGES) return { error: 'too_many_pages' };
	const seen = new Set<string>();
	const pages: CrawlPage[] = [];
	for (const r of raw) {
		if (!r || typeof r !== 'object') return { error: 'invalid' };
		const o = r as Record<string, unknown>;
		const checked = checkCrawlUrl(String(o['url'] ?? ''));
		if ('error' in checked) return { error: checked.error, url: String(o['url'] ?? '').slice(0, 200) };
		if (seen.has(checked.url)) continue;
		seen.add(checked.url);
		const title = String(o['title'] ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
		pages.push({ url: checked.url, title, enabled: o['enabled'] !== false });
	}
	return { pages };
}

/** 저장된 값 → 설정 (없는 칸은 기본값, 잘못된 페이지 목록은 빈 목록) */
export function parseCrawlConfig(raw: unknown): CrawlConfig {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const pages = parseCrawlPages(r['pages'] ?? []);
	return { pages: 'pages' in pages ? pages.pages : [], schedule: parseCrawlSchedule(r['schedule']), sources: parseCrawlSources(r['sources']) };
}

// 서버 crontab이 마지막으로 설정을 받아 간 시각 (메모리) — 화면에 '서버가 이 일정대로 돌고 있는지' 표시
let lastTickAt: string | null = null;
export const markCrawlTick = () => {
	lastTickAt = new Date().toISOString();
};
export const crawlTickAt = () => lastTickAt;
