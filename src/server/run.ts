import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import { router } from '../router/index';
import { errorHandler } from '../middleware/error_handler';
import { NotFoundError } from '../types';
import { logApi } from '../middleware/log';
import { swaggerSpec } from '../../swaggerConfig';

const PORT = 4000;
const API_V0 = '/api/v0';

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

	app.get('/health', (_req, res) => {
		res.status(200).json({ status: 'ok' });
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
