import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * RAG 호출 — 연결 자체가 끊기면(응답을 받기 전) 잠깐 기다렸다 다시 시도
 * 배포로 RAG가 다시 켜지는 순간 처리 중이던 요청이 끊겨 "답변을 생성할 수 없습니다"가 나갔음
 * (2026-11-10: 백엔드 로그 'socket hang up' 68번, RAG가 끝나기 전 강제 종료됨). 다시 켜지는 데 몇 초 걸려 2·4·6·8초 간격으로.
 * 응답을 받은 뒤의 오류(500 등)나 학생이 멈춘 요청은 다시 보내지 않음
 */
const RAG_RETRY_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE']);
const RAG_RETRY_WAITS_MS = [2000, 4000, 6000, 8000]; // 합 20초 — RAG가 다시 켜지는 시간
export const isRagConnectionDrop = (e: any): boolean =>
	!e?.response && e?.code !== 'ERR_CANCELED' && (RAG_RETRY_CODES.has(e?.code) || /socket hang up/i.test(String(e?.message ?? '')));

export async function postRag(url: string, body: unknown, config: AxiosRequestConfig = {}): Promise<AxiosResponse> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await axios.post(url, body, config);
		} catch (e: any) {
			const wait = RAG_RETRY_WAITS_MS[attempt];
			if (wait === undefined || !isRagConnectionDrop(e) || config.signal?.aborted) throw e;
			console.warn(`[RAG] 연결 끊김(${e?.code ?? e?.message}) — ${wait / 1000}초 뒤 다시 시도: ${url}`);
			await new Promise((r) => setTimeout(r, wait));
			if (config.signal?.aborted) throw e;
		}
	}
}
