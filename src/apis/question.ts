import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import axios from 'axios';

import { envs } from '../envs';
import { fetchAllFaqs } from '../db_interface';
import { Pool } from '../../config/connectDB';
import TQuestionLog from '../models/QuestionLog';
import { isEnglish } from '../lib/lang_tools';
import { insertQuestionLog } from '../db_interface';
import {
  AllFaqsResponse,
  ErrorResponse,
  NluRequest,
  NluResponse,
  QuestionRequest,
  QuestionResponse,
} from '../types';

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

export async function question(
  req: Request<{}, {}, QuestionRequest>,
  res: Response<QuestionResponse | ErrorResponse>
) {
  const { question } = req.body;
  if (!question) {
    res.status(400).json({ error: 'question은 필수값' });
    return;
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    let nluParams: NluRequest = {
      sender: 'hobit-back',
      message: question,
    };

    const resp = await axios.post(envs.HOBIT_NLU_ENDPOINT!, nluParams, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const nlpResp: NluResponse = resp.data;

    // TODO: faq_id 난수 생성
    // faq_XXX 형태로
    const questionLog: Omit<
      TQuestionLog,
      'id' | 'feedback_score' | 'feedback' | 'created_at'
    > = {
      faq_id: 1,
      user_question: question,
      language: isEnglish(question) ? 'EN' : 'KO',
    };

    res
      .json(
        nlpResp && nlpResp[0]
          ? { answer: nlpResp[0].text }
          : { error: 'NLU 서버 요청 실패' }
      )
      .status(nlpResp && nlpResp[0] ? 200 : 500);

    await insertQuestionLog(conn, questionLog);
  } catch (error: any) {
    console.log(error.message);
    res.status(500).json({ error: 'get_answer 함수 호출 실패' });
  } finally {
    conn.release();
  }
}
