import TFAQ from '../models/FAQ';

export type QuestionRequest = {
  question: string;
  language: QuestionLanguage;
};

export type QuestionAfterRequest = {
  question: string;
  language: QuestionLanguage;
};

export type QuestionResponse = {
  faqs: TFAQ[] | null;
};

export type QuestionAfterResponse = {
  answersList: Array<TFAQ>;
};

export type QuestionLanguage = 'KO' | 'EN';
