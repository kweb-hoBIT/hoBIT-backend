import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DatabaseError } from '../types';
import { TSeniorFAQ } from '../models/SeniorFAQ';

export async function fetchAllSeniorFaqs(conn: PoolConnection): Promise<TSeniorFAQ[]> {
  try {
    const [rows] = await conn.query<RowDataPacket[]>(`
      SELECT * FROM senior_faqs;
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
      manager: row['manager'],
      created_by: row['created_by'],
      updated_by: row['updated_by'],
    }));

    return seniorFaqs;
  } catch (error: any) {
    throw new DatabaseError('Senior FAQs 데이터를 불러오지 못했습니다.');
  }
}