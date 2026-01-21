import { PoolConnection } from 'mysql2/promise';
import { DatabaseError } from '../types';

export async function insertUserFeedback(
  conn: PoolConnection,
  feedback: {
    faq_id: number | null;
    user_question: string;
    feedback_reason: string | null;
    feedback_detail: string;
    language: string;
  }
) {
  try {
    await conn.query(
      `
      INSERT INTO user_feedbacks (faq_id, user_question, feedback_reason, feedback_detail, language)
      VALUES (?, ?, ?, ?, ?);
      `,
      [
        feedback.faq_id,
        feedback.user_question,
        feedback.feedback_reason,
        feedback.feedback_detail,
        feedback.language,
      ]
    );
  } catch (error: any) {
    throw new DatabaseError('Failed to insert user feedback');
  }
}
