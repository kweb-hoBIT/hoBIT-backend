export type TQuestionLog = {
  id: number;
  faq_id: number | null;
  user_question: string;
  language: string;
  feedback_score: number | null;
  feedback: string | null;
  created_at?: Date;
};

export default TQuestionLog;
