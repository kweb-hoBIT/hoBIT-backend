import { Request, Response } from 'express';
import {
  ErrorResponse,
  AllFaqsResponse,
  QuestionRequest,
  QuestionResponse,
} from '../types/faq';
import { fetchAllFaqs } from '../db_interface/faq';
import { PoolConnection } from 'mysql2/promise';
import { Pool } from '../../config/connectDB';
import { insertFaqLog } from '../db_interface/faqLog';
import axios from 'axios';
import { envs } from '../envs';
import { NluRequest } from '../types/nlu';

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
  req: Request<QuestionRequest>,
  res: Response<QuestionResponse | ErrorResponse>
) {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    let nluParams: NluRequest = {
      sender: 'hobit-back',
      message: req.body.question,
    };

    console.log('Nlu params: ', nluParams);

    const resp = await axios.post(envs.HOBIT_NLU_ENDPOINT!, nluParams, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Status:', resp.status);
    console.log('Headers:', resp.headers);
    console.log('Data:', resp.data);

    // 유사도 기반 질문 탐색 알고리즘 수행

    // res.send({ answer });

    // FAQ 로그 저장
    const newFaqLog = {
      user_id: null,
      faq_id: null,
      prev_faq: '',
      new_faq: question,
      action_type: 'Post',
    };

    //await insertFaqLog(conn, newFaqLog);

    res.json({ question });
  } catch (error: any) {
    console.log(error.message);
    res.status(500).json({ error: 'get_answer 함수 호출 실패' });
  } finally {
    conn.release();
  }
}
