import { TFAQ } from '../models/FAQ';

export type AllFaqsResponse = {
  faqs: TFAQ[];
};

export type ErrorResponse = {
  error: string;
};
