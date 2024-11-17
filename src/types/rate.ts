export interface RateFaqRequest {
  faq_id: number;
  rate: 1 | -1;
}

export interface RateFaqResponse {
  success: boolean;
}
