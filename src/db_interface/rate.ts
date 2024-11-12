import { Pool } from "../../config/connectDB";
import { PoolConnection, RowDataPacket } from "mysql2/promise";

export async function updateFaqLogRate(faq_id: number, rate: 1 | -1) {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    await conn.beginTransaction();
    const [_rows] = await conn.query<RowDataPacket[]>(
      `
UPDATE faq_logs
SET rate = rate + ?
WHERE faq_id = ?
      `,
      [rate, faq_id],
    );

    await conn.commit();

    return faq_id;
  } catch (error: any) {
    await conn.rollback();
    console.error(error.message);
    throw new Error("FAQ rate 업데이트 중 오류가 발생했습니다.");
  } finally {
    conn.release();
  }
}
