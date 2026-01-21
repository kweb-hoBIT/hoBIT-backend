import dotenv from 'dotenv';
dotenv.config({ path: './src/.env' });

export const envs: HobitEnv = {
  HOBIT_NLU_ENDPOINT: process.env['HOBIT_NLU_ENDPOINT'],
  OPENAI_KEY: process.env['OPENAI_KEY'],
};

interface HobitEnv {
  HOBIT_NLU_ENDPOINT: string | undefined;
  OPENAI_KEY: string | undefined;
}
