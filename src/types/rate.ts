import { UserFeedbackReason } from './feedback';

export interface RateFaqRequest {
  faq_id: number;
  rate: 1 | -1;
  feedback_reason?: UserFeedbackReason; // 싫어요일 경우 필수
  feedback_detail?: string;            // 싫어요일 경우 필수
  language?: string;                   // 싫어요일 경우 필수
}

export interface RateFaqResponse {
  success: boolean;
}
