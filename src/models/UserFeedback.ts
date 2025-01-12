import { QuestionLanguage } from '../types';
import { UserFeedbackReason } from '../types/feedback';
import TFAQ from './FAQ';

export type UserFeedback = {
  id: number;
  faq_id: TFAQ[] | null;
  feedback_reason: UserFeedbackReason | null;
  feedback_detail: string;
  language: QuestionLanguage;
  created_by: number | null;
};
