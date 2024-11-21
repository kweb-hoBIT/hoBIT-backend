import { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { DatabaseError, Question } from '../types';
import TFAQ from '../models/FAQ';

export async function fetchAllQuestions(
  conn: PoolConnection
): Promise<Question[]> {
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
SELECT id, question_ko, question_en FROM faqs;
      `
    );

    const questions: Question[] = rows.map((row) => ({
      faq_id: row['id'],
      question_ko: row['question_ko'],
      question_en: row['question_en'],
    }));

    return questions;
  } catch (error: any) {
    throw new DatabaseError('질문 목록을 불러오지 못했습니다.');
  }
}

export async function fetchAllFaqs(conn: PoolConnection) {
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
SELECT * FROM faqs;
	`
    );

    const faqs: TFAQ[] = rows.map((row) => ({
      id: row['id'],
      maincategory_ko: row['maincategory_ko'],
      maincategory_en: row['maincategory_en'],
      subcategory_ko: row['subcategory_ko'],
      subcategory_en: row['subcategory_en'],
      question_ko: row['question_ko'],
      question_en: row['question_en'],
      answer_ko: row['answer_ko'],
      answer_en: row['answer_en'],
      manager: row['manager'],
      created_by: row['created_by'],
      updated_by: row['updated_by'],
    }));

    return faqs;
  } catch (error: any) {
    throw new DatabaseError('전체 FAQ를 불러오지 못했습니다.');
  }
}

export async function fetchFaqByFaqIds(
  conn: PoolConnection,
  faq_ids: number[]
): Promise<TFAQ[]> {
  try {
    if (faq_ids.length === 0) return [];

    const placeholders = faq_ids.map(() => '?').join(', ');

    const [rows] = await conn.query<RowDataPacket[]>(
      `
SELECT * FROM faqs
WHERE id IN (${placeholders});
      `,
      faq_ids
    );

    const faqs: TFAQ[] = rows.map((row) => ({
      id: row['id'],
      maincategory_ko: row['maincategory_ko'],
      maincategory_en: row['maincategory_en'],
      subcategory_ko: row['subcategory_ko'],
      subcategory_en: row['subcategory_en'],
      question_ko: row['question_ko'],
      question_en: row['question_en'],
      answer_ko: row['answer_ko'],
      answer_en: row['answer_en'],
      manager: row['manager'],
      created_by: row['created_by'],
      updated_by: row['updated_by'],
    }));

    return faqs;
  } catch (error: any) {
    throw new DatabaseError(
      `IDs '${faq_ids.join(', ')}'에 해당하는 FAQ를 불러오지 못했습니다.`
    );
  }
}
