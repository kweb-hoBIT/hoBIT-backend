import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';

import { Pool } from '../../config/connectDB';

/**
 * 키워드 규칙 (관리자 사이트에서 등록 — keyword_rules 테이블)
 *   대표 키워드 + 연관 단어 + 맨 위에 고정할 FAQ
 *   예) 입시 ← 수시, 정시, 이공계, 계열  /  고정: "수시, 정시 등 입학(입시) 관련 사항이 궁금해!"
 * - 입력창 추천(자동완성): 화면이 GET /keyword_rules로 받아 브라우저에서 바로 적용
 * - 질문: 연관 단어가 있으면 대표 키워드를 검색어에 더하고, 고정 FAQ를 RAG 근거로 넘김 (matchKeywordRules)
 * 규칙 기반 — LLM 호출 없음. 1분 캐시 (관리자가 고친 내용은 1분 안에 반영)
 */

export type KeywordRule = {
	keyword: string;
	synonyms: string[];
	pinned: { faq_id: number; question_ko: string; question_en: string }[];
};

const CACHE_MS = 60_000;
let cache: { at: number; rules: KeywordRule[] } | null = null;
let loading: Promise<KeywordRule[]> | null = null;

const parseList = (v: unknown): unknown[] => {
	if (Array.isArray(v)) return v;
	try {
		const parsed = typeof v === 'string' ? JSON.parse(v) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

async function fetchRules(): Promise<KeywordRule[]> {
	try {
		const [rows] = await Pool.query<RowDataPacket[]>(
			'SELECT keyword, synonyms, pinned_faq_ids FROM keyword_rules'
		);
		const rules = rows.map((r) => ({
			keyword: String(r['keyword']),
			synonyms: parseList(r['synonyms']).map(String),
			ids: parseList(r['pinned_faq_ids']).map(Number).filter(Number.isInteger),
		}));
		const ids = Array.from(new Set(rules.flatMap((r) => r.ids)));
		const faqs = new Map<number, { question_ko: string; question_en: string }>();
		if (ids.length) {
			const [rowsFaq] = await Pool.query<RowDataPacket[]>(
				'SELECT id, question_ko, question_en FROM faqs WHERE id IN (?)',
				[ids]
			);
			rowsFaq.forEach((f) => faqs.set(Number(f['id']), { question_ko: f['question_ko'], question_en: f['question_en'] }));
		}
		return rules.map((r) => ({
			keyword: r.keyword,
			synonyms: r.synonyms,
			// 지워진 FAQ는 건너뜀
			pinned: r.ids.filter((id) => faqs.has(id)).map((id) => ({ faq_id: id, ...faqs.get(id)! })),
		}));
	} catch (e: any) {
		// 관리자 사이트가 아직 테이블을 만들기 전이면 규칙 없음으로 (호빗 답변은 막지 않음)
		if (e?.code !== 'ER_NO_SUCH_TABLE') console.error('[keyword_rules] 조회 실패:', e?.message ?? e);
		return [];
	}
}

export async function getKeywordRules(): Promise<KeywordRule[]> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules;
	if (!loading) {
		loading = fetchRules()
			.then((rules) => {
				cache = { at: Date.now(), rules };
				return rules;
			})
			.finally(() => {
				loading = null;
			});
	}
	return loading;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
/** "빌리다" → "빌리" — 동사는 어간으로 비교 (빌리고·빌릴 등) */
const stem = (s: string) => {
	const n = norm(s);
	return n.length >= 3 && n.endsWith('다') ? n.slice(0, -1) : n;
};

/** 질문에 대표 키워드나 연관 단어가 들어 있는 규칙 */
export async function matchKeywordRules(question: string): Promise<KeywordRule[]> {
	const text = norm(question);
	if (!text) return [];
	const rules = await getKeywordRules();
	return rules.filter((r) => [r.keyword, ...r.synonyms].some((w) => {
		const t = stem(w);
		return t.length > 0 && text.includes(t);
	}));
}

/** GET /keyword_rules — 입력창 추천에 쓰는 규칙 (화면에서 캐시) */
export const keywordRules = async (_req: Request, res: Response) => {
	const rules = await getKeywordRules();
	res.set('Cache-Control', 'public, max-age=60');
	res.json({ rules });
};
