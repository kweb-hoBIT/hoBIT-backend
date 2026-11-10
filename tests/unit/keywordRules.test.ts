// 관리자 키워드 규칙 — 한국어·영어 비교, 검색어에 더할 대표 키워드 (DB 없이)
import { filterKeywordRules, KeywordRule, matchKeywordRules, ruleSearchTerms } from '../../src/apis/keywordRules';
import { Pool } from '../../config/connectDB';

jest.mock('../../config/connectDB', () => ({ Pool: { query: jest.fn() } }));

const rule = (r: Partial<KeywordRule> & { keyword: string }): KeywordRule => ({
	keyword_en: '',
	synonyms: [],
	synonyms_en: [],
	pinned: [],
	sources: [],
	...r,
});

const cs = rule({
	keyword: '컴퓨터학과',
	keyword_en: 'computer science',
	synonyms: ['컴학', '컴과'],
	synonyms_en: ['cs', 'comp sci'],
	pinned: [{ faq_id: 7, question_ko: '컴퓨터학과 졸업요건이 궁금해!', question_en: 'Computer Science graduation requirements?' }],
});
const legacy = rule({ keyword: '데이터과학과', synonyms: ['데과', 'DS'] }); // 예전 모양: 영어가 synonyms에 섞임
const ipsi = rule({ keyword: '입시', synonyms: ['수시', '정시'] });
const rules = [cs, legacy, ipsi];
const names = (q: string) => filterKeywordRules(rules, q).map((r) => r.keyword);

describe('키워드 규칙 비교', () => {
	test('한국어 질문의 영어 약어도 걸림 — "CS 졸업요건"', () => {
		expect(names('CS 졸업요건')).toEqual(['컴퓨터학과']);
		expect(names('컴학 졸업요건')).toEqual(['컴퓨터학과']);
	});

	test('영어 질문 — 영어 단어·영어 대표 키워드 (단어 단위, 대소문자 무시)', () => {
		expect(names('cs graduation requirements')).toEqual(['컴퓨터학과']);
		expect(names('What is Computer Science double major?')).toEqual(['컴퓨터학과']);
		expect(names('comp sci courses')).toEqual(['컴퓨터학과']);
		expect(names('physics major')).toEqual([]); // "cs"가 physics 안에서 걸리지 않음
	});

	test('예전 모양(synonyms 안의 영어 단어)도 그대로 걸림', () => {
		expect(names('DS major')).toEqual(['데이터과학과']);
	});

	test('matchKeywordRules — DB 줄(keyword_en·synonyms_en 칸) 읽기, 칸이 없던 예전 줄도', async () => {
		(Pool.query as jest.Mock)
			.mockResolvedValueOnce([[
				{ keyword: '컴퓨터학과', keyword_en: 'computer science', synonyms: '["컴학"]', synonyms_en: '["cs"]', pinned_faq_ids: '[7]', search_sources: null },
				{ keyword: '입시', synonyms: '["수시"]', pinned_faq_ids: '[]' },
			]])
			.mockResolvedValueOnce([[{ id: 7, question_ko: '컴퓨터학과 졸업요건이 궁금해!', question_en: 'CS graduation?' }]]);
		const got = await matchKeywordRules('How many credits for CS?');
		expect(got.map((r) => [r.keyword, r.keyword_en, r.synonyms_en])).toEqual([['컴퓨터학과', 'computer science', ['cs']]]);
		expect(got[0].pinned[0].question_en).toBe('CS graduation?');
		expect((await matchKeywordRules('수시 일정')).map((r) => [r.keyword, r.keyword_en, r.synonyms_en])).toEqual([['입시', '', []]]);
	});
});

describe('검색어에 더할 대표 키워드', () => {
	test('한국어 질문 → 대표 키워드', () => {
		expect(ruleSearchTerms([cs, ipsi], 'KO', 3).keywords).toEqual(['컴퓨터학과', '입시']);
	});

	test('영어 질문 → 영어 대표 키워드 (없으면 대표 키워드)', () => {
		expect(ruleSearchTerms([cs, ipsi], 'EN', 3).keywords).toEqual(['computer science', '입시']);
	});

	test('고정 FAQ는 RAG가 찾는 한국어 질문으로', () => {
		expect(ruleSearchTerms([cs], 'EN', 3).pinnedFaqs).toEqual(['컴퓨터학과 졸업요건이 궁금해!']);
		expect(ruleSearchTerms([cs], 'EN', 0).pinnedFaqs).toEqual([]);
	});
});
