import { Request, Response } from "express";
import FAQ, { TFAQ } from "../models/FAQ";
import { TFaqLog } from "../models/FAQLog";

type TFAQItem = {
  id: number;
  maincategory_ko: string;
  maincategory_en: string;
  subcategory_ko: string;
  subcategory_en: string;
  question_ko: string;
  question_en: string;
  answer_ko: string;
  answer_en: string;
  manager: string;
  created_by: number | null;
  updated_by: number | null;
};

async function fetchAllFaqs() {
  try {
    const faqs: TFAQItem[] = await FAQ.findAll({});
    return faqs;
  } catch (error) {
    throw new Error("전체 FAQ를 불러오지 못했습니다.");
  }
}

type TGetAllFaqsResponse = {
  faqs: TFAQItem[];
};

type TErrorResponse = {
  error: string;
};

export async function get_all_faqs(
  _req: Request,
  res: Response<TGetAllFaqsResponse | TErrorResponse>
) {
  try {
    const faqs = await fetchAllFaqs();
    res.json({ faqs });
  } catch (error) {
    res.status(500).json({ error: "get_all_faqs 함수 호출 실패" });
  }
}

type TQuestionParams = {
  question: string;
};

type TGetAnwerResponse = {
  answer: TFAQItem;
};

export async function get_answer(
  req: Request<TQuestionParams>,
  res: Response<TGetAnwerResponse | TErrorResponse>
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
