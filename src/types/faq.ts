import { TFAQ } from "../models/FAQ";

export type TQuestionRequest = {
  question: string;
};

export type TQuestionResponse = {
  question: string;
};

export type TGetAllFaqsResponse = {
  faqs: TFAQ[];
};

export type TErrorResponse = {
  error: string;
};
