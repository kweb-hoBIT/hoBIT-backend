export interface RateFaqRequest {
	faq_id: number;
	rate: 1 | -1;
	language: string;
}

export interface RateFaqResponse {
	success: boolean;
}
