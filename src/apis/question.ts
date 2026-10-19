import { Request, Response } from 'express';
import axios from 'axios';

import { matchKeywordRules } from './keywordRules';
import { Pool } from '../../config/connectDB';
import {
	ErrorResponse,
	QuestionRequest,
	QuestionResponse,
	ValidationError,
} from '../types';
import { OfficialFaq, RecItem } from '../types/question';
import { envs } from '../envs';

const RAG_SERVER_URL = envs.RAG_SERVER_URL ?? 'http://localhost:8000';
const SOURCE_SCORE_THRESHOLD = 0.01;  // RRF 점수 기준 (최대 ~0.033), 이전 cosine 기준(0.42)에서 변경
const SOURCE_RELATIVE_RATIO = 0.7;

// 검색 전에 물어야 하는(답변을 막는) 프로필 필드 — 교육과정표처럼 학과·학번별로 문서가 갈리는 경우
const BLOCKING_PROFILE_FIELDS = ['department', 'admission_year'];

const makeFlags = (override: Partial<QuestionResponse> = {}) => ({
	is_greet: false,
	is_able: false,
	is_freq: false,
	is_smalltalk: false,
	needs_profile: false,
	missing_fields: [] as string[],
	followup_fields: [] as string[],
	official_faqs: [] as OfficialFaq[],
	recommendations: [] as RecItem[],
	...override,
});

const MAX_PINNED_FAQS = 3;

type ClassifyOutcome =
	| { kind: 'early'; body: QuestionResponse }
	| { kind: 'rag'; correctedQuestion: string; keywords: string[]; requiredProfile: string[]; pinnedFaqs: string[] };

