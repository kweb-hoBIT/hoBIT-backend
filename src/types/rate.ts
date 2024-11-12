export interface RateRequestPayload {
  faq_id: number;
  action: "like" | "dislike";
}

export interface RateResponsePayload {
  success: boolean;
  message: string;
  error?: string;
}