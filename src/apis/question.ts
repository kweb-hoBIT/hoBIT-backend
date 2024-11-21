import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { Pool } from '../../config/connectDB';
import TQuestionLog from '../models/QuestionLog';
import TFAQ from '../models/FAQ';
import {
  detectLanguage,
  isEnglish,
  tokenizeEnglish,
  tokenizeKorean,
} from '../lib/lang_tools';
import { calculateFaqWeights } from '../lib/qna_tools';
import {
  fetchAllFaqs,
  insertQuestionLog,
  fetchFaqByFaqId,
} from '../db_interface';
import {
  ErrorResponse,
  NluError,
  NluRequest,
  NluResponse,
  QuestionAfterRequest,
  QuestionAfterResponse,
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
      sender: 'hobit-backend',
      message: question,
    };

    const nlpResp: NluResponse = await fetchNlu(nluParams);

    if (!nlpResp || !nlpResp[0]) {
      throw new NluError('NLU 서버 요청 실패');
    }

    if ('text' in nlpResp[0]) {
      throw new NluError(nlpResp[0].text);
    }

    let faq = await fetchFaqByFaqId(conn, nlpResp[0].custom?.faq_id);
    res.status(200).json({ faq: faq });

    const questionLog: Omit<
      TQuestionLog,
      'id' | 'feedback_score' | 'feedback' | 'created_at'
    > = {
      faq_id: 1,
      user_question: question,
      language: detectLanguage(question),
    };

    await insertQuestionLog(conn, questionLog);
  } finally {
    conn.release();
  }
};

export const question_after = async (
  req: Request<{}, {}, QuestionAfterRequest>,
  res: Response<QuestionAfterResponse | ErrorResponse>
) => {
  const { question } = req.body;
  if (!question) {
    throw new ValidationError("invalid parameter, 'question' required");
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    const faqs: TFAQ[] = await fetchAllFaqs(conn);

    const tokens = isEnglish(question)
      ? tokenizeEnglish(question)
      : tokenizeKorean(question);

    const faqWeights = calculateFaqWeights(
      faqs,
      tokens,
      isEnglish(question) ? 'question_en' : 'question_ko'
    );

    const filteredFaqs: Array<TFAQ> = faqs
      .filter((faq) => faqWeights[faq.id]! > 0)
      .sort((a, b) => faqWeights[b.id]! - faqWeights[a.id]!)
      .slice(0, 5);

    res.json({ answersList: filteredFaqs });
  } finally {
    conn.release();
  }
};
