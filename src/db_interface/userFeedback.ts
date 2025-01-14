import { PoolConnection } from 'mysql2/promise';
import { UserFeedback } from '../models/UserFeedback';
import { DatabaseError } from '../types';

export async function insertUserFeedback(
	conn: PoolConnection,
	feedback: Omit<UserFeedback, 'id' | 'created_by'>
) {
	try {
		await conn.query(
			`
      INSERT INTO user_feedbacks (feedback_reason, feedback_detail, language)
      VALUES (?, ?, ?);
      `,
			[feedback.feedback_reason, feedback.feedback_detail, feedback.language]
		);
	} catch (error: any) {
		console.error('Error: ', error);
		throw new DatabaseError('User Feedback 등록에 실패했습니다.');
	}
}
