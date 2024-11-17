import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import SnowflakeID from 'snowflake-id';

import { Pool } from '../../config/connectDB';
import TQuestionLog from '../models/QuestionLog';
import { isEnglish } from '../lib/lang_tools';
import { insertQuestionLog } from '../db_interface';
import {
  ErrorResponse,
  NluError,
  NluRequest,
  NluResponse,
  QuestionRequest,
  QuestionResponse,
  ValidationError,
} from '../types';
import { fetchNlu } from '../internal/api';

export const question = async (
  req: Request<{}, {}, QuestionRequest>,
  res: Response<QuestionResponse | ErrorResponse>
) => {
  const { question } = req.body;

  if (!question) {
    throw new ValidationError("invalid parameter, 'question' required");
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    let nluParams: NluRequest = {
      sender: 'hobit-back',
      message: question,
    };

    const resp = await fetchNlu(nluParams);
    const nlpResp: NluResponse = resp.data;


    if (!nlpResp || !nlpResp[0]) {
      throw new NluError('NLU 서버 요청 실패');
    }

    // 난수 기반 faq_id 생성
    const snowflake = new SnowflakeID({ mid: 42 });
    const faqId = snowflake.generate();

    res.status(200).json({ answer: nlpResp[0].text });

    const questionLog: Omit<
      TQuestionLog,
      'id' | 'feedback_score' | 'feedback' | 'created_at'
    > = {
      faq_id: faqId,
      user_question: question,
      language: isEnglish(question) ? 'EN' : 'KO',
    };

    await insertQuestionLog(conn, questionLog);
  } finally {
    conn.release();
  }
};
