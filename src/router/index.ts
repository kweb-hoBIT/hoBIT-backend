import express from 'express';

import { question, questionStream, recommendStart, recommendAfterFaq } from '../apis/question';
import { rateFaq } from '../apis/rate';
import { allFaqs, allQuestions, topFaqs, faqById } from '../apis/faq';
import { promiseHandler } from '../middleware/promise_handler';
import { directUserFeedback } from '../apis/userFeedback';
import { allSeniorFaqs, seniorFaqById } from '../apis/seniorFaq';
import { moderateContent } from '../apis/moderation';
import { chat } from '../apis/chat';
import { saveProfile, getProfile, deleteProfile } from '../apis/profile';
import { keywordRules } from '../apis/keywordRules';

export const router = express.Router();

router.get('/all_faqs', promiseHandler(allFaqs));
router.get('/faq', promiseHandler(faqById));
router.get('/all_questions', promiseHandler(allQuestions));
router.get('/top_faqs', promiseHandler(topFaqs));
router.get('/keyword_rules', promiseHandler(keywordRules));
router.get('/all_senior_faqs', promiseHandler(allSeniorFaqs));
router.get('/senior_faq', promiseHandler(seniorFaqById));

router.post('/question', promiseHandler(question));
router.post('/question/stream', promiseHandler(questionStream));
router.get('/recommend/start', promiseHandler(recommendStart));
router.post('/recommend/after-faq', promiseHandler(recommendAfterFaq));
router.post('/rate', promiseHandler(rateFaq));
router.post('/direct_user_feedback', promiseHandler(directUserFeedback));
router.post('/moderate', promiseHandler(moderateContent));
router.post('/chat', promiseHandler(chat));
router.post('/profile', promiseHandler(saveProfile));
router.get('/profile', promiseHandler(getProfile));
router.delete('/profile', promiseHandler(deleteProfile));
