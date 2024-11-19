import express from 'express';

import { question, question_alter } from '../apis/question';
import { rateFaq } from '../apis/rate';
import { allFaqs } from '../apis/faq';
import { promiseHandler } from '../middleware/promise_handler';

export const router = express.Router();

/**
 * @swagger
 * /all_faqs:
 *   get:
 *     summary: Get all FAQs
 *     description: Retrieve a list of all FAQs
 *     responses:
 *       200:
 *         description: A list of FAQs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 faqs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                         example: 1
 *                       question:
 *                         type: string
 *                         example: What is Swagger?
 *                       answer:
 *                         type: string
 *                         example: Swagger is an API documentation tool.
 *       500:
 *         description: Error fetching FAQs
 */
router.get('/all_faqs', promiseHandler(allFaqs));

/**
 * @swagger
 * /question:
 *   post:
 *     summary: Get an answer for a question
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               question:
 *                 type: string
 *                 example: What is Swagger?
 *     responses:
 *       200:
 *         description: The answer to the question
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: Swagger is an API documentation tool.
 *       400:
 *         description: Missing question
 *       500:
 *         description: Error processing the question
 */
router.post('/question', promiseHandler(question));

router.post('/question_alter', promiseHandler(question_alter));

/**
 * @swagger
 * /rate:
 *   post:
 *     summary: Rate an FAQ
 *     description: Rate an FAQ by providing a `faq_id` and a `rate` (1 or -1).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               faq_id:
 *                 type: number
 *                 description: The ID of the FAQ to rate.
 *                 example: 1
 *               rate:
 *                 type: integer
 *                 enum: [1, -1]
 *                 description: The rate value. Use `1` for upvote and `-1` for downvote.
 *                 example: 1
 *     responses:
 *       200:
 *         description: Rating saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Missing required fields.
 *       500:
 *         description: Error saving the rating.
 */
router.post('/rate', rateFaq);
