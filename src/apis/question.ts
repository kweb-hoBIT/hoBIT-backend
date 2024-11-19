import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { Pool } from '../../config/connectDB';
import TQuestionLog from '../models/QuestionLog';
import TFAQ from '../models/FAQ';
import { isEnglish, tokenizeEnglish, tokenizeKorean } from '../lib/lang_tools';
import { fetchAllFaqs, insertQuestionLog } from '../db_interface';
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

    // TODO: faq_id 난수 생성
    // faq_XXX 형태로
    if (!nlpResp || !nlpResp[0]) {
      throw new NluError('NLU 서버 요청 실패');
    }

    res.status(200).json({ answer: nlpResp[0].text });

    const questionLog: Omit<
      TQuestionLog,
      'id' | 'feedback_score' | 'feedback' | 'created_at'
    > = {
      faq_id: 1,
      user_question: question,
      language: isEnglish(question) ? 'EN' : 'KO',
    };

    await insertQuestionLog(conn, questionLog);
  } finally {
    conn.release();
  }
};

export const question_alter = async (
  req: Request<{}, {}, QuestionRequest>,
  res: Response<Array<TFAQ> | ErrorResponse>
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

    res.json(filteredFaqs);
  } finally {
    conn.release();
  }
};

const calculateFaqWeights = (
  faqs: TFAQ[],
  tokens: string[],
  field: 'question_en' | 'question_ko'
): Record<number, number> => {
  const faqWeights: Record<number, number> = {};

  faqs.forEach((faq) => {
    let weight = 0;

    tokens.forEach((token) => {
      const occurrences = (
        faq[field].match(new RegExp(`\\b${token}\\b`, 'gi')) || []
      ).length;

      weight += occurrences;
    });

    faqWeights[faq.id] = weight;
  });

  return faqWeights;
};
