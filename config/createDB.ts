import mysql from 'mysql2/promise';
import config from 'config';
import { insertFAQs } from './insertFAQs';

const dbHost = config.get<string>('dbHost');
const dbUser = config.get<string>('dbUser');
const dbPassword = config.get<string>('dbPassword');
const dbName = config.get<string>('dbName');
const timezone = config.get<string>('timezone');

// 데이터베이스 연결
export const createConnection = async (database: string = dbName) => {
  return await mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: database,
    timezone: timezone,
  });
};

const createDB = async () => {
  const connection = await mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
  });

  await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await connection.end();
};

// 테이블 생성 쿼리
const createUserTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(45) NOT NULL,
      password VARCHAR(100) NOT NULL,
      username VARCHAR(45) NOT NULL,
      phone_num VARCHAR(45) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;
  await connection.query(query);
  console.log('User table created or already exists.');
  await connection.end();
};

const createFAQTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS faqs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maincategory_ko VARCHAR(45) NOT NULL,
      maincategory_en VARCHAR(45) NOT NULL,
      subcategory_ko VARCHAR(45) NOT NULL,
      subcategory_en VARCHAR(45) NOT NULL,
      question_ko VARCHAR(300) NOT NULL,
      question_en VARCHAR(300) NOT NULL,
      answer_ko VARCHAR(3000) NOT NULL,
      answer_en VARCHAR(3000) NOT NULL,
      manager VARCHAR(300) NOT NULL,
      created_by INT,
      updated_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `;
  await connection.query(query);
  console.log('FAQ table created or already exists.');
  await connection.end();
};

const createQuestionLogTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS question_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      faq_id INT,
      user_question VARCHAR(300) NOT NULL,
      language VARCHAR(45) NOT NULL,
      feedback_score INT,
      feedback VARCHAR(300),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (faq_id) REFERENCES faqs(id) ON DELETE SET NULL
    );
  `;
  await connection.query(query);
  console.log('QuestionLog table created or already exists.');
  await connection.end();
};

const createFaqLogTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS faq_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      faq_id INT,
      prev_faq VARCHAR(1000) NOT NULL,
      new_faq VARCHAR(1000) NOT NULL,
      action_type VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (faq_id) REFERENCES faqs(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `;
  await connection.query(query);
  console.log('FaqLog table created or already exists.');
  await connection.end();
};

// 테이블 생성 실행
const createTables = async () => {
  await createUserTable();
  await createFAQTable();
  await createQuestionLogTable();
  await createFaqLogTable();
};

// 데이터베이스 및 테이블 생성
const initializeDatabase = async () => {
  await createDB();
  await createTables();
};

const populateDatabase = async () => {
  await initializeDatabase();
  await insertFAQs();
};

export { populateDatabase };
