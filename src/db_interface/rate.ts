import { PoolConnection, RowDataPacket } from "mysql2/promise";

export async function updateFaqLogRate(
  conn: PoolConnection,
  faq_id: number,
  rate: 1 | -1,
) {
  try {
    await conn.beginTransaction();
    const [_rows] = await conn.query<RowDataPacket[]>(
      `
UPDATE question_logs
SET feedback_score = ?
WHERE faq_id = ?
      `,
      [rate, faq_id],
    );

    await conn.commit();

    return faq_id;
  } catch (error: any) {
    await conn.rollback();
    console.error(error.message);
    throw new Error(
      "Question Log 피드백 점수 업데이트 중 오류가 발생했습니다.",
    );
  } finally {
    conn.release();
  }
}
