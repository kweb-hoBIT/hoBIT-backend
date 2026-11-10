import { isRagConnectionDrop } from '../../src/apis/question';

describe('RAG 연결 끊김 판단 (다시 시도할지)', () => {
	it('응답 전에 끊긴 연결은 다시 시도', () => {
		expect(isRagConnectionDrop({ code: 'ECONNRESET', message: 'socket hang up' })).toBe(true);
		expect(isRagConnectionDrop({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' })).toBe(true);
		expect(isRagConnectionDrop({ message: 'socket hang up' })).toBe(true);
	});
	it('응답을 받은 오류·학생이 멈춘 요청은 다시 보내지 않음', () => {
		expect(isRagConnectionDrop({ code: 'ECONNRESET', response: { status: 500 } })).toBe(false);
		expect(isRagConnectionDrop({ code: 'ERR_CANCELED', message: 'canceled' })).toBe(false);
		expect(isRagConnectionDrop({ code: 'ERR_BAD_RESPONSE', response: { status: 502 } })).toBe(false);
	});
});
