import { PoolConnection } from 'mysql2/promise';
import { Request, Response } from 'express';
import { updateFaqLogRate } from '../db_interface';
import {
  ErrorResponse,
  RateFaqRequest,
  RateFaqResponse,
  ValidationError,
} from '../types';
import { Pool } from '../../config/connectDB';
import { insertUserFeedback } from '../db_interface/userFeedback';

export const rateFaq = async (
  req: Request<RateFaqRequest>,
  res: Response<RateFaqResponse | ErrorResponse>
) => {
  const { faq_id, user_question, rate, language } = req.body;

  if (!faq_id || rate === undefined) {
    throw new ValidationError('faq_id와 rate는 필수 값입니다.');
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    await conn.beginTransaction();

    await updateFaqLogRate(conn, faq_id, rate);

    let feedback_reason = null;
    let feedback_detail = `Unresolved question: ${user_question}`;

    if (rate === -1) {
      await insertUserFeedback(conn, {
        faq_id,
        feedback_reason,
        feedback_detail,
        language,
      });

      console.log('Success from neg rate -1');
    }

    await conn.commit();

    res.json({ success: true });
  } catch (error: any) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
