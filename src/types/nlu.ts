export type NluRequest = {
  sender: string;
  message: string;
};

export type NluResponse = Array<NluResponseUnit>;

export type NluResponseUnit = {
  recipient_id: string;
  text: string;
};
