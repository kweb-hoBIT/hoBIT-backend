import express from 'express';
import http from 'http';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import { router } from '../router/index';
import { errorHandler } from '../middleware/error_handler';
import { NotFoundError } from '../types';
import { logApi } from '../middleware/log';
import { swaggerSpec } from '../../swaggerConfig';
import { createChat } from '../chat';

const PORT = Number(process.env['PORT'] ?? 4000); // release와 함께 띄울 때 .env에서 PORT 지정
const API_V0 = '/api/v0';

export async function runServer() {
	const app = express();
	const server = http.createServer(app); // 실시간 채팅(socket.io)이 같은 포트를 씀
	app.set('trust proxy', 'loopback'); // 배포 때 Caddy 뒤 — 요청 IP(인증 코드 제한용)

	app.use(logApi);

	app.use(
		cors({
			origin: [
				'https://www.hobit.kr',
				// 추가로 허용할 화면 주소 (예: 베타 https://beta.hobit.kr) — 쉼표로 여러 개
				...(process.env['CORS_ORIGINS'] ?? '')
					.split(',')
					.map((o) => o.trim())
					.filter(Boolean),
				/^https:\/\/.*\.vercel\.app$/,
				// 로컬 개발: release(3000)·renewal(3001) 프론트를 함께 띄우는 경우
				/^http:\/\/localhost:\d+$/,
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
	// 실시간 채팅 — DB(hobit_beta)를 못 열어도 호빗 답변은 계속 동작하도록 실패는 로그만
	try {
		const chat = await createChat(server);
		app.use(`${API_V0}/chat`, chat.router);
		console.log('[chat] 실시간 채팅 준비됨');
	} catch (e) {
		console.error('[chat] 실시간 채팅을 시작하지 못했어요:', e);
	}
	app.use(API_V0, router);

	app.use((req, _res, next) => {
		next(new NotFoundError(`The requested resource ${req.path} was not found`));
	});

	app.use(errorHandler);

	server.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`);
	});
}
