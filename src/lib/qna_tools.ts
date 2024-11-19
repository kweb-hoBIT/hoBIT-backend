import TFAQ from '../models/FAQ';

export const calculateFaqWeights = (
  faqs: TFAQ[],
  tokens: string[],
  field: 'question_en' | 'question_ko'
): Record<number, number> => {
  const faqWeights: Record<number, number> = {};

  faqs.forEach((faq) => {
    let weight = 0;

    tokens.forEach((token) => {
      let occurrences;
      if (field == 'question_en') {
        occurrences = (
          faq[field].match(new RegExp(`\\b${token}\\b`, 'gi')) || []
        ).length;
      } else {
        occurrences = (faq[field]?.match(new RegExp(`${token}`, 'gi')) || [])
          .length;
      }

      weight += occurrences;
    });

    faqWeights[faq.id] = weight;
  });

  return faqWeights;
};
