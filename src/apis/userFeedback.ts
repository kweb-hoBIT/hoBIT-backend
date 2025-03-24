import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import {
  DirectUserFeedbackRequest,
  DirectUserFeedbackResponse,
} from '../types/feedback';
import { Pool } from '../../config/connectDB';
import { insertUserFeedback } from '../db_interface/userFeedback';
import { ErrorResponse } from '../types';

export const directUserFeedback = async (
  req: Request<DirectUserFeedbackRequest>,
  res: Response<DirectUserFeedbackResponse | ErrorResponse>
) => {
  const { feedback_detail, language } = req.body;
  const conn: PoolConnection = await Pool.getConnection();

  const feedback = {
    faq_id: null,
    user_question: '',
    feedback_reason: null,
    feedback_detail,
    language,
  };

  try {
    await insertUserFeedback(conn, feedback);
    res.json({ success: true });
  } finally {
    conn.release();
  }
};
