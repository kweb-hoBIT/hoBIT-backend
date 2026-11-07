import mysql from 'mysql2/promise';
import env from './env';

const dbHost = env.DB_HOST;
const dbUser = env.DB_USER;
const dbPassword = env.DB_PASSWORD;
const dbName = env.DB_NAME;
const timezone = env.TIMEZONE;

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

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await connection.end();
};

const createUserTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(45) NOT NULL,
      password VARCHAR(100) NOT NULL,
      username VARCHAR(45) NOT NULL,
      phone_num VARCHAR(45) NOT NULL UNIQUE,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;
  await connection.query(query);
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
      category_order INT DEFAULT 1,
      subcategory_order INT DEFAULT 1,
      created_by INT,
      updated_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `;
  await connection.query(query);
  await connection.end();
};

const createSeniorFAQTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS senior_faqs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maincategory_ko VARCHAR(45) NOT NULL,
      maincategory_en VARCHAR(45) NOT NULL,
      subcategory_ko VARCHAR(45) NOT NULL,
      subcategory_en VARCHAR(45) NOT NULL,
      detailcategory_ko VARCHAR(45) NOT NULL,
      detailcategory_en VARCHAR(45) NOT NULL,
      answer_ko VARCHAR(3000) NOT NULL,
      answer_en VARCHAR(3000) NOT NULL,
      manager VARCHAR(45) NOT NULL,
      category_order INT DEFAULT 1,
      subcategory_order INT DEFAULT 1,
      detailcategory_order INT DEFAULT 1,
      created_by INT,
      updated_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `;
  await connection.query(query);
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
  await connection.end();
};

const createFaqLogTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS faq_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      faq_id INT,
      prev_faq TEXT NOT NULL,
      new_faq TEXT NOT NULL,
      action_type VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (faq_id) REFERENCES faqs(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `;
  await connection.query(query);
  await connection.end();
};

const createRelatedFaqTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS related_faqs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      faq_id INT, -- 아래 FOREIGN KEY가 쓰는 칸 (빠져 있어서 새 DB에서는 서버가 시작하지 못했음 · 관리자 백엔드·실제 테이블과 같게)
      related_faqs JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (faq_id) REFERENCES faqs(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    );
  `;
  await connection.query(query);
  await connection.end();
};

const createUserFeedbacksTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS user_feedbacks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      faq_id INT NULL,
      feedback_reason VARCHAR(255) NULL,
      feedback_detail TEXT NULL,
      language VARCHAR(45) NOT NULL,
      resolved INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (faq_id) REFERENCES faqs(id) ON DELETE SET NULL
    );
  `;
  await connection.query(query);
  await connection.end();
};

const createApiLogTable = async () => {
  const connection = await createConnection();
  const query = `
    CREATE TABLE IF NOT EXISTS api_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uri VARCHAR(255) NOT NULL,
      method VARCHAR(10) NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await connection.query(query);
  await connection.end();
};

const createTables = async () => {
  await createUserTable();
  await createFAQTable();
  await createSeniorFAQTable();
  await createQuestionLogTable();
  await createFaqLogTable();
  await createRelatedFaqTable();
  await createUserFeedbacksTable();
  await createApiLogTable();
};

// 나중에 추가한 칸 — 이미 만들어진 테이블에도 붙임 (MySQL·MariaDB 모두 되도록 information_schema로 확인)
const ADDED_COLUMNS: [table: string, column: string, ddl: string][] = [
  ['question_logs', 'ismatched', 'INT DEFAULT 0'],              // 밤 12시 작업이 이미 살펴본 질문 = 1
  ['question_logs', 'answer_status', 'VARCHAR(16) NULL'],       // answered | not_found (직접 입력한 질문의 RAG 답변 결과)
  ['question_logs', 'cited_faq_ids', 'VARCHAR(255) NULL'],      // 답변이 근거로 인용한 행정실 FAQ id (쉼표 구분)
  // 답변 추적 — 👎·못 찾은 질문을 관리자가 볼 때 "무슨 답을, 어떤 자료를 보고 했는지" 확인용
  ['question_logs', 'answer', 'MEDIUMTEXT NULL'],               // 학생에게 보인 최종 답변 (근거 대조 후)
  ['question_logs', 'cited_sources', 'TEXT NULL'],              // 인용한 근거 [{label, title, link}] (JSON)
  ['question_logs', 'routes', 'VARCHAR(255) NULL'],             // 규칙으로 정한 검색 경로 (학사일정·교육과정표·게시판 범위 등)
  ['question_logs', 'grounding_issues', 'VARCHAR(500) NULL'],   // 근거에 없어 답변에서 뺀 날짜·숫자
  ['question_logs', 'trace_id', 'VARCHAR(32) NULL'],            // RAG 검색 기록 파일 번호 (logs/날짜/rag_*_{trace_id}.json)
  ['question_logs', 'latency_ms', 'INT NULL'],                  // 질문을 받고 답을 다 보낼 때까지
  ['question_logs', 'classified_by', 'VARCHAR(8) NULL'],        // rule | llm — 질문 종류를 규칙으로 정했는지 (AI 분류 비율)
  ['question_logs', 'topic', 'VARCHAR(32) NULL'],               // 주제 지도로 알아본 주제 (hoBIT-rag/src/utils/topics.py)
  ['user_feedbacks', 'question_log_id', 'INT NULL'],            // 👎를 누른 답변 (question_logs.id)
  // 관리자 '답변 확인' 화면 — 👎·못 찾음·숫자를 뺀 답변을 확인한 결과
  ['question_logs', 'review_status', 'VARCHAR(16) NULL'],       // NULL = 확인 전 | done = 처리함 | ignored = 문제 없음
  ['question_logs', 'review_cause', 'VARCHAR(32) NULL'],        // no_data | outdated | wrong_answer | bad_search | ok
  ['question_logs', 'reviewed_at', 'TIMESTAMP NULL'],
];

const addColumns = async () => {
  const connection = await createConnection();
  try {
    for (const [table, column, ddl] of ADDED_COLUMNS) {
      const [rows]: any = await connection.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
      );
      if (!rows.length) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    }
  } finally {
    await connection.end();
  }
};

export const initializeDatabase = async () => {
  await createDB();
  await createTables();
  await addColumns();
};
