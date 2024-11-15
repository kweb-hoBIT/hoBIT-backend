import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { AllFaqsResponse, ErrorResponse, QuestionRequest } from '../types';
import { Pool } from '../../config/connectDB';
import { fetchAllFaqs } from '../db_interface';

export async function allFaqs(
  _req: Request<QuestionRequest>,
  res: Response<AllFaqsResponse | ErrorResponse>
) {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    const faqs = await fetchAllFaqs(conn);
    res.json({ faqs });
  } catch (error: any) {
    console.error(error.message);
    res.status(500).json({ error: 'get_all_faqs 함수 호출 실패' });
  } finally {
    conn.release();
  }
}
