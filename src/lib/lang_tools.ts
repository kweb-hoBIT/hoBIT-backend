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

export const stopWordsKor = new Set([
  // 감탄사 (IC)
  '그',
  '그래',
  '글쎄',
  '글쎄요',
  '네',
  '뭐',
  '아',
  '아냐',
  '아니야',
  '아니요',
  '아우',
  '아이',
  '아이고',
  '아이구',
  '아이씨',
  '얘',
  '어',
  '어머',
  '어유',
  '어휴',
  '어허',
  '에',
  '에이',
  '여보',
  '여보세요',
  '예',
  '오',
  '오케이',
  '와',
  '음',
  '응',
  '이봐',
  '임마',
  '자',
  '저',
  '저기',
  '참',
  '허',

  // 일반부사 (MAG)
  '괜히',
  '금방',
  '다',
  '대체',
  '도대체',
  '딱',
  '막',
  '맨날',
  '모두',
  '못',
  '무조건',
  '바로',
  '방금',
  '별로',
  '설마',
  '아무튼',
  '안',
  '어서',
  '얼른',
  '엄청',
  '열심히',
  '왜',
  '이리',
  '이미',
  '일단',
  '일찍',
  '잘',
  '잠시',
  '절대',
  '제대로',
  '제발',
  '제일',
  '조용히',
  '좀',
  '참',
  '확',

  // 대명사 (NP)
  '개',
  '그',
  '그놈',
  '그쪽',
  '나',
  '내',
  '너',
  '너희',
  '네',
  '니',
  '당신',
  '뭐',
  '애',
  '어디',
  '여기',
  '여러분',
  '우리',
  '이',
  '이름',
  '이쪽',
  '자기',
  '자네',
  '재',
  '저거',
  '저기',
  '저희',
  '지',

  // 의존명사 (NNB)
  '개',
  '것',
  '너석',
  '년',
  '놈',
  '달',
  '대',
  '대로',
  '리',
  '만',
  '명',
  '바',
  '번째',
  '살',
  '수',
  '시',
  '원',
  '이',
  '일',
  '장',
  '쪽',
  '차',
  '척',
  '초',
  '호',

  // 관형사 (MM)
  '그',
  '네',
  '단',
  '딴',
  '모든',
  '아무',
  '이',
  '저',
  '첫',

  // 보조용언 (VX)
  '가',
  '내',
  '달',
  '못하',
  '않',
  '주',

  // 접속부사 (MAJ)
  '그러면',
  '그런데',
  '그리고',
  '근데',
  '하지만',

  // 부정지정사 (VCN)
  '아니',

  // 긍정지정사 (VCP)
  '이',

  // hoBIT 커스텀
  '주세요',
  '세요',
  '해요',
  '합니다',
  '알려',
  '도와',
  '궁금',
  '방법',
]);

export const tokenizeKorean = (text: string): string[] => {
  const stopWordsRegex = new RegExp([...stopWordsKor].join('|'), 'g'); // 불용어를 정규식으로 변환

  const cleanedText = text
    .replace(/[^\uAC00-\uD7A3\s]/g, '') // 특수문자 제거
    .replace(stopWordsRegex, ' ') // 불용어를 공백으로 변환
    .replace(/\s+/g, ' ') // 연속된 공백을 단일 공백으로 변환
    .trim(); // 앞뒤 공백 제거

  const tokens = cleanedText.split(/\s+/);

  return tokens.filter((token) => token.length > 1);
};
