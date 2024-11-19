//TODO: 언어를 섞어서 쓰면?

export const isKorean: (str: string) => boolean = (str) => {
  const regex = /[가-힣]/;
  return regex.test(str);
};

export const isEnglish: (str: string) => boolean = (str) => {
  const regex = /^[A-Za-z]+$/;
  return regex.test(str);
};

export const tokenizeEnglish = (text: string): string[] => {
  const cleanedText = text.replace(/[^\w\s]/gi, '').toLowerCase();

  const tokens = cleanedText.split(/\s+/);

  const stopWordsEng = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'and',
    'or',
    'but',
    'if',
    'then',
    'so',
    'because',
    'on',
    'at',
    'to',
    'from',
    'in',
    'out',
    'of',
    'by',
    'for',
    'with',
    'about',
    'as',
    'into',
    'like',
    'through',
    'after',
    'over',
    'between',
    'it',
    'its',
    'this',
    'that',
    'these',
    'those',
    'which',
    'who',
    'whom',
    'whose',
    'what',
    'when',
    'where',
    'why',
    'how',
  ]);

  const meaningfulTokens = tokens.filter(
    (word) => word.length > 2 && !stopWordsEng.has(word)
  );

  return meaningfulTokens;
};

export const tokenizeKorean = (text: string): string[] => {
  const cleanedText = text.replace(/[^\uAC00-\uD7A3\s]/g, '');

  const tokens = cleanedText.split(/\s+/);

  const stopWordsKor = new Set([
    '은',
    '는',
    '이',
    '가',
    '을',
    '를',
    '에',
    '의',
    '와',
    '과',
    '으로',
    '부터',
    '까지',
    '도',
    '로',
    '에서',
    '하면',
    '하지만',
    '그리고',
    '그러나',
    '또한',
    '즉',
  ]);

  const meaningfulTokens = tokens.filter(
    (token) => token.length > 1 && !stopWordsKor.has(token)
  );

  return meaningfulTokens;
};
