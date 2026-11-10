import { checkCrawlUrl, parseCrawlPages } from '../../src/services/crawl_pages';

describe('정기 수집에 더할 페이지', () => {
	test('학교 도메인만', () => {
		expect(checkCrawlUrl('https://www.korea.ac.kr/ko/510/subview.do')).toEqual({ url: 'https://www.korea.ac.kr/ko/510/subview.do' });
		expect(checkCrawlUrl('https://library.korea.ac.kr/hours#top')).toEqual({ url: 'https://library.korea.ac.kr/hours' });
		expect(checkCrawlUrl('https://www.koreapas.com/m/bus.php')).toEqual({ error: 'not_school' });
		expect(checkCrawlUrl('https://evilkorea.ac.kr/x')).toEqual({ error: 'not_school' });
		expect(checkCrawlUrl('https://info.korea.ac.kr/info/board/notice_under.do')).toEqual({ error: 'already_crawled' });
		expect(checkCrawlUrl('javascript:alert(1)')).toEqual({ error: 'invalid_url' });
		expect(checkCrawlUrl('그냥 글')).toEqual({ error: 'invalid_url' });
	});
	test('목록 — 중복 제거·이름 정리·꺼짐 유지, 잘못된 주소는 거절', () => {
		const r = parseCrawlPages([
			{ url: 'https://www.korea.ac.kr/ko/510/subview.do', title: '  체육  시설 ', enabled: false },
			{ url: 'https://www.korea.ac.kr/ko/510/subview.do', title: '중복' },
			{ url: 'https://sejong.korea.ac.kr/a', title: '' },
		]);
		expect(r).toEqual({
			pages: [
				{ url: 'https://www.korea.ac.kr/ko/510/subview.do', title: '체육 시설', enabled: false },
				{ url: 'https://sejong.korea.ac.kr/a', title: '', enabled: true },
			],
		});
		expect(parseCrawlPages([{ url: 'https://naver.com' }])).toEqual({ error: 'not_school', url: 'https://naver.com' });
		expect(parseCrawlPages('x')).toEqual({ error: 'invalid' });
	});
});

import { DEFAULT_CRAWL_SCHEDULE, parseCrawlConfig, parseCrawlSchedule, parseCrawlSources } from '../../src/services/crawl_pages';

describe('정기 수집 일정·대상', () => {
	test('고를 수 있는 값만, 시각은 5분 단위', () => {
		expect(parseCrawlSchedule({ quickMin: 30, boardsHours: 6, allTime: '3:05', recDay: 3, recTime: '22:40' })).toEqual({
			quickMin: 30, boardsHours: 6, allTime: '03:05', recDay: 3, recTime: '22:40',
		});
		expect(parseCrawlSchedule({ quickMin: 7, boardsHours: 5, allTime: '04:31', recDay: 9 })).toEqual(DEFAULT_CRAWL_SCHEDULE);
		expect(parseCrawlSchedule({ allTime: '', recDay: -1, quickMin: 0 })).toMatchObject({ allTime: '', recDay: -1, quickMin: 0 });
	});
	test('대상은 보낸 칸만 바꿈, 저장값이 없으면 기본값', () => {
		expect(parseCrawlSources({ boards: false, x: true })).toMatchObject({ boards: false, infoPages: true });
		expect(parseCrawlConfig(null)).toMatchObject({ pages: [], schedule: DEFAULT_CRAWL_SCHEDULE });
	});
});
