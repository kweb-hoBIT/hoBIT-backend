/**
 * 메시지 검사 — 규칙 먼저 (지연 없음), 애매한 경우만 LLM (기존 피드백 검사와 같은 모델)
 * 막는 범위: 욕설·혐오·성적 표현 + 담당자를 향한 비꼼·조롱·무례 ("ㅋㅋㅋㅋ 일 잘하네", "ㅋㅋㅋㅋㅋ"만)
 * 예의 있는 불만·항의, 친근한 웃음("ㅎㅎ 감사합니다")은 보냄 (채팅 창구이므로)
 *
 * 잘못 막으면 학생 채팅이 끊기므로 보수적으로:
 *  - 띄어쓰기 단위로 비교 (띄어쓰기를 다 지우면 "질병 신청" → "질병신청"에 '병신'이 생김)
 *  - 일상어와 겹치는 말(꺼져 있어요, 자지 않았어요, 보지 마세요)은 목록에 없거나 단독일 때만
 *  - 한 글자씩 띄어 쓴 변형("씨 발")과 숫자·기호를 끼운 변형("시1발", "ㅅ.ㅂ")은 잡음
 */

import { check as korcenCheck } from 'korcen';

// 한국어 욕설 사전 (korcen — 호빗 피드백 검사와 같은 라이브러리)
// korcen은 "질병 신청", "자지 못했어요"도 욕설로 보므로, 안전한 일상 표현을 먼저 지우고 검사
const KORCEN_SAFE = [/질병/g, /병\s*신청/g, /병\s*신고/g, /(자|보)지\s*(않|못|마|말)/g, /시바견|시바이누/g, /시발점/g];
const korcen = (text: string) => {
	try {
		return korcenCheck(KORCEN_SAFE.reduce((acc, re) => acc.replace(re, ' '), text));
	} catch {
		return false;
	}
};

// 단어 안에 들어 있으면 막음
const CONTAINS = [
	'시발', '씨발', '씨빨', '시빨', '씨바', '시바알', '쓰발', '쓰벌', '씹새', '씹창', '씹년', '좆', '존나', '졸라', '병신', '븅신',
	'빙신', '개새끼', '개새기', '개색기', '개세끼', '개색히', '지랄', '염병', '미친놈', '미친년', '미친새', '또라이', '느금',
	'니애미', '니엄마', '엠창', '창녀', '걸레년', '섹스',
	'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅈㄹ', 'ㅈㄴ', 'ㅄ', 'ㅁㅊ',
];
// 정상 단어 안에 우연히 생기는 경우 — 비교 전에 지움
const ALLOWED = ['질병신', '병신청', '병신고', '병신체', '시바견', '시바이누', '시발점'];
// 그 낱말 하나만 쓴 경우만 (뒤에 문장이 이어지면 일상어: "꺼져 있어요")
const STANDALONE = ['꺼져', '꺼져라', '닥쳐', '닥쳐라', 'ㅗ', 'ㅗㅗ', 'ㅗㅗㅗ'];
const ENGLISH = /\b(f+u+c+k+\w*|f+u+k+|sh+i+t+\w*|b+i+t+c+h+\w*|asshole\w*|bastard\w*|cunt\w*|dick(head)?s?|motherfuck\w*|retard\w*|nigg\w*|faggot\w*)\b/i;

// 가려 쓴 흔적 (예: "ㅆ*ㅂ", "시**") — 규칙으로 확정은 못 하고 LLM에 물어볼 후보
const MASKED = /[ㄱ-ㅎ][*#@!.~_-]+[ㄱ-ㅎ]|[가-힣][*#@]{1,3}(?![가-힣*#@])|f[*#@]+k|s[*#@]+t/i;
// 비꼼·무례일 수 있는 표현 — 문맥이 필요해서 LLM에 물어봄 (예: "ㅋㅋㅋ 일 잘하네", "어이없네")
const RUDE_HINTS =
	/ㅋ{2,}|ㅎ{3,}|ㅉ|ㅡㅡ|;{2,}|어이(가\s*)?없|장난(하|치)|일\s*(을\s*)?(잘|안|제대로|똑바로)|월급|세금|대단하시|잘\s*~|참\s*잘|답답하네|한심|무능|짜증|뭐\s*하는\s*(거|곳)|\?{3,}|lol|lmao|wtf|seriously\?|great job|nice job|thanks for nothing/i;
// 웃음·조롱 글자만 있는 메시지 — 담당자에게 보낼 내용이 없으므로 규칙으로 바로 막음
const ONLY_MOCKING = /^[\sㅋㅎㅉㅡ;~.!?^]+$/;

/** 숫자·기호 제거 (한글·영문만 남김) */
const clean = (s: string) => s.toLowerCase().normalize('NFC').replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g, '');

/** 띄어쓰기 단위 + 한 글자씩 띄어 쓴 것은 이어 붙인 덩어리 */
export function chunks(text: string): string[] {
	const tokens = text.split(/\s+/).map(clean).filter(Boolean);
	const out = [...tokens];
	let run: string[] = [];
	for (const t of [...tokens, '']) {
		if (t.length === 1) run.push(t);
		else {
			if (run.length >= 2) out.push(run.join(''));
			run = [];
		}
	}
	return out;
}

export function checkRules(text: string): { blocked: boolean; rude: boolean; suspicious: boolean } {
	const parts = chunks(text);
	const blocked =
		parts.some((p) => {
			let s = p;
			for (const ok of ALLOWED) s = s.split(ok).join('');
			return CONTAINS.some((w) => s.includes(w));
		}) ||
		(parts.length <= 2 && parts.some((p) => STANDALONE.includes(p))) ||
		ENGLISH.test(text) ||
		korcen(text);
	// "ㅋㅋㅋ", "ㅉㅉ", "ㅡㅡ"처럼 조롱 글자만 (3자 이상, 또는 ㅉ·ㅡㅡ가 들어간 경우)
	const t = text.trim();
	const rude = !blocked && ONLY_MOCKING.test(t) && (/[ㅋㅎ]{3,}|ㅉ|ㅡㅡ|;{3,}/.test(t));
	return { blocked, rude, suspicious: !blocked && !rude && (MASKED.test(text) || RUDE_HINTS.test(text)) };
}

export type ModerationResult = { allowed: boolean; reason?: 'profanity' | 'rude' | 'llm' };
export type LlmCheck = (text: string) => Promise<boolean>; // true = 막기

export async function moderate(text: string, llm?: LlmCheck): Promise<ModerationResult> {
	const r = checkRules(text);
	if (r.blocked) return { allowed: false, reason: 'profanity' };
	if (r.rude) return { allowed: false, reason: 'rude' };
	if (r.suspicious && llm) {
		try {
			if (await llm(text)) return { allowed: false, reason: 'llm' };
		} catch {
			// LLM이 실패하면 보냄 (채팅을 막지 않음)
		}
	}
	return { allowed: true };
}
