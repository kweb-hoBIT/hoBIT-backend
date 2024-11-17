import { QuestionLanguage } from '../types/question';

export type TQuestionLog = {
  id: number;
  faq_id: string | null;
  user_question: string;
  language: QuestionLanguage;
  feedback_score: number | null;
  feedback: string | null;
  created_at?: Date;
};

export default TQuestionLog;
