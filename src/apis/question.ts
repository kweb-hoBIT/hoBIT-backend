import { Request, Response } from "express";
import {
  ErrorResponse,
  AllFaqsResponse,
  QuestionRequest,
  QuestionResponse,
} from "../types/faq";
import { fetchAllFaqs } from "../db_interface/faq";

export async function allFaqs(res: Response<AllFaqsResponse | ErrorResponse>) {
  try {
    const faqs = await fetchAllFaqs();
    res.json({ faqs });
  } catch (error) {
    res.status(500).json({ error: "get_all_faqs 함수 호출 실패" });
  }
}

export async function question(
  req: Request<QuestionRequest>,
  res: Response<QuestionResponse | ErrorResponse>,
) {
  const { question } = req.params;

  try {
    const faqs = await fetchAllFaqs();

    // 유사도 기반 질문 탐색 알고리즘 수행

    // res.send({ answer });
  } catch (error: any) {
    console.error(error.message);
    res.status(500).json({ error: "get_answer 함수 호출 실패" });
  }
}
