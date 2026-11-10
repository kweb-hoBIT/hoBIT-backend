import { NextFunction, Request, Response } from 'express';
import { CustomError } from '../types';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) return next(err);
  console.error(err);

  if (err instanceof CustomError) {
    console.error(err.statusCode);
    res.status(err.statusCode).send(err.externalErrorMessage);
  } else if (typeof (err as any).type === 'string' && (err as any).type.startsWith('entity.')) {
    // 본문 읽기 오류 (너무 큼 413 · JSON 형식 오류 400) — 500이 아니라 원래 상태로
    res.status(Number((err as any).status) || 400).send((err as any).type === 'entity.too.large' ? 'Payload too large' : 'Invalid request body');
  } else {
    // 배포에서는 내부 오류 내용을 밖에 보이지 않음 (DB·경로 정보가 섞일 수 있음)
    res.status(500).send(process.env['NODE_ENV'] === 'production' ? 'Internal Server Error' : err.message);
  }
};
