export interface RateFaqRequest {
  faq_id: number;
  action: 1 | -1;
}

export interface RateFaqResponse {
  success: boolean;
}
