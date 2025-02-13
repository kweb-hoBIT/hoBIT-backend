import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface Env {
	TIMEZONE: string;
	DB_HOST: string;
	DB_USER: string;
	DB_PASSWORD: string;
	DB_NAME: string;
	JWT_SECRET: string;
	JWT_EXPIRATION: number;
}

function getEnv(): Env {
	const env = {
		TIMEZONE: process.env['TIMEZONE'],
		DB_HOST: process.env['DB_HOST'],
		DB_USER: process.env['DB_USER'],
		DB_PASSWORD: process.env['DB_PASSWORD'],
		DB_NAME: process.env['DB_NAME'],
		JWT_SECRET: process.env['JWT_SECRET'],
		JWT_EXPIRATION: Number(process.env['JWT_EXPIRATION']),
	};

	for (const [key, value] of Object.entries(env)) {
		if (!value && key != 'DB_PASSWORD') {
			throw new Error(`Missing environment variable: ${key}`);
		}
	}

	return env as Env;
}

const env = getEnv();

export default env;
