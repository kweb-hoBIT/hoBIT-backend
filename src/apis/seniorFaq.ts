import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import { AllSeniorFaqsResponse, ErrorResponse } from '../types/seniorFaq';
import { Pool } from '../../config/connectDB';
import { fetchAllSeniorFaqs } from '../db_interface/seniorFaq';

export const allSeniorFaqs = async (
  _req: Request,
  res: Response<AllSeniorFaqsResponse | ErrorResponse>
) => {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    const seniorFaqs = await fetchAllSeniorFaqs(conn);
    res.json({ seniorFaqs });
  } finally {
    conn.release();
  }
};