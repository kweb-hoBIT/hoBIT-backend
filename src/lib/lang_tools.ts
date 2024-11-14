export const isKorean: (str: string) => boolean = (str) => {
  const regex = /[가-힣]/;
  return regex.test(str);
};

export const isEnglish: (str: string) => boolean = (str) => {
  const regex = /^[A-Za-z]+$/;
  return regex.test(str);
};
