import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import type { ChatConfig } from './config';

/** 채팅 전용 DB (로컬·베타: hobit_beta). 기존 hobit 테이블은 건드리지 않음 */
export async function createChatPool(config: ChatConfig): Promise<Pool> {
	const { host, user, password, database, timezone } = config.db;
	if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`[chat] 잘못된 DB 이름: ${database}`);
	const admin = await mysql.createConnection({ host, user, password });
	await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
	await admin.end();
	const pool = mysql.createPool({
		host,
		user,
		password,
		database,
		timezone,
		waitForConnections: true,
		connectionLimit: 10,
		charset: 'utf8mb4',
	});
	// 연결마다 한국 시간으로 — NOW()·저장 시각이 DB 서버 시간대와 상관없이 같은 기준
	pool.pool.on('connection', (conn) => {
		conn.query(`SET time_zone = '+09:00'`);
	});
	await createTables(pool);
	return pool;
}

const TABLES = [
	`CREATE TABLE IF NOT EXISTS chat_agents (
		user_id INT PRIMARY KEY,
		username VARCHAR(45) NOT NULL,
		role ENUM('staff','senior','developer') NOT NULL DEFAULT 'staff', -- developer: 관리자 사이트 전체 + 역할 관리 (채팅에서는 staff와 같음)
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS chat_email_codes (
		id BIGINT AUTO_INCREMENT PRIMARY KEY,
		email VARCHAR(255) NOT NULL,
		code_hash CHAR(64) NOT NULL,
		expires_at DATETIME NOT NULL,
		attempts INT NOT NULL DEFAULT 0,
		used TINYINT NOT NULL DEFAULT 0,
		ip VARCHAR(64),
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		INDEX (email, created_at),
		INDEX (ip, created_at)
	)`,
	`CREATE TABLE IF NOT EXISTS chat_sessions (
		id CHAR(36) PRIMARY KEY,
		mode ENUM('staff','senior') NOT NULL,
		status ENUM('waiting','active','closed') NOT NULL DEFAULT 'waiting',
		student_email VARCHAR(255) NOT NULL,
		language VARCHAR(8) NOT NULL DEFAULT 'KO',
		profile JSON NULL,
		bot_context JSON NULL,
		assigned_user_id INT NULL,
		assigned_username VARCHAR(45) NULL,
		created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		started_at DATETIME NULL,
		closed_at DATETIME NULL,
		closed_by ENUM('student','agent','system') NULL,
		rating TINYINT NULL,
		rating_comment VARCHAR(500) NULL,
		last_message_at DATETIME NULL,
		INDEX (status, mode, created_at),
		INDEX (student_email, status),
		INDEX (closed_at)
	)`,
	`CREATE TABLE IF NOT EXISTS chat_attachments (
		id CHAR(36) PRIMARY KEY,
		session_id CHAR(36) NOT NULL,
		storage_key VARCHAR(255) NOT NULL,
		mime VARCHAR(64) NOT NULL,
		size INT NOT NULL,
		original_name VARCHAR(255) NOT NULL,
		width INT NULL,
		height INT NULL,
		uploaded_by ENUM('student','agent') NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		deleted_at DATETIME NULL,
		INDEX (session_id),
		INDEX (created_at)
	)`,
	`CREATE TABLE IF NOT EXISTS chat_messages (
		id BIGINT AUTO_INCREMENT PRIMARY KEY,
		session_id CHAR(36) NOT NULL,
		sender ENUM('student','agent','system') NOT NULL,
		sender_user_id INT NULL,
		sender_name VARCHAR(45) NULL,
		body TEXT NOT NULL,
		attachment_id CHAR(36) NULL,
		created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		INDEX (session_id, id)
	)`,
	`CREATE TABLE IF NOT EXISTS chat_blocks (
		email VARCHAR(255) PRIMARY KEY,
		reason VARCHAR(255) NULL,
		created_by INT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS chat_offline_mails (
		id BIGINT AUTO_INCREMENT PRIMARY KEY,
		email VARCHAR(255) NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		INDEX (email, created_at)
	)`, // 보낸 횟수만 (하루 3통 제한) — 메일 내용은 저장하지 않음
	// 담당자별 읽은 위치 — 안 읽은 메시지 수 (새로고침·다른 화면에서도 정확하게)
	`CREATE TABLE IF NOT EXISTS chat_reads (
		session_id CHAR(36) NOT NULL,
		user_id INT NOT NULL,
		last_read_id BIGINT NOT NULL DEFAULT 0,
		PRIMARY KEY (session_id, user_id)
	)`,
	`CREATE TABLE IF NOT EXISTS chat_settings (
		name VARCHAR(64) PRIMARY KEY,
		value JSON NOT NULL,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	)`,
];

// 나중에 추가한 칸 — 이미 만들어진 테이블에도 붙임 (MySQL·MariaDB 모두 되도록 information_schema로 확인)
const COLUMNS: [table: string, column: string, ddl: string][] = [
	['chat_messages', 'translation', 'TEXT NULL'], // 자동 번역 (학생 영어 → 한국어 / 담당자 한국어 → 영어)
	['chat_messages', 'translation_lang', 'VARCHAR(8) NULL'],
	['chat_sessions', 'student_lang', 'VARCHAR(8) NULL'], // 학생이 실제로 쓰는 언어 (메시지로 판단)
	['chat_messages', 'edited_at', 'DATETIME(3) NULL'], // 보낸 사람이 고친 시각 ("수정됨")
	['chat_messages', 'removed_at', 'DATETIME(3) NULL'], // 보낸 사람이 지운 시각 — 내용·첨부는 실제로 지움 ("삭제된 메시지예요")
];

async function createTables(pool: Pool) {
	for (const sql of TABLES) await pool.query(sql);
	for (const [table, column, ddl] of COLUMNS) {
		const [rows] = await pool.query<RowDataPacket[]>(
			`SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
			[table, column]
		);
		if (!rows.length) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
	}
}

export type Row = RowDataPacket & Record<string, unknown>;
