import { DEFAULT_HOURS, parseHoursSettings, seoulTime, staffHours } from '../../src/chat/hours';

// 한국 시간 → UTC Date (테스트를 읽기 쉽게)
const kst = (s: string) => new Date(`${s}+09:00`);

describe('행정실 채팅 운영 시간', () => {
	test('학기 중 평일 오전 10:30 → 채팅 가능', () => {
		const h = staffHours(kst('2026-10-13T10:30:00')); // 화요일
		expect(h).toMatchObject({ open: true, period: 'semester', reason: 'open' });
		expect(h.today).toEqual({ start: '09:00', end: '17:30' });
	});

	test('학기 중 9시 정각부터 열고 17:30에 닫음', () => {
		expect(staffHours(kst('2026-10-13T08:59:00')).reason).toBe('before');
		expect(staffHours(kst('2026-10-13T09:00:00')).open).toBe(true);
		expect(staffHours(kst('2026-10-13T17:29:00')).open).toBe(true);
		expect(staffHours(kst('2026-10-13T17:30:00')).reason).toBe('after');
	});

	test('점심시간 12:00–13:00은 닫음', () => {
		expect(staffHours(kst('2026-10-13T12:00:00')).reason).toBe('lunch');
		expect(staffHours(kst('2026-10-13T12:59:00')).reason).toBe('lunch');
		expect(staffHours(kst('2026-10-13T13:00:00')).open).toBe(true);
	});

	test('방학 중에는 10:00–17:00', () => {
		expect(staffHours(kst('2026-07-14T09:30:00'))).toMatchObject({ open: false, reason: 'before', period: 'vacation' });
		expect(staffHours(kst('2026-07-14T10:00:00')).open).toBe(true);
		expect(staffHours(kst('2026-07-14T17:00:00')).reason).toBe('after');
	});

	test('주말·공휴일은 닫음', () => {
		expect(staffHours(kst('2026-10-10T11:00:00')).reason).toBe('weekend'); // 토요일
		expect(staffHours(kst('2026-10-09T11:00:00')).reason).toBe('holiday'); // 한글날 (금)
	});

	test('서버 시간대와 상관없이 한국 날짜로 판단 (UTC 15:30 = 다음 날 00:30 KST)', () => {
		const t = seoulTime(new Date('2026-10-12T15:30:00Z'));
		expect(t).toMatchObject({ date: '2026-10-13', weekday: 2, minutes: 30 });
	});

	test('관리자 설정 검증 — 형식이 틀리면 거부', () => {
		expect(parseHoursSettings(DEFAULT_HOURS)).toEqual(DEFAULT_HOURS);
		expect(parseHoursSettings({ ...DEFAULT_HOURS, semester: { start: '18:00', end: '09:00' } })).toBeNull();
		expect(parseHoursSettings({ ...DEFAULT_HOURS, holidays: ['2026-13-40', 'x'] })?.holidays).toEqual(['2026-13-40']);
		expect(parseHoursSettings('nope')).toBeNull();
	});
});
