export interface RateFaqRequest {
  faq_id: number;
  user_question: string;
  rate: 1 | -1;
  language: string;
}

export interface RateFaqResponse {
  success: boolean;
}