/** 1·2단계: 의도 분류 → 인사·스몰톡·막는 프로필 질문이면 바로 응답, 아니면 RAG로 보낼 정보 반환 */
async function classifyStep(question: string, language: QuestionRequest['language'], sessionId?: string): Promise<ClassifyOutcome> {
	// ── 1. 의도 분류 (오탈자 교정 + 키워드 추출 + intent) ──────────────
	let intent = 'academic';
	let correctedQuestion = question;
	let smalltalkResponse: string | null = null;
	let keywords: string[] = [];
	let requiredProfile: string[] = [];

	try {
		const classifyRes = await axios.post(
			`${RAG_SERVER_URL}/classify`,
			{ message: question, language: language.toLowerCase() },
			{ headers: sessionId ? { 'X-Session-ID': sessionId } : {} }
		);
		intent = classifyRes.data.intent ?? 'academic';
		correctedQuestion = classifyRes.data.corrected_query ?? question;
		smalltalkResponse = classifyRes.data.response ?? null;
		keywords = classifyRes.data.keywords ?? [];
		const profileUpdate: Record<string, unknown> = classifyRes.data.profile_update ?? {};
		const currentProfile: Record<string, unknown> = classifyRes.data.current_profile ?? {};
		requiredProfile = classifyRes.data.required_profile ?? [];
		const hardFilters: Record<string, unknown> = classifyRes.data.hard_filters ?? {};

		const profileStatusLine = Object.keys(currentProfile).length > 0
			? Object.entries(currentProfile)
				.map(([k, v]) => v != null ? `${k}=${v}` : `${k}=미설정`)
				.join(', ')
			: '없음';

		console.log(
			`${'='.repeat(50)}\n` +
			`[Classify]\n` +
			`  원본 쿼리         : ${question}\n` +
			`  정제 쿼리         : ${correctedQuestion}${correctedQuestion === question ? ' (변경 없음)' : ''}\n` +
			`  키워드            : [${keywords.join(', ')}]\n` +
			`  의도(intent)      : ${intent}\n` +
			`  required_profile  : [${requiredProfile.join(', ')}]\n` +
			`  profile_update    : ${JSON.stringify(profileUpdate)}\n` +
			`  profile_status    : ${profileStatusLine}\n` +
			`  session_id        : ${sessionId ?? '없음'}`
		);

		// 막는 질문 (검색 전): 문서를 고르는 데 꼭 필요한 학과·학번만 먼저 묻는다.
		// 학년·학적·전공유형 등은 답변을 막지 않고, 답변 뒤 근거 문서 기준으로 follow-up 카드로 묻는다.
		// (classify LLM의 required_profile 예측은 호출마다 달라질 수 있어 이 기준을 코드로 고정)
		if (intent === 'academic' && requiredProfile.length > 0) {
			const missingFromClassify = requiredProfile.filter((field) => {
				if (!BLOCKING_PROFILE_FIELDS.includes(field)) return false;
				if (field === 'admission_year' && hardFilters['query_year']) return false;
				if (field === 'department' && hardFilters['query_dept']) return false;
				return currentProfile[field] == null;
			});
			if (missingFromClassify.length > 0) {
				console.log(`[Classify] 프로필 사전 요청: [${missingFromClassify.join(', ')}]`);
				return { kind: 'early', body: {
					faqs: null,
					...makeFlags({ needs_profile: true, missing_fields: missingFromClassify }),
					id: -1,
				} };
			}
		}
	} catch (err) {
		console.warn('[Question API] /classify 호출 실패, academic으로 fallback:', err);
	}

	// ── 2. intent 별 즉시 반환 ────────────────────────────────────────
	if (intent === 'greeting') {
		return { kind: 'early', body: { faqs: null, ...makeFlags({ is_greet: true }), id: -1 } };
	}
	if (intent === 'ability') {
		return { kind: 'early', body: { faqs: null, ...makeFlags({ is_able: true }), id: -1 } };
	}
	if (intent === 'faq') {
		return { kind: 'early', body: { faqs: null, ...makeFlags({ is_freq: true }), id: -1 } };
	}
	if (intent === 'smalltalk') {
		const response = smalltalkResponse ?? (language === 'KO' ? '안녕하세요! 무엇이 궁금하신가요?' : 'Hello! How can I help you?');
		const smalltalkFaq = {
			id: -1,
			question_ko: question,
			question_en: question,
			answer_ko: JSON.stringify([{ answer: response, url: '', email: '', phone: '' }]),
			answer_en: JSON.stringify([{ answer: response, url: '', email: '', phone: '' }]),
			maincategory_ko: '대화',
			maincategory_en: 'Chat',
			subcategory_ko: '',
			subcategory_en: '',
			manager: 'AI',
			category_order: 0,
			subcategory_order: 0,
			created_by: null,
			updated_by: null,
		};
		return { kind: 'early', body: { faqs: [smalltalkFaq], ...makeFlags({ is_smalltalk: true }), id: -1 } };
	}

	// 관리자가 등록한 키워드 규칙: 연관 단어("이공계")가 있으면 대표 키워드("입시")를 검색어에 더하고,
	// 고정 FAQ는 근거로 함께 넘김 (영어 질문은 분류 단계의 한국어 키워드로도 비교)
	const rules = await matchKeywordRules(`${question} ${correctedQuestion} ${keywords.join(' ')}`);
	const ruleKeywords = rules.map((r) => r.keyword).filter((k) => !keywords.includes(k));
	const pinnedFaqs = Array.from(new Set(rules.flatMap((r) => r.pinned.map((p) => p.question_ko)))).slice(0, MAX_PINNED_FAQS);
	if (rules.length) console.log(`[keyword_rules] ${rules.map((r) => r.keyword).join(', ')} → 고정 FAQ ${pinnedFaqs.length}개`);

	return { kind: 'rag', correctedQuestion, keywords: [...keywords, ...ruleKeywords], requiredProfile, pinnedFaqs };
}

