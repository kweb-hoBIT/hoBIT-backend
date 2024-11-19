//TODO: 언어를 섞어서 쓰면?

export const isKorean: (str: string) => boolean = (str) => {
  const regex = /[가-힣]/;
  return regex.test(str);
};

export const isEnglish: (str: string) => boolean = (str) => {
  const regex = /^[A-Za-z]+$/;
  return regex.test(str);
};

export const isMixedLanguage: (str: string) => boolean = (str) => {
  const hasKorean = /[가-힣]/.test(str);
  const hasEnglish = /[A-Za-z]/.test(str);
  return hasKorean && hasEnglish;
};

export const detectLanguage: (str: string) => 'KO' | 'EN' = (str) => {
  if (isMixedLanguage(str)) {
    return 'EN';
  }
  return /[가-힣]/.test(str) ? 'KO' : 'EN';
};