import dotenv from 'dotenv';
dotenv.config({ path: './src/.env' });

export const envs: HobitEnv = {
  HOBIT_NLU_ENDPOINT: process.env.HOBIT_NLU_ENDPOINT,
};

interface HobitEnv {
  HOBIT_NLU_ENDPOINT: string | undefined;
}