/** RAG 응답(/chat 또는 /chat/stream의 done) → 화면용 응답 (카드 분할·출처 정리·공식 답변 칩) */
function buildRagResponse(ragData: any, question: string, correctedQuestion: string, language: QuestionRequest['language']): QuestionResponse {
	// 인용 근거에 필요한 프로필이 비어 있으면 — 답변은 그대로 보여주고, 추가 정보 요청 카드를 함께 (막지 않는 질문)
	// (문서 선택에 꼭 필요한 정보는 위 classify 단계에서 검색 전에 이미 물어봄 = 막는 질문)
	const followupFields: string[] = ragData.missing_profile ?? [];
	const officialFaqs: OfficialFaq[] = ragData.official_faqs ?? [];

	const llmResponseRaw: string = ragData.response || '';
	const citationMatches = llmResponseRaw.match(/\[\s*S?\s*(\d{1,2})\s*\]/g) ?? [];
	// 답변에 실제로 쓰인 근거만 출처로 — 답변 속 [S#] 태그 + RAG가 판단한 cited_ids(태그가 없을 때 내용 겹침 기준)
	const citedSourceIds = new Set<string>([
		...citationMatches
			.map((token: string) => token.match(/\[\s*S?\s*(\d{1,2})\s*\]/)?.[1])
			.filter((id): id is string => Boolean(id))
			.map((id) => `S${id}`),
		...((ragData.cited_ids ?? []) as string[]),
	]);
	const llmResponse = llmResponseRaw
		.replace(/\s*\[\s*[SM]?\s*\d{1,2}\s*\]/g, '')  // LLM이 가끔 [ S1]·[4]처럼 씀
		.trim()
		.split('\n')
		.map((line) => {
			// 줄 내 ** 개수가 홀수면 닫는 ** 누락 → 자동 보완
			const count = (line.match(/\*\*/g) ?? []).length;
			return count % 2 === 1 ? line.trimEnd() + '**' : line;
		})
		.join('\n');
	// 자료에서 답을 못 찾은 답변이면 출처를 보여주지 않음 — 판단은 RAG(not_found, 규칙 기반)가 함
	// (예전엔 정해진 문장과 정확히 같을 때만 걸러, LLM이 조금 다르게 쓰면 출처가 붙었음)
	const isNoSourceFallback = Boolean(ragData.not_found) || [
		'제공된 자료에서 해당 정보를 찾을 수 없습니다',
		'해당 정보를 찾을 수 없습니다',
		'Sorry, I could not find',
	].some((msg) => llmResponseRaw.includes(msg));

	/**
	 * LLM 답변을 카드 단위로 분할합니다.
	 *
	 * 분할 원칙:
	 * 1. ## 헤딩이 등장하면 → 무조건 새 카드 시작 (semantic 경계)
	 * 2. 헤딩 없이 내용이 너무 길면 → 시각적 줄 수 기준으로 추가 분할
	 */
	const splitResponseIntoCards = (text: string): string[] => {
		const MAX_LINES_SOFT = 22; // 이 줄 수 이하면 같은 카드에 합침
		const MAX_LINES_HARD = 28; // 이 줄 수를 넘으면 무조건 새 카드
		const CHARS_PER_LINE = 28; // 카드 폭 기준 한 줄의 예상 글자 수

		const normalizedText = text.replace(/\r\n/g, '\n').trim();
		if (!normalizedText) return [''];

		const estimateLines = (s: string): number =>
			s
				.split('\n')
				.reduce(
					(sum, line) =>
						sum + (!line.trim() ? 1 : Math.max(1, Math.ceil(line.trim().length / CHARS_PER_LINE))),
					0
				);

		const cards: string[] = [];
		const flush = (s: string) => {
			const t = s.trim();
			if (t) cards.push(t);
		};

		const isMarkdownTableLine = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line.trim());
		const hasMarkdownTable = (s: string): boolean => s.split('\n').some((line) => isMarkdownTableLine(line));
		const leadingSpaces = (line: string): number => (line.match(/^\s*/)?.[0].length ?? 0);
		/**
		 * 긴 섹션을 자를 때 리스트 항목(특히 하위 불릿) 중간에서 끊기지 않도록
		 * 문단/리스트 아이템 단위로 분해합니다.
		 */
		const buildSafeSplitUnits = (sectionText: string): string[] => {
			const lines = sectionText.split('\n');
			const units: string[] = [];
			let paragraphBuffer: string[] = [];

			const flushParagraphBuffer = () => {
				if (paragraphBuffer.length === 0) return;
				const paragraph = paragraphBuffer.join('\n').trim();
				paragraphBuffer = [];
				if (!paragraph) return;

				const paraLines = paragraph.split('\n');

				// * 와 숫자목록: 섹션 구분자 (각자 독립 카드)
				// • 와 -: 기본적으로 서브 불릿 → 하지만 * 섹션이 없는 단순 목록이면 분할 허용
				const isSectionStart = (line: string): boolean =>
					/^\s*(?:\*(?!\*)|\d+\.)\s+/.test(line) && leadingSpaces(line) <= 1;
				const isBulletLine = (line: string): boolean =>
					/^\s*[-•]\s+/.test(line) && leadingSpaces(line) <= 1;

				const hasSectionStarter = paraLines.some(isSectionStart);
				const sectionStartCount = paraLines.filter(isSectionStart).length;

				if (hasSectionStarter) {
					// * 섹션이 있으면 * 기준으로 분할 (• - 는 소속 유지)
					if (sectionStartCount <= 1) {
						units.push(paragraph);
						return;
					}
					let itemBuffer: string[] = [];
					for (const paraLine of paraLines) {
						if (isSectionStart(paraLine) && itemBuffer.length > 0) {
							units.push(itemBuffer.join('\n').trim());
							itemBuffer = [paraLine];
						} else {
							itemBuffer.push(paraLine);
						}
					}
					if (itemBuffer.length > 0) units.push(itemBuffer.join('\n').trim());
				} else {
					// * 섹션 없음 → - / • 불릿 목록이면 항목별로 분할
					const bulletCount = paraLines.filter(isBulletLine).length;
					if (bulletCount <= 1) {
						units.push(paragraph);
						return;
					}
					let itemBuffer: string[] = [];
					for (const paraLine of paraLines) {
						if (isBulletLine(paraLine) && itemBuffer.length > 0) {
							units.push(itemBuffer.join('\n').trim());
							itemBuffer = [paraLine];
						} else {
							itemBuffer.push(paraLine);
						}
					}
					if (itemBuffer.length > 0) units.push(itemBuffer.join('\n').trim());
				}
			};

			for (const line of lines) {
				if (!line.trim()) {
					flushParagraphBuffer();
					continue;
				}
				paragraphBuffer.push(line);
			}
			flushParagraphBuffer();

			return units.filter((unit) => unit.trim().length > 0);
		};

		// 첫 번째 패스: ## 헤딩으로 섹션 분리
		// 각 섹션 = { heading: "## 기초 과목" | "", body: "내용..." }
		type Section = { heading: string; body: string };
		const sections: Section[] = [];
		const lines = normalizedText.split('\n');
		let currentHeading = '';
		let currentBody: string[] = [];

		for (const line of lines) {
			if (/^#{1,3}\s+/.test(line.trim())) {
				// 새 헤딩 → 이전 섹션 저장 (###까지 섹션 분리 트리거로 확장)
				if (currentHeading || currentBody.some((l) => l.trim())) {
					sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
				}
				currentHeading = line.trim();
				currentBody = [];
			} else {
				currentBody.push(line);
			}
		}
		// 마지막 섹션
		if (currentHeading || currentBody.some((l) => l.trim())) {
			sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
		}

		// 두 번째 패스: 각 섹션을 카드로 변환
		// 헤딩이 있는 섹션은 그 자체로 독립 카드 (크기 초과 시 추가 분할)
		// 헤딩이 없는 섹션들은 작으면 하나의 카드로 합침
		// 단, 헤딩 카드가 이미 등장한 이후의 noHeading은 새 카드로 강제 분리
		let noHeadingBuffer = '';
		let hadHeadingCard = false;

		const flushNoHeading = () => {
			if (noHeadingBuffer.trim()) {
				flush(noHeadingBuffer);
				noHeadingBuffer = '';
			}
		};

		for (const section of sections) {
			const sectionText = section.heading
				? section.body
					? `${section.heading}\n\n${section.body}`
					: section.heading
				: section.body;

			if (!sectionText.trim()) continue;

			// 마크다운 표는 헤딩 유무와 무관하게 중간 분할 금지
			if (hasMarkdownTable(sectionText)) {
				flushNoHeading();
				flush(sectionText);
				continue;
			}

			if (section.heading) {
				// 헤딩이 있는 섹션 → 먼저 noHeading 버퍼 비우기
				flushNoHeading();
				hadHeadingCard = true;

				const lines_ = estimateLines(sectionText);
				if (lines_ <= MAX_LINES_HARD) {
					// 카드 하나로
					flush(sectionText);
				} else {
					// 너무 길면 마크다운 안전 단위(문단/리스트 아이템) 기준으로 분할
					const safeUnits = buildSafeSplitUnits(sectionText);
					let chunk = '';
					for (const unit of safeUnits) {
						const candidate = chunk ? `${chunk}\n\n${unit}` : unit;
						if (!chunk || estimateLines(candidate) <= MAX_LINES_HARD) {
							chunk = candidate;
						} else {
							flush(chunk);
							chunk = unit;
						}
					}
					flush(chunk);
				}
			} else {
				// 헤딩 없는 섹션 → 헤딩 카드 이후면 즉시 새 카드로 강제 분리
				if (hadHeadingCard) {
					flushNoHeading();
					flush(sectionText);
					continue;
				}
				// 버퍼에 합치거나 넘치면 flush
				const candidate = noHeadingBuffer
					? `${noHeadingBuffer}\n\n${sectionText}`
					: sectionText;

				if (estimateLines(candidate) <= MAX_LINES_SOFT) {
					noHeadingBuffer = candidate;
				} else {
					flushNoHeading();
					if (estimateLines(sectionText) <= MAX_LINES_HARD) {
						noHeadingBuffer = sectionText;
					} else {
						// 너무 긴 무헤딩 섹션 → 헤딩 섹션과 동일하게 안전 분할
						const safeUnits = buildSafeSplitUnits(sectionText);
						let chunk = '';
						for (const unit of safeUnits) {
							const candidate2 = chunk ? `${chunk}\n\n${unit}` : unit;
							if (!chunk || estimateLines(candidate2) <= MAX_LINES_HARD) {
								chunk = candidate2;
							} else {
								flush(chunk);
								chunk = unit;
							}
						}
						if (chunk) flush(chunk);
					}
				}
			}
		}

		flushNoHeading();
		return cards.length > 0 ? cards : [normalizedText];
	};

	const answerCards = splitResponseIntoCards(llmResponse);
	// console.log(`[RAG] ${answerCards.length}개 카드로 분할됨`);

	const ragSources = ragData.sources ?? [];
	// type RagSourceMeta = {
	// 	source_id: string;
	// 	score: number;
	// 	title: string;
	// 	main_category: string;
	// 	sub_category: string;
	// 	source: string;
	// 	has_link: boolean;
	// 	has_attachments: boolean;
	// };
	// const ragSourceMetaSummary: RagSourceMeta[] = ragSources
	// 	.map((source: any) => ({
	// 		source_id: source?.source_id || '-',
	// 		score: Number(source?.score ?? 0),
	// 		title: source?.original_title || source?.sub_category || source?.main_category || 'untitled',
	// 		main_category: source?.main_category || '-',
	// 		sub_category: source?.sub_category || '-',
	// 		source: source?.source || '-',
	// 		has_link: Boolean(source?.link),
	// 		has_attachments: Array.isArray(source?.attachments) && source.attachments.length > 0,
	// 	}))
	// 	.sort((a: RagSourceMeta, b: RagSourceMeta) => b.score - a.score);
	// const formatMetaSummaryLine = (source: RagSourceMeta): string =>
	// 	`- ${source.source_id} | score=${source.score.toFixed(3)} | [${source.main_category} > ${source.sub_category}] ${source.title} | src=${source.source}${source.has_link ? ' | link' : ''}${source.has_attachments ? ' | attachments' : ''}`;
	// const ragSourceTopForLog = ragSourceMetaSummary
	// 	.slice(0, 5)
	// 	.map((source: RagSourceMeta) => formatMetaSummaryLine(source))
	// 	.join('\n');
	// const ragSourceLinkedCount = ragSourceMetaSummary.filter((source: RagSourceMeta) => source.has_link).length;
	// const ragSourceAttachmentCount = ragSourceMetaSummary.filter((source: RagSourceMeta) => source.has_attachments).length;
	// // console.log(
	// 	`[Question API][RagSourceMeta]\nsummary: total=${ragSourceMetaSummary.length}, linked=${ragSourceLinkedCount}, attached=${ragSourceAttachmentCount}\ntop5:\n${ragSourceTopForLog || '- none'}`
	// );
	type SourcePayload = {
		source_id: string;
		score: number;
		source_label: string;
		source_title: string;
		source_category: string;
		source_link: string;
		attachments: any[];
	};

	const normalizedSources: SourcePayload[] = isNoSourceFallback
		? []
		: ragSources
				.map((source: any) => ({
					source_id: source?.source_id || '',
					score: Number(source?.score ?? 0),
					source_label: source?.source_label || '',
					source_title: source?.original_title || source?.sub_category || source?.main_category || '',
					source_category: source?.main_category || '',
					source_link: source?.link || '',
					attachments: source?.attachments || [],
				}))
				.filter(
					// link/attachment 없는 출처(PDF 등)도 포함 — source_title이 있으면 표기
					(source: SourcePayload) => source.source_id && source.source_title
				);

	const citedSources = normalizedSources.filter((source: SourcePayload) =>
		citedSourceIds.has(source.source_id)
	);
	const topCitedScore = citedSources.reduce(
		(max: number, source: SourcePayload) => Math.max(max, source.score),
		0
	);
	const filteredByScore = citedSources.filter(
		(source: SourcePayload) =>
			source.score >= SOURCE_SCORE_THRESHOLD &&
			source.score >= topCitedScore * SOURCE_RELATIVE_RATIO
	);

	// 같은 공지를 다시 올린 글(첨부파일 이름이 대부분 같음)은 출처에 한 번만 — 색인 단계(link_docs)에서 놓친 경우 대비
	const attachmentNames = (source: SourcePayload) =>
		new Set(
			(source.attachments ?? [])
				.map((a: any) => String(a?.name ?? '').replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/\(\d+\)/g, '').replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase())
				.filter(Boolean)
		);
	const sameAttachments = (a: Set<string>, b: Set<string>) => {
		if (a.size < 2 || b.size < 2) return false;
		const common = Array.from(a).filter((x) => b.has(x)).length;
		return common / (a.size + b.size - common) >= 0.6;
	};

	const uniqueSources: SourcePayload[] = [];
	const seen = new Set<string>();
	const keptAttachments: Set<string>[] = [];
	for (const source of filteredByScore) {
		const key = `${source.source_link}|${source.source_title}|${JSON.stringify(source.attachments)}`;
		if (seen.has(key)) continue;
		const names = attachmentNames(source);
		if (keptAttachments.some((kept) => sameAttachments(kept, names))) continue;
		seen.add(key);
		keptAttachments.push(names);
		uniqueSources.push(source);
	}

	// const citedSourceIdList = Array.from(citedSourceIds);
	// const citedSourceMetaForLog = citedSources
	// 	.map(
	// 		(source: SourcePayload) =>
	// 			`- ${source.source_id} | score=${source.score.toFixed(3)} | ${source.source_title || 'untitled'}${source.source_link ? ' | link' : ''}${source.attachments?.length ? ' | attachments' : ''}`
	// 	)
	// 	.join('\n');
	// const selectedSourceMetaForLog = uniqueSources
	// 	.map(
	// 		(source: SourcePayload) =>
	// 			`- ${source.source_id} | score=${source.score.toFixed(3)} | ${source.source_title || 'untitled'}${source.source_link ? ' | link' : ''}${source.attachments?.length ? ' | attachments' : ''}`
	// 	)
	// 	.join('\n');
	// console.log(
	// 	`[Question API][SourceTrace]\nsummary: cards=${answerCards.length}, rag_sources=${ragSources.length}, normalized=${normalizedSources.length}, cited_ids=${citedSourceIdList.join(',') || 'none'}, cited_count=${citedSources.length}, score_filtered=${filteredByScore.length}, deduped=${uniqueSources.length}`
	// );
	// console.log(
	// 	`[Question API][RagAnswerSourceMeta]\ncited:\n${citedSourceMetaForLog || '- none'}\nselected:\n${selectedSourceMetaForLog || '- none'}`
	// );
	// if (citedSources.length > 0) {
	// 	const citedScoreLines = citedSources
	// 		.map((source: SourcePayload) => `- ${source.source_id}: ${source.score.toFixed(3)}`)
	// 		.join('\n');
	// 	// console.log(
	// 	// 	`[Question API][SourceTraceScores]\ncited_scores:\n${citedScoreLines}\nthresholds: top=${topCitedScore.toFixed(3)}, abs_th=${SOURCE_SCORE_THRESHOLD}, rel_th=${SOURCE_RELATIVE_RATIO}`
	// 	// );
	// }

	// cited sources 중 mysql_senior_faq가 있으면 senior 카드로 표시 (분홍색)
	// 선배 답변 표시: RAG가 답변 전에 정한 style(근거 1순위가 선배 FAQ) 또는 인용 출처에 선배 FAQ
	const isSeniorResponse = ragData.style === 'senior' || ragSources
		.filter((s: any) => citedSourceIds.has(s?.source_id))
		.some((s: any) => s?.source === 'mysql_senior_faq');

	const answerJson = JSON.stringify(
		answerCards.map((cardText, cardIndex) => ({
			answer: cardText,
			url: '',
			email: '',
			phone: '',
			source_title: '',
			source_category: '',
			source_link: '',
			attachments: [],
			sources: cardIndex === 0 ? uniqueSources : [],
		}))
	);

	// /classify의 corrected_query는 항상 한국어로 번역됨 (RAG index 일관성 위해).
	// → question_ko는 한국어 corrected, question_en은 사용자 원본 (영어로 입력했으면 영어 그대로 표시)
	const llmFaq = {
		id: -1,
		question_ko: correctedQuestion,                          // 항상 한국어 (corrected)
		question_en: language === 'EN' ? question : correctedQuestion,  // 영어 입력이면 원본, 아니면 한국어
		answer_ko: answerJson,
		answer_en: answerJson,
		maincategory_ko: 'AI 답변',
		maincategory_en: 'AI Response',
		subcategory_ko: isSeniorResponse ? 'senior' : '',
		subcategory_en: isSeniorResponse ? 'senior' : '',
		manager: 'AI',
		category_order: 0,
		subcategory_order: 0,
		created_by: null,
		updated_by: null,
	};

	return {
		faqs: [llmFaq],
		...makeFlags({ followup_fields: followupFields, official_faqs: officialFaqs,
			recommendations: ragData.recommendations ?? [] }),
		id: -1,
	} as QuestionResponse;
}

