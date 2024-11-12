import express from "express";

import { question, get_all_faqs } from "../apis/question";

export const router = express.Router();

router.get("/all_faqs", get_all_faqs);
router.get("/question", question);
