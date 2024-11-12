export type TFaqLog = {
  id: number;
  user_id: number | null;
  faq_id: number | null;
  prev_faq: string;
  new_faq: string;
  action_type: string;
  created_at?: Date;
  rate?: number | null;
};

export default TFaqLog;
