import { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { DatabaseError } from '../types';

export async function updateFaqLogRate(
  conn: PoolConnection,
  faq_id: number,
  rate: 1 | -1 | 0,
  feedback_detail: string
) {
  try {
    await conn.beginTransaction();
    const [_rows] = await conn.query<RowDataPacket[]>(
      `
UPDATE question_logs
SET feedback_score = ?, feedback = ?
WHERE faq_id = ?
      `,
      [rate, feedback_detail, faq_id]
    );

    await conn.commit();

    return faq_id;
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