/** 오류 시 사용자에게 보여줄 응답 */
function errorResponse(question: string, language: QuestionRequest['language']): QuestionResponse {
	const errorMessage =
		language === 'KO'
			? '죄송합니다. 현재 답변을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.'
			: 'Sorry, I cannot generate a response at the moment. Please try again later.';

	const errorJson = JSON.stringify([
		{
			answer: errorMessage,
			url: '',
			email: '',
			phone: '',
			source_title: '',
			source_category: '',
			source_link: '',
			attachments: [],
		},
	]);

	const errorFaq = {
		id: -1,
		question_ko: question,
		question_en: question,
		answer_ko: errorJson,
		answer_en: errorJson,
		maincategory_ko: '오류',
		maincategory_en: 'Error',
		subcategory_ko: '',
		subcategory_en: '',
		manager: 'System',
		category_order: 0,
		subcategory_order: 0,
		created_by: null,
		updated_by: null,
	};

	return {
		faqs: [errorFaq],
		...makeFlags(),
		id: -1,
	};
}

/**
 * 직접 입력한 질문을 question_logs에 기록 (응답을 보낸 뒤 비동기 — 요청 처리 중에는 DB 연결을 잡지 않음).
 * 인기 질문 집계·추천에 사용. FAQ 정확 일치 경로를 없앴으므로 faq_id는 NULL.
 */
