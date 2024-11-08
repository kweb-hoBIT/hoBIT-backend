export interface Rate {
  questionId: string;
  rate: number;
}

export interface RateRequestPayload {
  rate: Rate;
}

export interface RateResponsePayload {
  success: boolean;
}
