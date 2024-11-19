import TFAQ from '../models/FAQ';

export type QuestionRequest = {
  question: string;
};

export type QuestionAfterRequest = {
  question: string;
};

export type QuestionResponse = {
  answer: string;
};

export type QuestionAfterResponse = {
  answersList: Array<TFAQ>;
};

export type QuestionLanguage = 'KO' | 'EN';
