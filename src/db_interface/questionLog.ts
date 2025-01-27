import { PoolConnection, RowDataPacket } from 'mysql2/promise';

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

export async function updateQuestionLog(
  conn: PoolConnection,
  id: number,
  rate: 1 | -1 | 0,
  feedback_detail: string
) {
  try {
    await conn.beginTransaction();
    const [_rows] = await conn.query<RowDataPacket[]>(
      `
UPDATE question_logs
SET feedback_score = ?, feedback = ?
WHERE id = ?
      `,
      [rate, feedback_detail, id]
    );

    await conn.commit();

    return;
  } catch (error: any) {
    await conn.rollback();
    console.error(error);
    throw new DatabaseError(
      'Question Log 피드백 점수 업데이트 중 오류가 발생했습니다.'
    );
  } finally {
    conn.release();
  }
}

export async function latestIdQuestionLog(
  conn: PoolConnection
): Promise<number> {
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
SELECT LAST_INSERT_ID() AS id;
      `
    );

    return rows[0] ? rows[0]['id'] : null;
  } catch (error: any) {
    throw new DatabaseError('최근 삽입된 ID를 가져오는 데 실패했습니다.');
  }
}
