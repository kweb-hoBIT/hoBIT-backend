import { NextFunction, Request, Response } from 'express';

type TError = {};

// Express 커스텀 에러 핸들러
function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const serverMessage = err.message || 'Internal Server Error.';

  // statusCode에 따라서 오류 메시지 유형 다양화하기
  const clientMessage = '서버에서 오류가 발생했습니다.';

  // 에러가 발생했을 때 서버에서 상세한 에러 메시지 로그 출력
  console.error(`[ERROR ${statusCode}]: ${serverMessage}`);

  // 이미 헤더가 전송된 경우, 다음 미들웨어로 에러 전달
  if (res.headersSent) {
    return next(err);
  }

  // 클라이언트에게는 보안상 일반적인 메시지만 전송
  res.status(statusCode).json({
    error: true,
    message: clientMessage,
  });
}

export default errorHandler;
