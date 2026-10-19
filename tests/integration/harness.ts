import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import express from 'express';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { io as ioClient, Socket } from 'socket.io-client';
import { createChat } from '../../src/chat';
import { loadChatConfig, ChatConfig } from '../../src/chat/config';
import type { Mail } from '../../src/chat/mailer';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * 통합 테스트용 서버: 진짜 express + socket.io + MariaDB(전용 테스트 DB) + 메모리 메일함 + 임시 파일 저장소
 * 시계는 테스트가 바꿀 수 있음 (운영 시간 안/밖)
 */
export const TEST_DB = process.env['CHAT_TEST_DB'] ?? 'hobit_chat_test';

export async function startServer() {
	const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hobit-chat-'));
	const mails: Mail[] = [];
	const clock = { now: new Date('2026-10-13T10:30:00+09:00') }; // 화요일 오전 (학기 중)
	const base = loadChatConfig();
	const config: ChatConfig = {
		...base,
		db: { ...base.db, database: TEST_DB },
		studentSecret: 'test-student',
		agentSecret: 'test-agent',
		fileSecret: 'test-file',
		storageDir,
		allowedOrigins: ['http://allowed.test'],
		// 개발용 .env 값(메일 인증 생략·시각 고정·SMTP)이 섞이지 않게 — 테스트는 항상 실제 흐름
		skipEmailVerify: false,
		nowOverride: null,
		smtp: null,
	};

	// 이전 실행의 흔적 없이 시작
	const admin = await mysql.createConnection({ host: config.db.host, user: config.db.user, password: config.db.password });
	await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
	await admin.end();

	const app = express();
	app.set('trust proxy', 'loopback');
	const server = http.createServer(app);
	const chat = await createChat(server, {
		config,
		mailer: { send: async (m) => void mails.push(m) },
		now: () => clock.now,
		llm: null,
		// 실제 번역 API는 부르지 않음 — 결과를 알아보기 쉬운 가짜 번역기
		translator: async (text, _from, to) => `[${to}] ${text}`,
	});
	app.use(express.json());
	app.use('/api/v0/chat', chat.router);
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
	const port = (server.address() as { port: number }).port;
	const url = `http://127.0.0.1:${port}`;
	const sockets: Socket[] = [];

	const api = async (method: string, p: string, opts: { token?: string; body?: unknown; form?: FormData } = {}) => {
		const res = await fetch(`${url}/api/v0/chat${p}`, {
			method,
			headers: {
				...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
				...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			},
			body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : null),
		});
		const text = await res.text();
		let json: Record<string, any> = {};
		try {
			json = JSON.parse(text);
		} catch {
			/* 파일 응답 등 */
		}
		return { status: res.status, json, headers: res.headers, text };
	};

	const connect = (auth: { kind: 'student' | 'agent'; token: string }, origin?: string) =>
		new Promise<Socket>((resolve, reject) => {
			const s = ioClient(url, {
				path: '/api/v0/chat/socket',
				auth,
				transports: ['websocket'],
				reconnection: false,
				...(origin ? { extraHeaders: { Origin: origin } } : {}),
			});
			sockets.push(s);
			s.on('connect', () => resolve(s));
			s.on('connect_error', (e) => reject(e));
		});

	/** 학교 메일 인증까지 마친 학생 */
	const verifiedStudent = async (email: string) => {
		const r = await api('POST', '/email/code', { body: { email } });
		if (r.status !== 200) throw new Error(`code ${r.status} ${JSON.stringify(r.json)}`);
		const code = /(\d{6})/.exec(mails.filter((m) => m.to === email).pop()?.text ?? '')?.[1];
		const v = await api('POST', '/email/verify', { body: { email, code } });
		if (v.status !== 200) throw new Error(`verify ${v.status}`);
		return v.json['token'] as string;
	};

	return {
		url,
		api,
		connect,
		verifiedStudent,
		mails,
		clock,
		chat,
		config,
		agentToken: (uid: number, name: string, role: 'staff' | 'senior') => chat.service.tokens.signAgent(uid, name, role),
		resetRateLimits: () => chat.service.pool.query('DELETE FROM chat_email_codes'),
		stop: async () => {
			sockets.forEach((s) => s.disconnect());
			await chat.close();
			await new Promise<void>((r) => server.close(() => r()));
			const a = await mysql.createConnection({ host: config.db.host, user: config.db.user, password: config.db.password });
			await a.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
			await a.end();
			await fs.rm(storageDir, { recursive: true, force: true });
		},
	};
}

export type Harness = Awaited<ReturnType<typeof startServer>>;

/** 이벤트 하나를 기다림 (조건에 맞는 것) */
export function waitFor<T = any>(socket: Socket, event: string, match: (p: T) => boolean = () => true, ms = 4000): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off(event, handler);
			reject(new Error(`timeout waiting for ${event}`));
		}, ms);
		const handler = (p: T) => {
			if (!match(p)) return;
			clearTimeout(timer);
			socket.off(event, handler);
			resolve(p);
		};
		socket.on(event, handler);
	});
}

/** 이벤트가 오지 않아야 함 */
export function expectSilence(socket: Socket, event: string, ms = 600): Promise<void> {
	return new Promise((resolve, reject) => {
		const handler = (p: unknown) => {
			socket.off(event, handler);
			reject(new Error(`unexpected ${event}: ${JSON.stringify(p)}`));
		};
		socket.on(event, handler);
		setTimeout(() => {
			socket.off(event, handler);
			resolve();
		}, ms);
	});
}

export const emit = <T = Record<string, any>>(socket: Socket, event: string, payload: unknown): Promise<T> =>
	new Promise((resolve) => socket.emit(event, payload, (res: T) => resolve(res)));
