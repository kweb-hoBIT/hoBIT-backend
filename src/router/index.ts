import express from 'express';

import { question, allFaqs } from '../apis/question';
import { rateFaq } from '../apis/rate';

export const router = express.Router();

router.get('/all_faqs', allFaqs);
router.get('/question', question);
router.post('/rate', rateFaq);
