/**
 * 상담 메일 설정 확인 — SMTP 접속을 확인하고 테스트 메일 한 통을 보냄
 *   npm run chat:mail-test -- 받을주소@korea.ac.kr
 * (비밀번호는 출력하지 않음)
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { loadChatConfig } from '../src/chat/config';

async function main() {
	const to = process.argv[2];
	if (!to) throw new Error('받을 주소를 넣어 주세요: npm run chat:mail-test -- 받을주소@korea.ac.kr');
	const config = loadChatConfig();
	if (!config.smtp) {
		console.log('SMTP_HOST가 비어 있어요 → 지금은 메일을 실제로 보내지 않고 .mail-outbox/에 파일로 남기는 개발 모드예요.');
		return;
	}
	const { host, port, secure, user } = config.smtp;
	console.log(`SMTP ${host}:${port} (${secure ? 'SSL' : 'STARTTLS'}) · 계정 ${user} · 보내는 사람 ${config.mailFrom}`);
	const transport = nodemailer.createTransport({
		host,
		port,
		secure,
		auth: user ? { user, pass: config.smtp.pass } : undefined,
	});
	await transport.verify();
	console.log('✓ SMTP 로그인 성공');
	const info = await transport.sendMail({
		from: config.mailFrom,
		to,
		subject: '[호빗] 상담 메일 설정 테스트',
		text: '호빗 실시간 상담 메일 설정이 잘 되었어요. 인증 코드와 운영시간 밖 문의가 이 계정으로 발송됩니다.',
	});
	console.log(`✓ 보냄 → ${to} (${info.messageId}) · 수락: ${info.accepted.join(', ') || '없음'} · 거부: ${info.rejected.join(', ') || '없음'}`);
}

main().catch((e) => {
	console.error('✗ 실패:', e.message);
	if (/Invalid login|Username and Password not accepted|535/.test(e.message)) {
		console.error('  → Gmail은 일반 비밀번호가 아니라 "앱 비밀번호"(16자리)가 필요해요. 2단계 인증을 켠 뒤 만들 수 있어요.');
	}
	process.exit(1);
});
