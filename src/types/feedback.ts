import { QuestionLanguage } from './question';

export type UserFeedbackReason =
	| 'unrelated'
	| 'duplicate'
	| 'incorrect'
	| 'insufficient'
	| 'unclear'
	| 'other';

export const UserFeedbackReasonTranslations = {
	ko: {
		unrelated: '질문과 무관한 답변',
		duplicate: '중복된 답변',
		incorrect: '정보가 잘못됨',
		insufficient: '정보가 부족함',
		unclear: '내용이 이해하기 어려움',
		other: '기타',
	},
	en: {
		unrelated: 'Unrelated answer',
		duplicate: 'Duplicate answer',
		incorrect: 'Incorrect information',
		insufficient: 'Insufficient information',
		unclear: 'Unclear content',
		other: 'Other',
	},
};

export type DirectUserFeedbackRequest = {
	feedback_reason: UserFeedbackReason;
	feedback_detail: string;
	language: QuestionLanguage;
};

export type DirectUserFeedbackResponse = {
	success: boolean;
};
