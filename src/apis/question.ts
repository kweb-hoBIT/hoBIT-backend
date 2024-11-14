import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import axios from 'axios';

import { envs } from '../envs';
import { ErrorResponse, AllFaqsResponse } from '../types/faq';
import { fetchAllFaqs } from '../db_interface/faq';
import { Pool } from '../../config/connectDB';
import { NluRequest, NluResponse } from '../types/nlu';
import TQuestionLog from '../models/QuestionLog';
import { isEnglish } from '../lib/lang_tools';
import { QuestionRequest, QuestionResponse } from '../types/question';
import { insertQuestionLog } from '../db_interface/questionLog';

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
  const conn: PoolConnection = await Pool.getConnection();

  try {
    let nluParams: NluRequest = {
      sender: 'hobit-back',
      message: question,
    };

    // TODO: 같은 질문은 캐싱해서 답변
    const resp = await axios.post(envs.HOBIT_NLU_ENDPOINT!, nluParams, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const nlpResp: NluResponse = resp.data;

    // TODO: faq_id 난수 생성
    const questionLog: Omit<
      TQuestionLog,
      'id' | 'feedback_score' | 'feedback' | 'created_at'
    > = {
      faq_id: 1,
      user_question: question,
      language: isEnglish(question) ? 'EN' : 'KO',
    };

    await insertQuestionLog(conn, questionLog);

    res.json({ answer: nlpResp[0].text });
  } catch (error: any) {
    console.log(error.message);
    res.status(500).json({ error: 'get_answer 함수 호출 실패' });
  } finally {
    conn.release();
  }
}
