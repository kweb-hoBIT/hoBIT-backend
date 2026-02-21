export type TSeniorFAQ = {
	id: number;
	maincategory_ko: string;
	maincategory_en: string;
	subcategory_ko: string;
	subcategory_en: string;
	detailcategory_ko: string;
	detailcategory_en: string;
	answer_ko: string;
	answer_en: string;
	manager: string;
	category_order: number;
	subcategory_order: number;
	detailcategory_order: number;
	created_by: number | null;
	updated_by: number | null;
};

export default TSeniorFAQ;
