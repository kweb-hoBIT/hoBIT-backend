import express from 'express';

import { question } from '../apis/question';
import { rateFaq } from '../apis/rate';
import { allFaqs, allQuestions, topFaqs } from '../apis/faq';
import { promiseHandler } from '../middleware/promise_handler';
import { directUserFeedback } from '../apis/userFeedback';
import { allSeniorFaqs, seniorFaqById } from '../apis/seniorFaq';
import { moderateContent } from '../apis/moderation';

export const router = express.Router();

router.get('/all_faqs', promiseHandler(allFaqs));
router.get('/all_questions', promiseHandler(allQuestions));
router.get('/top_faqs', promiseHandler(topFaqs));
router.get('/all_senior_faqs', promiseHandler(allSeniorFaqs));
router.get('/senior_faq', promiseHandler(seniorFaqById));

router.post('/question', promiseHandler(question));
router.post('/rate', promiseHandler(rateFaq));
router.post('/direct_user_feedback', promiseHandler(directUserFeedback));
router.post('/moderate', promiseHandler(moderateContent));
