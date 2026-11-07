import { PoolConnection } from 'mysql2/promise';
import { Request, Response } from 'express';
import {
  ErrorResponse,
  RateFaqRequest,
  RateFaqResponse,
  ValidationError,
} from '../types';
import { Pool } from '../../config/connectDB';

/**
 * 👍·👎 — 답변 기록(question_logs)에 점수를 남기고, 👎면 관리자 피드백(user_feedbacks)도 만듦.
 *   id      답변 기록 번호 (question_logs.id) — AI 답변은 답변과 함께 받은 log_id
 *   faq_id  행정실 FAQ 답변이면 그 FAQ 번호, AI 답변이면 없음(-1·0·null) → 피드백의 faq_id는 NULL
 * (예전엔 AI 답변의 id·faq_id가 -1이라 기록은 안 바뀌고, 없는 FAQ 번호로 넣다가 실패해 응답도 없이 멈췄음)
 */
export const rateFaq = async (
  req: Request<RateFaqRequest>,
  res: Response<RateFaqResponse | ErrorResponse>
) => {
  const {
    id,
    faq_id,
    user_question,
    rate,
    language = 'ko',
    feedback_reason = '',
    feedback_detail = '',
  } = req.body;

  const logId = Number(id);
  const faqId = Number(faq_id) > 0 ? Number(faq_id) : null;
  if (![1, -1, 0].includes(rate)) {
    throw new ValidationError('rate는 1, -1, 0 중 하나여야 합니다.');
  }
  if (!(logId > 0) && faqId === null && rate !== -1) {
    throw new ValidationError('id 또는 faq_id가 필요합니다.');
  }
  if (rate === 1 && (feedback_reason || feedback_detail)) {
    throw new ValidationError('Feedback unallowed if rate == 1');
  }

  const conn: PoolConnection = await Pool.getConnection();
  try {
    await conn.beginTransaction();
    if (logId > 0) {
      await conn.query(`UPDATE question_logs SET feedback_score = ?, feedback = ? WHERE id = ?`, [
        rate,
        String(feedback_detail || '').slice(0, 300) || null,
        logId,
      ]);
    }
    if (rate === -1) {
      // FAQ 번호가 지워졌거나 잘못 왔어도 피드백은 남김 (FAQ가 없으면 NULL)
      const [faqRows]: any = faqId ? await conn.query(`SELECT id FROM faqs WHERE id = ?`, [faqId]) : [[]];
      await conn.query(
        `INSERT INTO user_feedbacks (faq_id, question_log_id, user_question, feedback_reason, feedback_detail, language)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          faqRows.length ? faqId : null,
          logId > 0 ? logId : null,
          String(user_question || '').slice(0, 300) || null,
          feedback_reason || null,
          feedback_detail || `Unresolved question: ${user_question}`,
          language,
        ]
      );
    }
    await conn.commit();
    res.json({ id: logId, success: true });
  } catch (error: any) {
    await conn.rollback().catch(() => undefined);
    console.error('[Rate API] 피드백 저장 실패:', error?.message ?? error);
    res.status(500).json({ id: logId, success: false } as any);
  } finally {
    conn.release();
  }
};
