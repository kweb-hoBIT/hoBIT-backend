import { PoolConnection } from 'mysql2/promise';
import { TFaqLog } from '../models/FAQLog';

export async function insertFaqLog(
  conn: PoolConnection,
  log: Partial<TFaqLog>
) {
  try {
    await conn.query(
      `
INSERT INTO faq_logs (user_id, faq_id, prev_faq, new_faq, action_type)
VALUES (?, ?, ?, ?, ?);
      `,
      [log.user_id, log.faq_id, log.prev_faq, log.new_faq, log.action_type]
    );
    console.log('FAQ 로그가 성공적으로 등록되었습니다.');
  } catch (error: any) {
    console.error('FAQ 로그 등록 중 오류가 발생했습니다.', error.message);
    throw new Error('FAQ 로그 등록에 실패했습니다.');
  }
}
