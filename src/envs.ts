import dotenv from 'dotenv';
dotenv.config({ path: './src/.env' });

export const envs: HobitEnv = {
  HOBIT_NLU_ENDPOINT: process.env['HOBIT_NLU_ENDPOINT'],
  SNOWFLAKE_MACHINE_ID: parseInt(process.env['SNOWFLAKE_MACHINE_ID'] || '1'),
};

interface HobitEnv {
  HOBIT_NLU_ENDPOINT: string | undefined;
  SNOWFLAKE_MACHINE_ID: number;
}
