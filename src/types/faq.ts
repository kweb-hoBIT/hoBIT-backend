import { TFAQ } from "../models/FAQ";

export type QuestionRequest = {
  question: string;
};

export type QuestionResponse = {
  question: string;
};

export type AllFaqsResponse = {
  faqs: TFAQ[];
};

export type ErrorResponse = {
  error: string;
};
