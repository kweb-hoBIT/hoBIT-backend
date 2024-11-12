import FAQ, { TFAQ } from "../models/FAQ";

export async function fetchAllFaqs() {
  try {
    const faqs: TFAQ[] = await FAQ.findAll({});
    return faqs;
  } catch (error) {
    throw new Error("전체 FAQ를 불러오지 못했습니다.");
  }
}
