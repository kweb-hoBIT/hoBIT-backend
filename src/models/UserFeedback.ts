import { QuestionLanguage } from '../types';
import { UserFeedbackReason } from '../types/feedback';

export type UserFeedback = {
	id: number;
	feedback_reason: UserFeedbackReason | null;
	feedback_detail: string;
	language: QuestionLanguage;
	created_by: number | null;
};
