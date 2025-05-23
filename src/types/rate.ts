export interface RateFaqRequest {
  id: number;
  faq_id: number;
  user_question: string;
  rate: 1 | -1 | 0;
  language: string;
  feedback_reason: string | null;
  feedback_detail: string | null;
}

export interface RateFaqResponse {
  id: number;
  success: boolean;
}
