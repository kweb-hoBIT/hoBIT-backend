import { TSeniorFAQ } from '../models/SeniorFAQ';

export type AllSeniorFaqsResponse = {
	seniorFaqs: TSeniorFAQ[];
};

export type SeniorFaqResponse = {
	seniorFaq: TSeniorFAQ;
};

export type ErrorResponse = {
	error: string;
};
