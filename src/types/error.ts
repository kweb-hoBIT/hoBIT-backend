// 클라이언트에게 전달할 에러 타입
export type FrontError = {
  status: number;
  error: string;
};

// 서버에 로깅할 에러 타입
export type DevError = {
  message: string;
  stack?: string;
};

// 클라이언트 에러 생성 함수
export function createFrontError(status: number, error: string): FrontError {
  return { status, error };
}

// 서버 로그 에러 생성 함수
export function createDevError(error: Error): DevError {
  return {
    message: error.message,
    stack: error.stack,
  };
}
