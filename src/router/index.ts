import express from 'express';

import { question, question_after } from '../apis/question';
import { rateFaq } from '../apis/rate';
import { allFaqs, allQuestions, topFaqs } from '../apis/faq';
import { promiseHandler } from '../middleware/promise_handler';
import { directUserFeedbacks } from '../apis/userFeedback';

export const router = express.Router();

router.get('/all_faqs', promiseHandler(allFaqs));
router.get('/all_questions', promiseHandler(allQuestions));
router.post('/question', promiseHandler(question));
router.post('/question_after', promiseHandler(question_after));
router.post('/rate', rateFaq);
router.get('/top_faqs', promiseHandler(topFaqs));
router.post('/direct_user_feedback', directUserFeedbacks);
