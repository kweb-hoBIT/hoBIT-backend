import { TFAQ } from '../models/FAQ';

export type AllFaqsResponse = {
  faqs: TFAQ[];
};

export type Question = {
  id: number;
  question_ko: string;
  question_en: string;
};

export type AllQuestionsResponse = {
  questions: Question[];
};

export type ErrorResponse = {
  error: string;
};
