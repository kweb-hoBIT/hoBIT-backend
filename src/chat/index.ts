import type { Server as HttpServer } from 'http';
import OpenAI from 'openai';
import { loadChatConfig, ChatConfig } from './config';
import { createChatPool } from './db';
import { createMailer, Mailer } from './mailer';
import { LocalStorage, FileStorage } from './storage';
import { makeTokens } from './tokens';
import { ChatService } from './service';
import { attachSocket } from './socket';
import { chatRouter } from './routes';
import type { LlmCheck } from './moderation';
import { createTranslator, Translator } from './translate';

/**
 * 실시간 채팅 붙이기: const chat = await createChat(httpServer); app.use('/api/v0/chat', chat.router)
 * 테스트는 config·mailer·storage·now를 바꿔 넣음
 */
export async function createChat(
	httpServer: HttpServer,
	overrides: { config?: ChatConfig; mailer?: Mailer; storage?: FileStorage; now?: () => Date; llm?: LlmCheck | null; translator?: Translator | null } = {}
) {
	const config = overrides.config ?? loadChatConfig();
	const pool = await createChatPool(config);
	const tokens = makeTokens(config);
	const service = new ChatService(
		pool,
		config,
		tokens,
		overrides.mailer ?? createMailer(config),
		overrides.storage ?? new LocalStorage(config.storageDir),
		overrides.now
	);
	const llm = overrides.llm === null ? undefined : (overrides.llm ?? defaultLlm(config));
	const translator = overrides.translator === null ? undefined : (overrides.translator ?? createTranslator());
	const realtime = attachSocket(httpServer, service, llm, translator);
	const router = chatRouter(service, realtime);

	// 보관 기간 정리 — 시작할 때 한 번, 이후 하루마다
	const retention = setInterval(() => service.runRetention().catch((e) => console.error('[chat] 보관 기간 정리 실패:', e)), 24 * 3600 * 1000);
	retention.unref();
	service.runRetention().catch(() => undefined);

	return {
		router,
		service,
		realtime,
		close: async () => {
			clearInterval(retention);
			await new Promise<void>((r) => realtime.io.close(() => r()));
			await pool.end();
		},
	};
}

/** 애매한 메시지만 기존 피드백 검사와 같은 모델로 (CHAT_LLM_MODERATION=1 이고 키가 있을 때) */
function defaultLlm(config: ChatConfig): LlmCheck | undefined {
	const key = process.env['OPENAI_API_KEY'] || process.env['OPENAI_KEY'];
	if (!config.llmModeration || !key) return undefined;
	const openai = new OpenAI({ apiKey: key });
	return async (text) => {
		const r = await openai.chat.completions.create({
			model: 'gpt-4o-mini',
			temperature: 0,
			max_tokens: 5,
			messages: [
				{
					role: 'system',
					content:
						'You moderate messages a university student sends to the administrative office (staff) in a live chat. ' +
						'Answer BLOCK for: profanity or masked profanity (e.g. "ㅅ*ㅂ"), slurs, hate, sexual content, threats, ' +
						'and sarcasm, mockery or disrespect toward the staff (e.g. "ㅋㅋㅋㅋ 일 잘하네" = sarcastic "great job", "어이없네 ㅋㅋ", "월급 받고 이것도 못 해?"). ' +
						'Answer ALLOW for genuine questions, polite complaints or criticism, and friendly laughter (e.g. "ㅎㅎ 감사합니다", "넵 ㅋㅋ 알겠습니다"). ' +
						'Answer exactly BLOCK or ALLOW.',
				},
				{ role: 'user', content: text.slice(0, 1000) },
			],
		});
		return (r.choices[0]?.message?.content ?? '').trim().toUpperCase().startsWith('BLOCK');
	};
}
