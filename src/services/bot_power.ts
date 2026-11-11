/**
 * 챗봇 켜기·끄기 (관리자 사이트 > 챗봇 설정 맨 위) — 끄면 학생 화면이 '잠시 쉬어가요' 오류 화면(우는 호빗)
 *
 * - 저장: 채팅 DB chat_settings name='power' {enabled, updatedBy}. 메모리에 두고 15초마다 다시 읽음 (bot_settings와 같은 방식)
 * - 바꾸기: 행정실·개발자 계정 + 개발자 키(서버 .env의 BOT_POWER_KEY)가 맞아야 — 실수로 학생 전체가 못 쓰게 되는 것을 막기 위해
 *   키가 서버에 없으면 바꿀 수 없음 (켜진 채로)
 * - 꺼져 있으면: /health가 botEnabled=false를 알려 줌(서버 상태 확인은 그대로 200 — 배포 스크립트가 /health로 살아 있는지 봄),
 *   질문 API는 503 {maintenance}
 */
import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const BOT_OFF_MESSAGE = '호빗이 잠시 쉬고 있어요. 잠시 후 다시 찾아 주세요.';

const CACHE_MS = 15_000;
let enabled = true;
let loadedAt = 0;
let loader: (() => Promise<boolean>) | null = null;

export const registerBotPowerLoader = (fn: () => Promise<boolean>) => {
	loader = fn;
	loadedAt = 0;
};
export const setBotPower = (on: boolean) => {
	enabled = on;
	loadedAt = Date.now();
};

/** 지금 켜져 있는지 — 15초 지났으면 DB에서 다시 (실패하면 쓰던 값) */
export async function botEnabled(): Promise<boolean> {
	if (loader && Date.now() - loadedAt >= CACHE_MS) {
		loadedAt = Date.now();
		try {
			enabled = await loader();
		} catch (e) {
			console.error('[bot-power] 불러오기 실패 — 쓰던 값 유지:', (e as Error).message);
		}
	}
	return enabled;
}

/** 개발자 키 확인 — 서버에 키가 없으면 'no_key' */
export function checkPowerKey(given: unknown): 'ok' | 'no_key' | 'bad_key' {
	const key = process.env['BOT_POWER_KEY'] ?? '';
	if (!key) return 'no_key';
	const a = Buffer.from(String(given ?? ''));
	const b = Buffer.from(key);
	return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'bad_key';
}
export const powerKeyConfigured = () => Boolean(process.env['BOT_POWER_KEY']);

/** 질문 API 앞에 — 꺼져 있으면 503 (학생 화면은 새로 불러와 오류 화면을 보여 줌) */
export async function botPowerGuard(_req: Request, res: Response, next: NextFunction) {
	if (await botEnabled()) return next();
	res.status(503).json({ maintenance: true, botOff: true, message: BOT_OFF_MESSAGE });
}
