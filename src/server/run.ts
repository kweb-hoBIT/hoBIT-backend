import express from 'express';

import { router } from '../router/index';
import { allFaqs, question } from '../apis/question';
import { rateFaq } from '../apis/rate';

const PORT = 4000;
const API_V0 = 'api/v0';

export async function runServer() {
  const app = express();

  app.get('/', (_req, res) => {
    res.send({ status: 'State' });
  });

  app.get('/api/v0/all_faqs', allFaqs);
  app.get('/api/v0/question', question);
  app.post('/rate', rateFaq);

  app.use(API_V0, router);

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
