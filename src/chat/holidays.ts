/**
 * 공휴일 불러오기 — Google 캘린더 "대한민국의 휴일" 공개 캘린더(.ics, 키 필요 없음)
 *  - 공휴일만 (설명이 '공휴일'인 것 — 식목일·어버이날 같은 '기념일'은 뺌), 대체공휴일·선거일 포함
 *  - 학교 자체 휴무일(개교기념일 등)은 여기 없음 → 채팅 설정에서 직접 추가
 *  - 파일 하나에 몇 년치가 들어 있어 12시간 동안 메모리에 두고 재사용, 동시에 여러 번 불러도 요청은 한 번
 */
export type Holiday = { date: string; name: string }; // date = YYYY-MM-DD

const DEFAULT_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
const TTL = 12 * 3600 * 1000;

/** .ics 글에서 공휴일만 골라냄 (날짜순, 같은 날 여러 개면 이름을 합침) */
export function parseHolidayIcs(ics: string): Holiday[] {
	// 줄 이어 쓰기(다음 줄이 공백으로 시작) 풀기
	const lines = ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
	const byDate = new Map<string, string[]>();
	let ev: Record<string, string> | null = null;
	for (const line of lines) {
		if (line === 'BEGIN:VEVENT') ev = {};
		else if (line === 'END:VEVENT') {
			const d = /(\d{4})(\d{2})(\d{2})/.exec(ev?.['DTSTART'] ?? '');
			const desc = (ev?.['DESCRIPTION'] ?? '').replace(/\\n/g, '\n').trim();
			const name = (ev?.['SUMMARY'] ?? '').replace(/\\,/g, ',').trim();
			if (d && name && /^(공휴일|public holiday)/i.test(desc)) {
				const date = `${d[1]}-${d[2]}-${d[3]}`;
				byDate.set(date, [...(byDate.get(date) ?? []), name]);
			}
			ev = null;
		} else if (ev) {
			const i = line.indexOf(':');
			if (i > 0) ev[line.slice(0, i).split(';')[0]!] = line.slice(i + 1);
		}
	}
	return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, names]) => ({ date, name: [...new Set(names)].join(' · ') }));
}

let cache: { at: number; list: Holiday[] } | null = null;
let inflight: Promise<Holiday[]> | null = null;

async function loadAll(): Promise<Holiday[]> {
	if (cache && Date.now() - cache.at < TTL) return cache.list;
	inflight ??= (async () => {
		try {
			const res = await fetch(process.env['CHAT_HOLIDAY_ICS_URL'] || DEFAULT_URL, { signal: AbortSignal.timeout(8000) });
			if (!res.ok) throw new Error(`holiday calendar ${res.status}`);
			const list = parseHolidayIcs(await res.text());
			if (!list.length) throw new Error('holiday calendar empty');
			cache = { at: Date.now(), list };
			return list;
		} finally {
			inflight = null;
		}
	})();
	return inflight;
}

/** 그 해의 공휴일 (캘린더에 아직 없는 해면 빈 목록) */
export async function koreanHolidays(year: number): Promise<Holiday[]> {
	return (await loadAll()).filter((h) => h.date.startsWith(`${year}-`));
}
