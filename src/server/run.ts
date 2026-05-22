import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import { router } from '../router/index';
import { errorHandler } from '../middleware/error_handler';
import { NotFoundError } from '../types';
import { logApi } from '../middleware/log';
import { swaggerSpec } from '../../swaggerConfig';
import axios from 'axios';
import { envs } from '../envs';

const PORT = 4000;
const API_V0 = '/api/v0';

// HOBIT_NLU_ENDPOINT (예: http://localhost:8080/webhooks/rest/webhook) 에서 origin 추출
const NLU_ORIGIN = (() => {
	try {
		return new URL(envs.HOBIT_NLU_ENDPOINT ?? '').origin;
	} catch {
		return undefined;
	}
})();

export async function runServer() {
	const app = express();

	app.use(logApi);

	app.use(
		cors({
			origin: [
				'https://www.hobit.kr',
				/^https:\/\/.*\.vercel\.app$/,
				'http://localhost:3000',
			],
			credentials: true,
		})
	);

	app.get('/', (_req, res) => {
		res.send({ status: 'State' });
	});

	// NLU(Rasa) 가용성까지 확인하는 readiness 체크.
	// 학습 등으로 Rasa가 내려가면 503 → 프론트가 ErrorPage로 전환됨.
	app.get('/health', async (_req, res) => {
		if (!NLU_ORIGIN) {
			res.status(503).json({ status: 'nlu_misconfigured' });
			return;
		}
		try {
			await axios.get(`${NLU_ORIGIN}/status`, { timeout: 1500 });
			res.status(200).json({ status: 'ok' });
		} catch {
			res.status(503).json({ status: 'nlu_down' });
		}
	});

	app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

	app.use(express.json());
	app.use(API_V0, router);

	app.use((req, _res, next) => {
		next(new NotFoundError(`The requested resource ${req.path} was not found`));
	});

	app.use(errorHandler);

	app.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`);
	});
}