// 시나리오 테스트 등에서 질문 로그를 남기지 않을 때 (QUESTION_LOG_DISABLED=1)
const QUESTION_LOG_DISABLED = process.env['QUESTION_LOG_DISABLED'] === '1';

function logQuestion(question: string, language: QuestionRequest['language']) {
	if (QUESTION_LOG_DISABLED) return;
	Pool.query('INSERT INTO question_logs (faq_id, user_question, language) VALUES (NULL, ?, ?)', [
		question.slice(0, 300),
		language,
	]).catch((err) => console.warn('[Question API] 질문 로그 기록 실패:', err?.message ?? err));
}

/**
 * RAG 답변을 거치지 않은 응답(인사·스몰톡·프로필 질문 등)에도 사용자 질문 기준 추천을 붙인다.
 * 추천 실패는 응답을 막지 않음 (짧은 타임아웃).
 */
async function withQueryRecommendations(body: QuestionResponse, question: string, sessionId?: string): Promise<QuestionResponse> {
	try {
		const recRes = await axios.post(`${RAG_SERVER_URL}/recommend/for_query`, { message: question },
			{ headers: ragHeaders(sessionId), timeout: 2000 });
		return { ...body, recommendations: recRes.data.items ?? [] };
	} catch {
		return body;
	}
}

