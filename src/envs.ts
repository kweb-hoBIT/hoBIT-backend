import dotenv from 'dotenv';
dotenv.config(); // 기본적으로 루트의 .env 사용

export const envs: HobitEnv = {
  HOBIT_NLU_ENDPOINT: process.env['HOBIT_NLU_ENDPOINT'],
  OPENAI_KEY: process.env['OPENAI_API_KEY'] || process.env['OPENAI_KEY'], // 두 이름 모두 (관리자 백엔드는 OPENAI_KEY)
  RAG_SERVER_URL: process.env['RAG_SERVER_URL'],
};

interface HobitEnv {
  HOBIT_NLU_ENDPOINT: string | undefined;
  OPENAI_KEY: string | undefined;
  RAG_SERVER_URL: string | undefined;
}
