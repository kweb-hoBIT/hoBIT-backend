import { NextFunction, Request, Response } from 'express';
import { Pool } from '../../config/connectDB';

/**
 * API 호출 로그 (api_logs).
 * 요청을 먼저 통과시키고 기록은 비동기로 — 요청마다 DB 연결을 기다리지 않게 하고,
 * DB 장애가 나도 API 응답은 계속 나가게 한다. Pool.query는 연결을 잡고 바로 반납한다.
 */
export const logApi = (req: Request, _res: Response, next: NextFunction) => {
  next();
  Pool.query('INSERT INTO api_logs (uri, method) VALUES (?, ?)', [req.originalUrl, req.method.toLowerCase()])
    .catch((err) => console.warn('[logApi] 기록 실패:', err?.message ?? err));
};