function ragHeaders(sessionId?: string) {
	return sessionId ? { 'X-Session-ID': sessionId } : {};
}

function validate(body: QuestionRequest) {
	if (!body.question) throw new ValidationError("invalid parameter, 'question' required");
	if (!body.language) throw new ValidationError("invalid parameter, 'language' required");
}

/** 한 번에 응답 (기존 클라이언트 호환) */
export const question = async (
	req: Request<{}, {}, QuestionRequest>,
	res: Response<QuestionResponse | ErrorResponse>
) => {
	validate(req.body);
	const { question, language } = req.body;
	const sessionId = req.headers['x-session-id'] as string | undefined;

	try {
		const outcome = await classifyStep(question, language, sessionId);
		if (outcome.kind === 'early') {
			res.status(200).json(await withQueryRecommendations(outcome.body, question, sessionId));
			return;
		}
		const ragRes = await axios.post(
			`${RAG_SERVER_URL}/chat`,
			{ message: outcome.correctedQuestion, language: language.toLowerCase(), keywords: outcome.keywords,
			  intent: 'academic', required_profile: outcome.requiredProfile,
			  standalone: Boolean(req.body?.standalone), pinned_faqs: outcome.pinnedFaqs },
			{ headers: ragHeaders(sessionId) }
		);
		res.status(200).json(buildRagResponse(ragRes.data, question, outcome.correctedQuestion, language));
		logQuestion(question, language);
	} catch (error: any) {
		console.error('[Question API] 오류:', error);
		res.status(200).json(errorResponse(question, language));
	}
};

