import express from 'express';

import { question } from '../apis/question';
import { rateFaq } from '../apis/rate';
import { allFaqs } from '../apis/faq';

export const router = express.Router();

router.get('/all_faqs', allFaqs);
router.post('/question', question);
router.post('/rate', rateFaq);
