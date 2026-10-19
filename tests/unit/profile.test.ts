import { ChatService, cleanProfile } from '../../src/chat/service';

describe('채팅 시작 때 받는 학생 정보', () => {
	it('정해진 항목만, 과정은 학부·대학원만, 학번은 숫자만', () => {
		expect(
			cleanProfile({ program: 'grad', name: ' 김호빗 ', student_id: '2024320001', department: '컴퓨터학과', student_status: '재학', evil: '<script>' })
		).toEqual({ program: 'grad', name: '김호빗', student_id: '2024320001', department: '컴퓨터학과', student_status: '재학' });
		expect(cleanProfile({ program: 'phd', student_id: '20-24' })).toBeNull();
		expect(cleanProfile(null)).toBeNull();
	});

	it('선배에게는 이름·학번을 빼고, 메일은 가려서 보여줌', () => {
		const service = new ChatService({} as never, { nowOverride: null } as never, {} as never, {} as never, {} as never);
		const row = {
			id: '00000000-0000-0000-0000-000000000000', mode: 'senior', status: 'waiting', student_email: 'kim1234@korea.ac.kr', language: 'KO',
			student_lang: null, profile: JSON.stringify({ program: 'undergrad', name: '김호빗', student_id: '2024320001', department: '컴퓨터학과' }),
			bot_context: null, assigned_user_id: null, assigned_username: null, created_at: new Date(), started_at: null, closed_at: null,
			closed_by: null, rating: null, rating_comment: null,
		};
		const senior = service.toSession(row as never, { kind: 'agent', agent: { typ: 'agent', uid: 1, name: 's', role: 'senior' } } as never);
		expect(senior.profile).toEqual({ program: 'undergrad', department: '컴퓨터학과' });
		expect(senior.studentEmail).not.toBe('kim1234@korea.ac.kr');
		const staff = service.toSession(row as never, { kind: 'agent', agent: { typ: 'agent', uid: 2, name: 't', role: 'staff' } } as never);
		expect(staff.profile).toMatchObject({ name: '김호빗', student_id: '2024320001' });
	});
});