/**
 * SSE 스트리밍 응답 — 답변을 쓰는 동안 글자를 바로 전달 (체감 대기 시간 단축)
 *   event: delta  data: {"text": "..."}   답변 조각 (출처 태그 포함 — 화면에서 제거)
 *   event: done   data: QuestionResponse   최종 응답 (/question과 같은 형식)
 */
export const questionStream = async (req: Request<{}, {}, QuestionRequest>, res: Response) => {
	validate(req.body);
	const { question, language } = req.body;
	const sessionId = req.headers['x-session-id'] as string | undefined;

	res.status(200);
	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('X-Accel-Buffering', 'no');
	res.flushHeaders();
	const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

	// 사용자가 창을 닫으면 RAG 스트림도 끊어 LLM 낭비를 줄인다
	const abort = new AbortController();
	res.on('close', () => abort.abort());

	try {
		const outcome = await classifyStep(question, language, sessionId);
		if (outcome.kind === 'early') {
			send('done', await withQueryRecommendations(outcome.body, question, sessionId));
			res.end();
			return;
		}
		const ragRes = await axios.post(
			`${RAG_SERVER_URL}/chat/stream`,
			{ message: outcome.correctedQuestion, language: language.toLowerCase(), keywords: outcome.keywords,
			  intent: 'academic', required_profile: outcome.requiredProfile,
			  standalone: Boolean(req.body?.standalone), pinned_faqs: outcome.pinnedFaqs },
			{ headers: ragHeaders(sessionId), responseType: 'stream', signal: abort.signal }
		);

		let buffer = '';
		let finished = false;
		for await (const chunk of ragRes.data as AsyncIterable<Buffer>) {
			buffer += chunk.toString('utf8');
			let sep: number;
			while ((sep = buffer.indexOf('\n\n')) >= 0) {
				const raw = buffer.slice(0, sep);
				buffer = buffer.slice(sep + 2);
				const event = /^event: (.*)$/m.exec(raw)?.[1]?.trim();
				const data = /^data: (.*)$/m.exec(raw)?.[1];
				if (!event || data === undefined) continue;
				if (event === 'delta' || event === 'meta') {
					res.write(`event: ${event}\ndata: ${data}\n\n`);  // 그대로 전달
				} else if (event === 'done') {
					send('done', buildRagResponse(JSON.parse(data), question, outcome.correctedQuestion, language));
					finished = true;
				} else if (event === 'error') {
					throw new Error(`RAG stream error: ${data}`);
				}
			}
		}
		if (!finished) throw new Error('RAG stream ended without done');
		logQuestion(question, language);
	} catch (error: any) {
		if (!abort.signal.aborted) {
			console.error('[Question Stream API] 오류:', error?.message ?? error);
			send('done', errorResponse(question, language));
		}
	} finally {
		res.end();
	}
};

