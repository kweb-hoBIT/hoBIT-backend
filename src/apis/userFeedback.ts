import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import { DirectUserFeedbacksRequest } from '../types/feedback';
import { Pool } from '../../config/connectDB';
import { insertUserFeedback } from '../db_interface/userFeedback';

export const directUserFeedbacks = async (
  req: Request<DirectUserFeedbacksRequest>,
  res: Response
) => {
  const { feedback_detail, language } = req.body;
  const conn: PoolConnection = await Pool.getConnection();

  const feedback = {
    feedback_detail,
    language,
    faq_id: null,
    feedback_reason: null,
  };

  try {
    await insertUserFeedback(conn, feedback);
    res.json({ feedback: feedback });
  } finally {
    conn.release();
  }
};
