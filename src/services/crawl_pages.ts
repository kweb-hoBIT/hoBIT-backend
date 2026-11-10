/**
 * 정기 수집에 더할 페이지 (관리자 사이트 > 챗봇 설정 > 정기 수집)
 *
 * 정보대학 홈페이지(info.korea.ac.kr)·학사일정·학교생활 안내는 코드에 정해진 기본 수집 대상이고,
 * 여기에는 관리자가 직접 더한 학교 페이지만 저장 (채팅 DB chat_settings, name='crawl').
 * RAG의 정기 수집(매일 04:30 전체 수집, beta.sh crawl static)이 서버 안 주소로 목록을 받아 본문을 모아 색인함.
 * 학교 밖 사이트는 받지 않음 — 챗봇은 학교 안내만 답함 (고파스·커뮤니티 등은 넣지 않기로 함)
 */
export type CrawlPage = { url: string; title: string; enabled: boolean };

export const MAX_CRAWL_PAGES = 50;
const TITLE_MAX = 60;

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

/** 화면에서 보낸 목록 → 저장할 목록. 잘못된 주소가 하나라도 있으면 그 이유와 함께 null */
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

/**
 * 정기 수집 시간 (beta.sh crawl-auto가 crontab에 넣는 값과 같게 — 바꾸면 둘 다)
 * 서버 시간은 한국 시간
 */
export const CRAWL_SCHEDULE = [
	{ when: '15분마다', what: '정보대학 공지·장학 게시판 첫 페이지에 새 글이 있는지 확인 → 있으면 게시판 수집' },
	{ when: '3시간마다 (매시 20분)', what: '정보대학 게시판 전체 수집 (공지·장학·행사·진로)' },
	{ when: '매일 04:30', what: '전체 수집 — 정보대학 안내 페이지·학사일정·학교생활 안내·FAQ·추가한 페이지' },
	{ when: '매주 일요일 05:40', what: '시작 화면 추천 질문이 지금도 답이 되는지 점검' },
];
