import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { ChatConfig } from './config';

export type Mail = { to: string; subject: string; text: string; replyTo?: string };
export type Mailer = { send: (mail: Mail) => Promise<void> };

/**
 * SMTP 설정이 있으면 실제로 보내고, 없으면(개발·테스트) .mail-outbox/에 JSON 파일로 남김
 * — 인증 코드를 메일 없이 확인할 수 있고, 테스트가 코드를 읽어 감
 */
export function createMailer(config: ChatConfig): Mailer {
	if (config.smtp) {
		const transport = nodemailer.createTransport({
			host: config.smtp.host,
			port: config.smtp.port,
			secure: config.smtp.secure,
			auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
		});
		return {
			send: async (mail) => {
				await transport.sendMail({ from: config.mailFrom, ...mail });
			},
		};
	}
	return {
		send: async (mail) => {
			await fs.mkdir(config.outboxDir, { recursive: true });
			const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`;
			await fs.writeFile(path.join(config.outboxDir, name), JSON.stringify({ from: config.mailFrom, ...mail }, null, 2));
			if (!config.production) console.log(`[chat] (개발) 메일 → ${mail.to}: ${mail.subject}  (${name})`);
		},
	};
}

/** 개발·테스트: 그 주소로 가장 최근에 보낸 메일 */
export async function readLatestOutbox(outboxDir: string, to: string): Promise<Mail | null> {
	let files: string[] = [];
	try {
		files = (await fs.readdir(outboxDir)).filter((f) => f.endsWith('.json')).sort();
	} catch {
		return null;
	}
	for (const f of files.reverse()) {
		const mail = JSON.parse(await fs.readFile(path.join(outboxDir, f), 'utf8')) as Mail;
		if (mail.to === to) return mail;
	}
	return null;
}
