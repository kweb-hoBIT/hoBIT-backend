import { PoolConnection } from 'mysql2/promise';
import { Request, Response } from 'express';

import { updateFaqLogRate } from '../db_interface';
import { ErrorResponse, RateFaqRequest, RateFaqResponse } from '../types';
import { Pool } from '../../config/connectDB';

export const rateFaq = async (
  req: Request<RateFaqRequest>,
  res: Response<RateFaqResponse | ErrorResponse>
) => {
  const { faq_id, rate } = req.body;
  if (!faq_id || !rate) {
    res.status(400).json({ error: 'faq_id와 action은 필수 값입니다.' });
    return;
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    await updateFaqLogRate(conn, faq_id, rate);

    res.json({ success: true });
    return;
  } catch (error: any) {
    console.error(error.message);
    res.status(500).json({ error: 'FAQ 평가 저장에 실패했습니다.' });
    return;
  } finally {
    conn.release();
  }
};
