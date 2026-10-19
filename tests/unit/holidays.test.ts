import { parseHolidayIcs } from '../../src/chat/holidays';

// Google "대한민국의 휴일" 캘린더 .ics 형식 (줄 이어 쓰기·기념일 섞임)
const ICS = [
	'BEGIN:VCALENDAR',
	'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261009', 'SUMMARY:한글날', 'DESCRIPTION:공휴일', 'END:VEVENT',
	'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261001', 'SUMMARY:국군의날', 'DESCRIPTION:기념일\\n기념일을 숨기려면 Google Calendar 설정 >', ' 대한민국의 휴일 캘린더로 이동하세요.', 'END:VEVENT',
	'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261005', 'SUMMARY:쉬는 날 개', ' 천절', 'DESCRIPTION:공휴일', 'END:VEVENT',
	'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20270101', 'SUMMARY:새해첫날', 'DESCRIPTION:공휴일', 'END:VEVENT',
	'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261009', 'SUMMARY:한글날', 'DESCRIPTION:공휴일', 'END:VEVENT',
	'END:VCALENDAR',
].join('\r\n');

describe('공휴일 캘린더 읽기', () => {
	it('공휴일만, 날짜순, 이어 쓴 줄 합침, 같은 날 중복 제거', () => {
		expect(parseHolidayIcs(ICS)).toEqual([
			{ date: '2026-10-05', name: '쉬는 날 개천절' },
			{ date: '2026-10-09', name: '한글날' },
			{ date: '2027-01-01', name: '새해첫날' },
		]);
	});
	it('기념일(국군의날 등)은 빠짐', () => {
		expect(parseHolidayIcs(ICS).some((h) => h.name.includes('국군'))).toBe(false);
	});
	it('캘린더 형식이 아니면 빈 목록', () => {
		expect(parseHolidayIcs('garbage')).toEqual([]);
	});
});
