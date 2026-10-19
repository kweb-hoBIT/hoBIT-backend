import TFAQ from '../models/FAQ';

export type QuestionRequest = {
  question: string;
  language: QuestionLanguage;
  standalone?: boolean; // 추천 칩에서 보낸 질문 — 앞 대화와 합쳐 검색하지 않음
};

export type QuestionAfterRequest = {
  question: string;
  language: QuestionLanguage;
};

export type QuestionResponse = {
  faqs: TFAQ[] | null;
  is_greet: boolean;
  is_able: boolean;
  is_freq: boolean;
  is_smalltalk: boolean;
  needs_profile: boolean;       // 막는 질문: 검색 전에 꼭 필요한 정보 (답변 없이 질문 카드만)
  missing_fields: string[];
  followup_fields: string[];    // 막지 않는 질문: 답변과 함께 보여주는 추가 정보 요청 (해당 여부 확인용)
  official_faqs: OfficialFaq[]; // "공식 답변 보기" 칩 — FAQ id로 바로 조회
  recommendations: RecItem[];   // 답변 아래 "이어서 많이 묻는 질문" (SPRINT 추천)
  id: number;
};

export type OfficialFaq = {
  row_id: number;
  source: 'mysql_faq' | 'mysql_senior_faq';
  question: string;
};

export type QuestionAfterResponse = {
  answersList: Array<TFAQ>;
};

export type QuestionLanguage = 'KO' | 'EN';

export type RecItem = {
  intent_id: string;
  intent_name: string;
  text: string;
  text_en?: string | null; // 영어 모드 표시용
  faq_id: number | null; // 있으면 클릭 시 FAQ id로 바로 조회
  reason?: string;
};
