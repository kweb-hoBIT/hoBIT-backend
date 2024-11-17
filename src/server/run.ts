import express from 'express';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from '../../swaggerConfig';
import { router } from '../router/index';
import { errorHandler } from '../middleware/error_handler';
import { NotFoundError } from '../types';

const PORT = 4000;
const API_V0 = '/api/v0';

export async function runServer() {
  const app = express();

  app.get('/', (_req, res) => {
    res.send({ status: 'State' });
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use(express.json());
  app.use(API_V0, router);

  // 처리되지 않은 리소스에 대한 NotFoundError 추가
  app.use((req, _res, next) => {
    next(new NotFoundError(`The requested resource ${req.path} was not found`));
  });
  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
