import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { AllFaqsResponse, ErrorResponse } from '../types';
import { Pool } from '../../config/connectDB';
import { fetchAllFaqs } from '../db_interface';

export const allFaqs = async (
  _req: Request,
  res: Response<AllFaqsResponse | ErrorResponse>
) => {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    const faqs = await fetchAllFaqs(conn);
    res.json({ faqs });
  } finally {
    conn.release();
  }
};
