import { Request, Response } from "express";
import {
  TErrorResponse,
  TGetAllFaqsResponse,
  TQuestionRequest,
  TQuestionResponse,
} from "../types/faq";
import { fetchAllFaqs } from "../db_interface/faq";

export async function get_all_faqs(
  _req: Request,
  res: Response<TGetAllFaqsResponse | TErrorResponse>,
) {
  try {
    const faqs = await fetchAllFaqs();
    res.json({ faqs });
  } catch (error) {
    res.status(500).json({ error: "get_all_faqs 함수 호출 실패" });
  }
}

export async function question(
  req: Request<TQuestionRequest>,
  res: Response<TQuestionResponse | TErrorResponse>,
) {
  const { question } = req.params;

  try {
    const faqs = await fetchAllFaqs();

    // 유사도 기반 질문 탐색 알고리즘 수행

    // res.send({ answer });
  } catch (error) {
    res.status(500).json({ error: "get_answer 함수 호출 실패" });
  }
}
