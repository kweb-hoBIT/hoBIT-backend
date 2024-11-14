import { PoolConnection } from 'mysql2/promise';
import TQuestionLog from '../models/QuestionLog';

export async function insertQuestionLog(
  conn: PoolConnection,
  log: Partial<TQuestionLog>
) {
  try {
    await conn.query(
      `
INSERT INTO question_logs (faq_id, user_question, language, feedback_score, feedback)
VALUES (?, ?, ?, ?, ?);
      `,
      [
        log.faq_id,
        log.user_question,
        log.language,
        log.feedback_score,
        log.feedback,
      ]
    );
    console.log('Question 로그가 성공적으로 등록되었습니다.');
  } catch (error: any) {
    console.error('Question 로그 등록 중 오류가 발생했습니다.', error.message);
    throw new Error('Question 로그 등록에 실패했습니다.');
  }
}
