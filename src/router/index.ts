import express from "express";

import { get_answer } from "@/apis/question";

export const router = express.Router();

router.get("/get_answer", get_answer);
