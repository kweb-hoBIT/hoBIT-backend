import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { Pool } from '../../config/connectDB';
import TQuestionLog from '../models/QuestionLog';
import {
  insertQuestionLog,
  fetchFaqByFaqIds,
  fetchFaqByQuestionKo,
  fetchFaqByQuestionEn,
  latestIdQuestionLog,
} from '../db_interface';
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
  const { question, language } = req.body;
  if (!question) {
    throw new ValidationError("invalid parameter, 'question' required");
  } else if (!language) {
    throw new ValidationError("invalid parameter, 'language' required");
  }

  const conn: PoolConnection = await Pool.getConnection();

  try {
    let faqs =
      language == 'KO'
        ? await fetchFaqByQuestionKo(conn, question)
        : await fetchFaqByQuestionEn(conn, question);

    if (faqs.length > 0) {
      const questionLog: Omit<
        TQuestionLog,
        'id' | 'feedback_score' | 'feedback' | 'created_at'
      > = {
        faq_id: faqs[0]!.id,
        user_question: question,
        language,
      };

      await insertQuestionLog(conn, questionLog);
      const id = await latestIdQuestionLog(conn);
      res
        .status(200)
        .json({ faqs: faqs, is_greet: false, is_able: false, is_freq: false, id: id });
    } else {
      try {
        const nluParams: NluRequest = {
          sender: 'hobit-backend',
          message: question,
        };

        const nlpResp: NluResponse = await fetchNlu(nluParams);

        if (!nlpResp || !nlpResp[0]) {
          throw new NluError('NLU 서버 요청 실패');
        }

        //TODO: clean code
        if ('custom' in nlpResp[0]) {
          if (nlpResp[0].custom?.faq_id === 0) {
            res
              .status(200)
              .json({ faqs: [], is_greet: true, is_able: false, is_freq: false, id: -1 });
          } else if (nlpResp[0].custom?.faq_id === 1) {
            res
              .status(200)
              .json({ faqs: [], is_greet: false, is_able: true, is_freq: false, id: -1 });
          } else if (nlpResp[0].custom?.faq_id === 2) {
            res
              .status(200)
              .json({ faqs: [], is_greet: false, is_able: false, is_freq: true, id: -1 });
          }
        }

        let all_faq_ids: Array<number> = [];
        if ('text' in nlpResp[0] && nlpResp[1] && 'text' in nlpResp[1]) {
          const faq_ids = [...nlpResp[1].text.matchAll(/#(\d+)/g)].map(
            (match) => Number(match[1])
          );
          all_faq_ids = faq_ids;
        } else if ('custom' in nlpResp[0]) {
          all_faq_ids.push(nlpResp[0].custom?.faq_id);
        }

        const faqs = await fetchFaqByFaqIds(conn, all_faq_ids);

        const questionLog: Omit<
          TQuestionLog,
          'id' | 'feedback_score' | 'feedback' | 'created_at'
        > = {
          faq_id: faqs[0]!.id,
          user_question: question,
          language,
        };

        await insertQuestionLog(conn, questionLog);
        const id = await latestIdQuestionLog(conn);
        res
          .status(200)
          .json({ faqs: faqs, is_greet: false, is_able: false, is_freq: false, id: id });
      } finally {
        conn.release();
      }
    }
  } finally {
    conn.release();
  }
};
