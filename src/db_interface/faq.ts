import { Pool } from "../../config/connectDB";
import { PoolConnection, RowDataPacket } from "mysql2/promise";
import TFAQ from "../models/FAQ";

export async function fetchAllFaqs() {
  const conn: PoolConnection = await Pool.getConnection();

  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
SELECT * FROM faqs;
	`,
    );

    const faqs: TFAQ[] = rows.map((row) => ({
      id: row.id,
      maincategory_ko: row.maincategory_ko,
      maincategory_en: row.maincategory_en,
      subcategory_ko: row.subcategory_ko,
      subcategory_en: row.subcategory_en,
      question_ko: row.question_ko,
      question_en: row.question_en,
      answer_ko: row.answer_ko,
      answer_en: row.answer_en,
      manager: row.manager,
      created_by: row.created_by,
      updated_by: row.updated_by,
    }));

    return faqs;
  } catch (error: any) {
    console.error(error.message);
    throw new Error("전체 FAQ를 불러오지 못했습니다.");
  } finally {
    conn.release();
  }
}
