import { PoolConnection } from 'mysql2/promise';
import { DatabaseError } from '../types';

export async function insertUserFeedback(
	conn: PoolConnection,
	feedback: {
		faq_id: number | null;
		feedback_reason: string | null;
		feedback_detail: string;
		language: string;
	}
) {
	try {
		await conn.query(
			`
      INSERT INTO user_feedbacks (faq_id, feedback_reason, feedback_detail, language)
      VALUES (?, ?, ?, ?);
      `,
			[feedback.faq_id, feedback.feedback_reason, feedback.feedback_detail, feedback.language]
		);
	} catch (error: any) {
		console.error('Error: ', error);
		throw new DatabaseError('User Feedback 등록에 실패했습니다.');
	}
}
