/**
 * 행정실(staff) 채팅 운영 시간 — 규칙만 (DB·시계는 밖에서 넣음 → 단위 테스트 쉬움)
 * 학기 중 평일 09:00–17:30, 방학 중 평일 10:00–17:00, 점심 12:00–13:00 제외, 휴무일 제외 (한국 시간)
 */
export type HourRange = { start: string; end: string }; // "HH:MM"
export type HoursSettings = {
	semester: HourRange;
	vacation: HourRange;
	lunch: HourRange | null;
	weekdays: number[]; // 0=일 … 6=토
	semesters: { start: string; end: string }[]; // 매년 반복 "MM-DD" (학기 기간)
	holidays: string[]; // "YYYY-MM-DD"
};

export const DEFAULT_HOURS: HoursSettings = {
	semester: { start: '09:00', end: '17:30' },
	vacation: { start: '10:00', end: '17:00' },
	lunch: { start: '12:00', end: '13:00' },
	weekdays: [1, 2, 3, 4, 5],
	// 대략적인 학기 기간 (관리자 화면에서 고칠 수 있음)
	semesters: [
		{ start: '03-02', end: '06-21' },
		{ start: '09-01', end: '12-20' },
	],
	// 2026년 공휴일·대체공휴일 (확인 후 관리자 화면에서 고치기)
	holidays: [
		// 2026 공휴일 (Google 대한민국 휴일 캘린더 기준 — 노동절·제헌절 포함). 다른 해는 채팅 설정의 "공휴일 불러오기"
		'2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
		'2026-05-01', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-03', '2026-06-06',
		'2026-07-17', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26',
		'2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
	],
};

export type SeoulTime = { date: string; md: string; weekday: number; minutes: number };

/** Date → 한국 시간의 날짜·요일·분 (서버 시간대와 무관) */
export function seoulTime(now: Date): SeoulTime {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Seoul',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		weekday: 'short',
	}).formatToParts(now);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const date = `${get('year')}-${get('month')}-${get('day')}`;
	return {
		date,
		md: `${get('month')}-${get('day')}`,
		weekday: days.indexOf(get('weekday')),
		minutes: Number(get('hour')) * 60 + Number(get('minute')),
	};
}

const toMin = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
};

export function isSemester(md: string, settings: HoursSettings): boolean {
	return settings.semesters.some((s) => (s.start <= s.end ? md >= s.start && md <= s.end : md >= s.start || md <= s.end));
}

export type StaffHours = {
	open: boolean;
	reason: 'open' | 'holiday' | 'weekend' | 'lunch' | 'before' | 'after';
	period: 'semester' | 'vacation';
	today: HourRange | null; // 오늘 운영 시간 (휴무면 null)
	lunch: HourRange | null;
};

export function staffHours(now: Date, settings: HoursSettings = DEFAULT_HOURS): StaffHours {
	const t = seoulTime(now);
	const period = isSemester(t.md, settings) ? 'semester' : 'vacation';
	const range = settings[period];
	const base = { period, lunch: settings.lunch } as const;
	if (settings.holidays.includes(t.date)) return { ...base, open: false, reason: 'holiday', today: null };
	if (!settings.weekdays.includes(t.weekday)) return { ...base, open: false, reason: 'weekend', today: null };
	if (t.minutes < toMin(range.start)) return { ...base, open: false, reason: 'before', today: range };
	if (t.minutes >= toMin(range.end)) return { ...base, open: false, reason: 'after', today: range };
	if (settings.lunch && t.minutes >= toMin(settings.lunch.start) && t.minutes < toMin(settings.lunch.end)) {
		return { ...base, open: false, reason: 'lunch', today: range };
	}
	return { ...base, open: true, reason: 'open', today: range };
}

/** 관리자 화면에서 받은 설정 검증 (형식이 틀리면 null) */
export function parseHoursSettings(v: unknown): HoursSettings | null {
	if (!v || typeof v !== 'object') return null;
	const o = v as Record<string, unknown>;
	const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
	const range = (r: unknown): HourRange | null => {
		if (!r || typeof r !== 'object') return null;
		const x = r as Record<string, unknown>;
		return typeof x['start'] === 'string' && typeof x['end'] === 'string' && hm.test(x['start']) && hm.test(x['end']) && x['start'] < x['end']
			? { start: x['start'], end: x['end'] }
			: null;
	};
	const semester = range(o['semester']);
	const vacation = range(o['vacation']);
	const lunch = o['lunch'] === null ? null : range(o['lunch']);
	const weekdays = Array.isArray(o['weekdays']) ? o['weekdays'].filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : null;
	const md = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
	const semesters = Array.isArray(o['semesters'])
		? o['semesters']
				.map((s) => s as Record<string, unknown>)
				.filter((s) => typeof s['start'] === 'string' && typeof s['end'] === 'string' && md.test(s['start']) && md.test(s['end']))
				.map((s) => ({ start: s['start'] as string, end: s['end'] as string }))
		: null;
	const holidays = Array.isArray(o['holidays'])
		? Array.from(new Set(o['holidays'].filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort()
		: null;
	if (!semester || !vacation || (o['lunch'] !== null && !lunch) || !weekdays || !semesters || !holidays) return null;
	return { semester, vacation, lunch, weekdays, semesters, holidays };
}
