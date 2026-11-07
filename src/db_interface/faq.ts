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
		throw new DatabaseError('Failed to retrieve questions');
	}
}

export async function fetchAllFaqs(conn: PoolConnection) {
	try {
		const [rows] = await conn.query<RowDataPacket[]>(
			`
SELECT * FROM faqs
ORDER BY category_order, subcategory_order;
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
			category_order: row['category_order'],
			subcategory_order: row['subcategory_order'],
			manager: row['manager'],
			created_by: row['created_by'],
			updated_by: row['updated_by'],
		}));

		return faqs;
	} catch (error: any) {
		throw new DatabaseError('Failed to retrieve all faqs');
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
			category_order: row['category_order'],
			subcategory_order: row['subcategory_order'],
			manager: row['manager'],
			created_by: row['created_by'],
			updated_by: row['updated_by'],
		}));

		return faqs;
	} catch (error: any) {
		throw new DatabaseError(
			`Failed to retrieve faq with ids: '${faq_ids.join(', ')}'`
		);
	}
}

export async function fetchTopFaqs(conn: PoolConnection, limit: number) {
	try {
		const [rows] = await conn.query<RowDataPacket[]>(
			`
      SELECT f.*
      FROM (
          -- 최근 한 달 동안 쓰인 횟수 = FAQ를 직접 누른 기록 + AI 답변이 근거로 인용한 기록
          -- (리뉴얼은 대부분 질문을 직접 입력해 AI가 FAQ를 근거로 답함 — 누른 횟수만 세면 실제로 많이 쓰인 FAQ가 안 잡힘)
          SELECT f2.id AS faq_id, COUNT(*) AS count
          FROM question_logs q
          JOIN faqs f2 ON q.faq_id = f2.id OR FIND_IN_SET(f2.id, q.cited_faq_ids)
          WHERE q.created_at >= NOW() - INTERVAL 1 MONTH
          GROUP BY f2.id
          ORDER BY count DESC
          LIMIT ?
      ) AS top_faqs
      JOIN faqs f ON f.id = top_faqs.faq_id
      ORDER BY top_faqs.count DESC
      LIMIT ?;
      `,
			[limit, limit]
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
			category_order: row['category_order'],
			subcategory_order: row['subcategory_order'],
			manager: row['manager'],
			created_by: row['created_by'],
			updated_by: row['updated_by'],
		}));

		return faqs;
	} catch (error) {
		throw new DatabaseError('Failed to retrieve top faqs');
	}
}

export async function fetchFaqByQuestionKo(
	conn: PoolConnection,
	questionKo: string
): Promise<TFAQ[]> {
	try {
		const [rows] = await conn.query<RowDataPacket[]>(
			`
SELECT * FROM faqs
WHERE question_ko = ?;
      `,
			[questionKo]
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
			category_order: row['category_order'],
			subcategory_order: row['subcategory_order'],
			manager: row['manager'],
			created_by: row['created_by'],
			updated_by: row['updated_by'],
		}));

		return faqs;
	} catch (error: any) {
		throw new DatabaseError(
			`Failed to retrieve faq with corresponding '${questionKo}'`
		);
	}
}

export async function fetchFaqByQuestionEn(
	conn: PoolConnection,
	questionEn: string
): Promise<TFAQ[]> {
	try {
		const [rows] = await conn.query<RowDataPacket[]>(
			`
SELECT * FROM faqs
WHERE question_en = ?;
      `,
			[questionEn]
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
			category_order: row['category_order'],
			subcategory_order: row['subcategory_order'],
			manager: row['manager'],
			created_by: row['created_by'],
			updated_by: row['updated_by'],
		}));

		return faqs;
	} catch (error: any) {
		throw new DatabaseError(
			`Failed to retrieve faq with corresponding '${questionEn}'`
		);
	}
}
