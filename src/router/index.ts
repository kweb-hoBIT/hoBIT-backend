import express from "express";

import { get_all_faqs, get_answer } from "../apis/question";

export const router = express.Router();

router.get("/all_faqs", get_all_faqs);
router.get("/question", get_answer);
