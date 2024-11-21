export type NluRequest = {
  sender: string;
  message: string;
};

export type NluResponse = Array<NluSuccessUnit | NluAltUnit>;

export type NluSuccessUnit = {
  recipient_id: string;
  custom: NluCustomJson;
};

export type NluCustomJson = {
  faq_id: number;
};

export type NluAltUnit = {
  recipient_id: string;
  text: string;
};
