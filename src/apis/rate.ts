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
import { UserFeedbackReason } from '../types/feedback';

export const rateFaq = async (
  req: Request<RateFaqRequest>,
  res: Response<RateFaqResponse | ErrorResponse>
) => {
  const { faq_id, rate, feedback_reason, feedback_detail, language } = req.body;

  if (!faq_id || rate === undefined) {
    throw new ValidationError('faq_id와 rate는 필수 값입니다.');
  }

  if (rate === -1) {
    if (!feedback_reason || !feedback_detail || !language) {
      throw new ValidationError(
        'feedback_reason, feedback_detail, language는 필수 값입니다.'
      );
    }

    const allowedReasons: UserFeedbackReason[] = [
      'unrelated',
      'duplicate',
      'incorrect',
      'insufficient',
      'unclear',
      'other',
    ];
    if (!allowedReasons.includes(feedback_reason)) {
      throw new ValidationError('유효하지 않은 feedback_reason 값입니다.');
    }
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    await conn.beginTransaction();

    await updateFaqLogRate(conn, faq_id, rate);

    if (rate === -1) {
      await insertUserFeedback(conn, {
        faq_id,
        feedback_reason,
        feedback_detail,
        language,
      });
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

