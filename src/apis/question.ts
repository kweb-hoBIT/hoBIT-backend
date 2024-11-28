import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { Pool } from '../../config/connectDB';
import TQuestionLog from '../models/QuestionLog';
import TFAQ from '../models/FAQ';
import { isEnglish, tokenizeEnglish, tokenizeKorean } from '../lib/lang_tools';
import { calculateFaqWeights } from '../lib/qna_tools';
import {
  fetchAllFaqs,
  insertQuestionLog,
  fetchFaqByFaqIds,
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
  const { question, language } = req.body;
  if (!question) {
    throw new ValidationError("invalid parameter, 'question' required");
  } else if (!language) {
    throw new ValidationError("invalid parameter, 'language' required");
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    const nluParams: NluRequest = {
      sender: 'hobit-backend',
      message: question,
    };

    const nlpResp: NluResponse = await fetchNlu(nluParams);

    if (!nlpResp || !nlpResp[0]) {
      throw new NluError('NLU 서버 요청 실패');
    }

    //TODO: clean code, ask nlu provider to provide response type
    let all_faq_ids: Array<number> = [];
    if ('text' in nlpResp[0] && nlpResp[1] && 'text' in nlpResp[1]) {
      const faq_ids = [...nlpResp[1].text.matchAll(/#(\d+)/g)].map((match) =>
        Number(match[1])
      );
      all_faq_ids = faq_ids;
    } else if ('custom' in nlpResp[0]) {
      all_faq_ids.push(nlpResp[0].custom?.faq_id);
    }

    const faqs = await fetchFaqByFaqIds(conn, all_faq_ids);
    res.status(200).json({ faqs: faqs });

    const questionLog: Omit<
      TQuestionLog,
      'id' | 'feedback_score' | 'feedback' | 'created_at'
    > = {
      faq_id: 1,
      user_question: question,
      language,
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
  const { question, language } = req.body;
  if (!question) {
    throw new ValidationError("invalid parameter, 'question' required");
  } else if (!language) {
    throw new ValidationError("invalid parameter, 'language' required");
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
