import { PoolConnection } from 'mysql2/promise';

import TQuestionLog from '../models/QuestionLog';
import { DatabaseError } from '../types';

export async function insertQuestionLog(
  conn: PoolConnection,
  log: Omit<TQuestionLog, 'id' | 'feedback_score' | 'feedback' | 'created_at'>
) {
  try {
    await conn.query(
      `
INSERT INTO question_logs (faq_id, user_question, language, feedback_score, feedback)
VALUES (?, ?, ?, ?, ?);
      `,
      [log.faq_id, log.user_question, log.language, null, null]
    );
  } catch (error: any) {
    throw new DatabaseError('Question 로그 등록에 실패했습니다.');
  }
}
