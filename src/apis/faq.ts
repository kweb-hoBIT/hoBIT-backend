import { NextFunction, Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { AllFaqsResponse, ErrorResponse, QuestionRequest } from '../types';
import { Pool } from '../../config/connectDB';
import { fetchAllFaqs } from '../db_interface';

export const allFaqs = async (
  _req: Request<QuestionRequest>,
  res: Response<AllFaqsResponse | ErrorResponse>,
  _next: NextFunction
) => {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    const faqs = await fetchAllFaqs(conn);
    res.json({ faqs });
  } finally {
    conn.release();
  }
};
