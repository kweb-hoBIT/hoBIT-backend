import fs from 'fs';
import TFAQ from '../src/models/FAQ';
import { createConnection } from './createDB';
import SnowflakeID from 'snowflake-id';

const BASE_DB_JSON_PATH: string = './config/base_db.json';

const snowflake = new SnowflakeID({ mid: 42 });

const insertFAQs = async () => {
  const conn = await createConnection();

  const file = fs.readFileSync(BASE_DB_JSON_PATH, 'utf-8');
  const faqs: Omit<TFAQ, 'id' | 'created_by' | 'updated_by'>[] =
    JSON.parse(file);

  for (const faq of faqs) {
    const query = `
      INSERT INTO faqs (
        id, maincategory_ko, maincategory_en, subcategory_ko, subcategory_en, 
        question_ko, question_en, answer_ko, answer_en, manager
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      snowflake.generate(),
      faq.maincategory_ko,
      faq.maincategory_en,
      faq.subcategory_ko,
      faq.subcategory_en,
      faq.question_ko,
      faq.question_en,
      faq.answer_ko,
      faq.answer_en,
      faq.manager,
    ];

    await conn.execute(query, values);
  }

  await conn.end();
};

export { insertFAQs };
