/**
 * 질문 횟수 제한 — 질문 하나마다 OpenAI 비용이 나가므로, 누가 스크립트로 대량으로 보내도 비용이 새지 않게.
 * 서버 한 대(pm2 1개)라 메모리에 셈. 서버가 다시 켜지면 초기화돼도 괜찮은 용도.
 *
 *   브라우저(세션)마다  1분 20번 · 하루 300번   — 학생 한 명이 정상적으로 쓰기엔 넉넉함
 *   IP마다             1분 120번 · 하루 3000번  — 학교 와이파이는 여러 학생이 IP 하나를 같이 써서 넉넉하게,
 *                                               세션 번호를 매번 바꿔 보내는 경우를 막는 용도
 *   (기준은 관리자 사이트 > 챗봇 설정에서 바꿈 — 위 숫자는 기본값)
 */
import { BotSettings, currentBotSettings } from '../services/bot_settings';

type Window = { limit: number; ms: number };
type Bucket = { start: number; count: number };

const sessionLimits = (s: BotSettings): Window[] => [
  { limit: s.sessionPerMin, ms: 60_000 },
  { limit: s.sessionPerDay, ms: 86_400_000 },
];
const ipLimits = (s: BotSettings): Window[] => [
  { limit: s.ipPerMin, ms: 60_000 },
  { limit: s.ipPerDay, ms: 86_400_000 },
];

const buckets = new Map<string, Bucket>();

function over(key: string, windows: Window[], now: number): boolean {
  let limited = false;
  for (const w of windows) {
    const k = `${key}:${w.ms}`;
    const b = buckets.get(k);
    if (!b || now - b.start >= w.ms) {
      buckets.set(k, { start: now, count: 1 });
      continue;
    }
    b.count += 1;
    if (b.count > w.limit) limited = true;
  }
  return limited;
}

// 서버 안에서 보내는 질문(시나리오 테스트·추천 문장 점검)은 제한하지 않음.
// 배포에서는 Caddy 뒤라 trust proxy로 실제 학생 IP가 들어오므로 학생 요청은 여기에 해당하지 않음
const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** true면 이번 질문은 막음 */
export function questionLimited(
  ip: string | undefined,
  sessionId: string | undefined,
  now = Date.now(),
  settings: BotSettings = currentBotSettings()
): boolean {
  if (ip && LOCAL_IPS.has(ip)) return false;
  const byIp = over(`ip:${ip || '-'}`, ipLimits(settings), now);
  const bySession = sessionId ? over(`s:${sessionId}`, sessionLimits(settings), now) : false;
  return byIp || bySession;
}

// 오래된 기록 정리 (10분마다) — 메모리가 계속 늘지 않게
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    const ms = Number(k.slice(k.lastIndexOf(':') + 1));
    if (now - b.start >= ms) buckets.delete(k);
  }
}, 600_000).unref();