/** 대화 시작 화면 — 요즘 많이 묻는 질문 (RAG가 Redis에 10분 캐시) */
export const recommendStart = async (_req: Request, res: Response) => {
	try {
		const ragRes = await axios.get(`${RAG_SERVER_URL}/recommend/start`, { timeout: 3000 });
		res.status(200).json(ragRes.data);
	} catch (error: any) {
		console.warn('[Recommend] 시작 화면 추천 실패:', error?.message ?? error);
		res.status(200).json({ items: [] }); // 추천이 없어도 화면은 정상 동작
	}
};

/** 행정실 FAQ를 메뉴·칩으로 바로 열었을 때 — 그 FAQ 주제를 기록하고 다음 추천을 받아온다 */
export const recommendAfterFaq = async (req: Request, res: Response) => {
	const id = Number(req.body?.id);
	if (!Number.isInteger(id)) throw new ValidationError("invalid parameter, 'id' required");
	const sessionId = req.headers['x-session-id'] as string | undefined;
	// FAQ 클릭도 question_logs에 faq_id와 함께 기록 → "자주 묻는 질문"(최근 한 달 집계)에 반영 (응답을 기다리지 않음)
	const language = req.body?.language === 'EN' ? 'EN' : 'KO';
	if (!QUESTION_LOG_DISABLED) Pool.query('INSERT INTO question_logs (faq_id, user_question, language) SELECT id, question_ko, ? FROM faqs WHERE id = ?', [language, id])
		.catch((err) => console.warn('[Recommend] FAQ 클릭 기록 실패:', err?.message ?? err));
	try {
		const ragRes = await axios.post(`${RAG_SERVER_URL}/recommend/after_faq`, { row_id: id },
			{ headers: ragHeaders(sessionId), timeout: 3000 });
		res.status(200).json(ragRes.data);
	} catch (error: any) {
		console.warn('[Recommend] FAQ 이후 추천 실패:', error?.message ?? error);
		res.status(200).json({ items: [] });
	}
};
