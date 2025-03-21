import express from 'express';

import { question, question_after } from '../apis/question';
import { rateFaq } from '../apis/rate';
import { allFaqs, allQuestions, topFaqs } from '../apis/faq';
import { promiseHandler } from '../middleware/promise_handler';
import { directUserFeedback } from '../apis/userFeedback';
import { allSeniorFaqs, seniorFaqById } from '../apis/seniorFaq';

export const router = express.Router();

router.get('/all_faqs', promiseHandler(allFaqs));
router.get('/all_questions', promiseHandler(allQuestions));
router.get('/top_faqs', promiseHandler(topFaqs));
router.post('/question', promiseHandler(question));
router.post('/question_after', promiseHandler(question_after));
router.post('/rate', promiseHandler(rateFaq));
router.post('/direct_user_feedback', promiseHandler(directUserFeedback));
router.get('/all_senior_faqs', promiseHandler(allSeniorFaqs));
router.get('/senior_faq', promiseHandler(seniorFaqById));
