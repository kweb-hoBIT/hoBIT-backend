export type TFAQ = {
	id: number;
	maincategory_ko: string;
	maincategory_en: string;
	subcategory_ko: string;
	subcategory_en: string;
	question_ko: string;
	question_en: string;
	answer_ko: string;
	answer_en: string;
	manager: string;
	category_order: number;
	created_by: number | null;
	updated_by: number | null;
};

export type TFaqAnswer = TFaqCard[];

export type TFaqCard = {
	answer: string;
	url: string;
	email: string;
	phone: string;
};

export default TFAQ;
