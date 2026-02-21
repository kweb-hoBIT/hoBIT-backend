import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DatabaseError } from '../types';
import { TSeniorFAQ } from '../models/SeniorFAQ';

export async function fetchAllSeniorFaqs(
	conn: PoolConnection
): Promise<TSeniorFAQ[]> {
	try {
		const [rows] = await conn.query<RowDataPacket[]>(`
      SELECT * FROM senior_faqs
      ORDER BY category_order, subcategory_order, detailcategory_order;
    `);

		const seniorFaqs: TSeniorFAQ[] = rows.map((row) => ({
			id: row['id'],
			maincategory_ko: row['maincategory_ko'],
			maincategory_en: row['maincategory_en'],
			subcategory_ko: row['subcategory_ko'],
			subcategory_en: row['subcategory_en'],
			detailcategory_ko: row['detailcategory_ko'],
			detailcategory_en: row['detailcategory_en'],
			answer_ko: row['answer_ko'],
			answer_en: row['answer_en'],
			category_order: row['category_order'],
			subcategory_order: row['subcategory_order'],
			detailcategory_order: row['detailcategory_order'],
			manager: row['manager'],
			created_by: row['created_by'],
			updated_by: row['updated_by'],
		}));

		return seniorFaqs;
	} catch (error: any) {
		throw new DatabaseError('Failed to retrieve senior faqs');
	}
}

export async function fetchSeniorFaqById(
	conn: PoolConnection,
	seniorFaqId: number
): Promise<TSeniorFAQ> {
	try {
		const [row] = await conn.query<RowDataPacket[]>(`
      SELECT * FROM senior_faqs where id = ${seniorFaqId};
    `);

		const row_data = row[0] as RowDataPacket;

		const seniorFaq: TSeniorFAQ = {
			id: row_data['id'],
			maincategory_ko: row_data['maincategory_ko'],
			maincategory_en: row_data['maincategory_en'],
			subcategory_ko: row_data['subcategory_ko'],
			subcategory_en: row_data['subcategory_en'],
			detailcategory_ko: row_data['detailcategory_ko'],
			detailcategory_en: row_data['detailcategory_en'],
			answer_ko: row_data['answer_ko'],
			answer_en: row_data['answer_en'],
			category_order: row_data['category_order'],
			subcategory_order: row_data['subcategory_order'],
			detailcategory_order: row_data['detailcategory_order'],
			manager: row_data['manager'],
			created_by: row_data['created_by'],
			updated_by: row_data['updated_by'],
		};

		return seniorFaq;
	} catch (error: any) {
		throw new DatabaseError('Failed to retrieve senior faq by id');
	}
}
