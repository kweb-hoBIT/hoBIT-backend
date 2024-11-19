import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { AllFaqsResponse, AllQuestionsResponse, ErrorResponse } from '../types';
import { Pool } from '../../config/connectDB';
import { fetchAllFaqs, fetchAllQuestions } from '../db_interface';

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

export const allQuestions = async (
  _req: Request,
  res: Response<AllQuestionsResponse | ErrorResponse>
) => {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    const questions = await fetchAllQuestions(conn);
    res.json({ questions });
  } finally {
    conn.release();
  }
};
