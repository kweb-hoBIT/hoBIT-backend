/**
 * 질문 남용 막기 — 규칙만 사용 (LLM 호출 없음). 질문이 classify·RAG로 가기 전에 한 번 거침.
 *
 *  1) 경고·일시 정지 (strike): 욕설·비하 / 질문 횟수 초과 / 공격 입력(SQL·스크립트·경로·템플릿 주입, 프롬프트 탈취) / 4,000자 넘는 입력
 *     24시간 안에 1~2번 → 경고(n/3), 3번째 → 10분, 4번째 → 1시간, 5번째부터 → 24시간 질문 제한
 *     정지 중에는 질문마다 남은 시간만 안내 (classify·RAG를 부르지 않음 → 비용 없음)
 *  1-1) 불필요한 질문·과다 사용 (LLM 비용) — 같은 질문 반복(10분에 3번째부터 안내, 6번째 경고), 뜻 없는 입력(ㅋㅋㅋ·asdf·같은 글자 반복)은
 *       안내만(10분에 5번째부터 경고), 하루 질문 글자 수 합계 20,000자 넘으면 그날은 그만 (자정까지)
 *  2) 개인 AI처럼 쓰는 요청 (코드 작성·자소서/레포트 대필·번역·과제 풀이·역할극·학교와 무관한 잡담) → 안내 문구만, strike 없음
 *     분명한 요청만 잡고, 애매하면 그대로 보냄 (LLM이 판단) — "자기소개서 제출 기한", "과제 제출 사이트"는 보냄
 *
 * 기록은 서버 메모리 (question_limit.ts와 같음 — pm2 1개). 서버를 다시 켜면 경고·정지 기록이 사라짐: 지금은 괜찮은 수준.
 * 서버 안에서 보내는 질문(localhost — 시나리오 테스트)은 경고·정지를 쌓지 않음. 내용 차단·안내는 똑같이 적용.
 * 위 숫자들은 기본값 — 관리자 사이트 > 챗봇 설정에서 바꿈 (services/bot_settings.ts, 함수마다 settings를 넘겨 테스트에서 고정)
 */
import { checkRules } from '../chat/moderation';
import { BotSettings, currentBotSettings, DEFAULT_BOT_SETTINGS } from '../services/bot_settings';
import { questionLimited } from './question_limit';

export type StrikeReason = 'offensive' | 'rate_limit' | 'attack' | 'oversized' | 'spam';
export type BlockReason = StrikeReason | 'too_long' | 'off_topic' | 'suspended' | 'repeat' | 'meaningless' | 'daily_budget';
export type PersonalUseKind = 'code' | 'essay' | 'translate' | 'homework' | 'roleplay' | 'general' | 'far_place';

/** 응답에 붙는 안내 정보 — 화면이 경고창·입력 잠금에 사용 (없으면 평소 응답) */
export type Moderation = {
	level: 'warning' | 'suspended' | 'blocked';
	reason: BlockReason;
	strikes: number;          // 24시간 안의 경고 횟수 (이 브라우저 기준)
	until?: string;           // 정지가 풀리는 시각 (ISO)
	retry_after_sec?: number; // 남은 시간(초) — 화면 시계가 서버와 달라도 카운트다운이 맞게
};

type Msg = { ko: string; en: string };
export type Gate = { message: Msg; moderation: Moderation };

export const MAX_QUESTION_CHARS = DEFAULT_BOT_SETTINGS.maxQuestionChars;  // 기본값 — 넘으면 답하지 않음 (토큰 비용)
// 최대 길이의 2배를 넘으면 일부러 보낸 것으로 보고 경고까지 (기본 4,000자)
const strikeChars = (s: BotSettings) => s.maxQuestionChars * 2;

const DAY = 86_400_000;
const MIN = 60_000;
// 같은 IP를 여러 학생이 함께 쓰는 학교 와이파이 — IP 기준은 5번 더 여유를 두고, 정지도 최대 1시간까지만
const IP_EXTRA = 5;
const IP_MAX_SUSPEND = 60 * MIN;
const MAX_RECORDS = 50_000; // 세션 번호를 계속 바꿔 보내도 메모리가 끝없이 늘지 않게

// ── 메시지 ────────────────────────────────────────────────
const PROFANITY_MESSAGE: Msg = {
	ko: '욕설이나 비하 표현이 있어 답변하지 않았어요. 고운 말로 다시 물어봐 주시면 바로 도와드릴게요.',
	en: 'I didn’t answer because the question contains rude or offensive language. Please ask again politely and I’ll help right away.',
};
const LIMIT_MESSAGE: Msg = {
	ko: '질문이 너무 많이 들어와 잠시 쉬어 가요. 1분 뒤에 다시 질문해 주세요.',
	en: 'Too many questions in a short time. Please try again in a minute.',
};
const ATTACK_MESSAGE: Msg = {
	ko: '처리할 수 없는 입력이 들어 있어 답변하지 않았어요. 정보대학 학사·학교생활에 대해 질문해 주세요.',
	en: 'I didn’t answer because the input contains content I can’t process. Please ask about academics or campus life at the College of Informatics.',
};
const REPEAT_MESSAGE: Msg = {
	ko: '방금 같은 질문을 여러 번 하셨어요. 위의 답변을 확인해 주시고, 더 궁금한 점은 조금 바꿔서 물어봐 주세요.',
	en: 'You’ve asked the same question several times. Please check the answer above, or rephrase if you need something else.',
};
const MEANINGLESS_MESSAGE: Msg = {
	ko: '어떤 점이 궁금한지 조금 더 구체적으로 물어봐 주세요. 예: "졸업요건 알려줘", "이번 학기 수강신청 언제야?"',
	en: 'Could you tell me a bit more about what you’d like to know? e.g. "graduation requirements", "when is course registration?"',
};
const DAILY_BUDGET_MESSAGE: Msg = {
	ko: '오늘은 질문을 아주 많이 하셔서 여기까지 답할게요. 내일 다시 물어봐 주세요. 급한 내용은 학부 행정팀(02-3290-4132~4133)에 문의해 주세요.',
	en: 'You’ve asked a lot of questions today, so I’ll stop here. Please ask again tomorrow, or contact the undergraduate office (02-3290-4132~4133) if it’s urgent.',
};
const tooLongMessage = (max: number): Msg => ({
	ko: `질문이 너무 길어요 (최대 ${max.toLocaleString()}자). 궁금한 점만 짧게 다시 물어봐 주세요.`,
	en: `Your question is too long (max ${max.toLocaleString()} characters). Please ask again briefly.`,
});
const PERSONAL_USE_WHAT: Record<PersonalUseKind, Msg> = {
	code: { ko: '코드 작성은', en: 'writing code' },
	essay: { ko: '자기소개서·레포트 같은 글을 대신 쓰는 건', en: 'writing essays, reports or cover letters' },
	translate: { ko: '번역은', en: 'translation' },
	homework: { ko: '과제·시험 문제 풀이는', en: 'solving homework or exam problems' },
	roleplay: { ko: '역할극은', en: 'role-play' },
	general: { ko: '학교생활과 관계없는 질문은', en: 'questions unrelated to campus life' },
	far_place: { ko: '', en: '' }, // 아래 FAR_PLACE_MESSAGE를 씀
};
// 학교 밖 다른 지역·내 위치 주변 장소 — 주변 장소 검색(카카오맵)은 안암캠퍼스 주변만 (고려대 챗봇이라)
const FAR_PLACE_MESSAGE: Msg = {
	ko: '호빗은 고려대학교 안암캠퍼스 주변 장소만 안내해요.\n정경대 후문·참살이길처럼 학교 근처 맛집·카페·약국 등을 물어봐 주세요!',
	en: 'hoBIT only shows places around Korea University’s Anam campus.\nTry asking about restaurants, cafes or pharmacies near campus!',
};
export const personalUseMessage = (kind: PersonalUseKind): Msg => kind === 'far_place' ? FAR_PLACE_MESSAGE : ({
	ko:
		`호빗은 고려대 정보대학 학사·학교생활 안내 도우미라 ${PERSONAL_USE_WHAT[kind].ko} 도와드리기 어려워요.\n` +
		'대신 수강신청, 졸업요건, 장학금, 휴학·복학, 증명서 발급, 학과 행사·공지 같은 걸 물어봐 주세요!',
	en:
		`hoBIT is a guide for academics and campus life at the Korea University College of Informatics, so it can’t help with ${PERSONAL_USE_WHAT[kind].en}.\n` +
		'Try asking about course registration, graduation requirements, scholarships, leave of absence, certificates, or department events and notices!',
});

/** 남은 시간 문구 — "9분", "1시간 5분" / "9 min", "1 h 5 min" */
export function formatRemaining(ms: number): Msg {
	const totalMin = Math.max(1, Math.ceil(ms / MIN));
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	return {
		ko: h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`,
		en: h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`,
	};
}
const suspendedMessage = (remainMs: number, justNow: boolean): Msg => {
	const r = formatRemaining(remainMs);
	return justNow
		? {
				ko: `부적절한 이용이 반복돼 잠시 질문이 제한됐어요. ${r.ko} 후에 다시 질문할 수 있어요.`,
				en: `Questions are temporarily suspended due to repeated misuse. You can ask again in ${r.en}.`,
			}
		: {
				ko: `잠시 이용이 제한된 상태예요. ${r.ko} 후에 다시 질문할 수 있어요.`,
				en: `Your access is temporarily suspended. You can ask again in ${r.en}.`,
			};
};
const warningSuffix = (n: number, limit: number): Msg => ({
	ko: `\n\n⚠️ 경고 ${n}/${limit} — 같은 일이 ${limit}번 되면 잠시 질문이 제한돼요.`,
	en: `\n\n⚠️ Warning ${n}/${limit} — after ${limit} warnings, questions will be temporarily suspended.`,
});
const join = (a: Msg, b: Msg): Msg => ({ ko: a.ko + b.ko, en: a.en + b.en });

// ── 공격 입력 ─────────────────────────────────────────────
// 일반 학사 질문과 겹치지 않게 '기호·문법 형태'까지 맞아야 잡음 ("select 과목", "드롭 신청", "union 동아리"는 보냄)
const ATTACK_PATTERNS: { kind: string; re: RegExp }[] = [
	// SQL 주입 — 따옴표로 문자열을 닫고 조건·주석을 붙이는 형태
	{ kind: 'sql', re: /['"`]\s*\)?\s*(or|and)\s+['"`]?[\w-]+['"`]?\s*(=|like)\s*['"`]?[\w-]+/i },
	{ kind: 'sql', re: /['"`]\s*\)?\s*;?\s*(--|#)\s*$|['"`]\s*\)?\s*;?\s*\/\*/ },
	{ kind: 'sql', re: /\bunion\s+(all\s+)?select\b/i },
	{ kind: 'sql', re: /;\s*(drop|truncate|alter|delete|insert|update|create)\s+(table|database|from|into|user)\b/i },
	{ kind: 'sql', re: /\bdrop\s+(table|database)\s+[\w`"]/i },
	{ kind: 'sql', re: /\b(information_schema|xp_cmdshell|pg_sleep|load_file\s*\(|into\s+outfile)\b/i },
	{ kind: 'sql', re: /\b(sleep|benchmark)\s*\(\s*\d+/i },
	// 스크립트 주입 (XSS)
	{ kind: 'xss', re: /<\s*\/?\s*script\b/i },
	{ kind: 'xss', re: /javascript\s*:\s*[\w.$]+\s*\(/i },
	{ kind: 'xss', re: /\bon(error|load|mouseover|focus|click|toggle|animationstart)\s*=/i },
	{ kind: 'xss', re: /<\s*(iframe|object|embed|svg|img)\b[^>]*>/i },
	// 경로 이동
	{ kind: 'path', re: /(\.\.[/\\]){2,}/ },
	{ kind: 'path', re: /\/etc\/(passwd|shadow|hosts)\b|\bwin\.ini\b|%2e%2e(%2f|%5c|\/)/i },
	// 템플릿 주입
	{ kind: 'template', re: /\{\{[^}]{0,80}\}\}/ },
	{ kind: 'template', re: /\$\{[^}\n]{1,80}\}/ },
	{ kind: 'template', re: /<%=?[^%]{0,80}%>/ },
	// 프롬프트 탈취 — 지시 무시·시스템 프롬프트 공개 요청·탈옥
	{
		kind: 'prompt',
		// '이전 대화는 무시하고 새로 질문', '기존 졸업 규칙은 무시하고'는 정상 질문 — 지시·명령·프롬프트만
		re: /(?<![가-힣])(이전|위|위의|앞|앞의|앞서|기존|지금까지|지금까지의)\s*(의\s*)?(모든\s*)?(지시|명령|지침|프롬프트)\s*(사항|내용|들)?\s*(은|는|을|를|도)?\s*(모두\s*|전부\s*|다\s*)?(무시|잊어|잊고|따르지\s*마)/,
	},
	{ kind: 'prompt', re: /(?<![가-힣])프롬프트\s*(는|은|를|을|도)?\s*(모두\s*|전부\s*|다\s*)?(무시|잊어|잊고)/ },
	{ kind: 'prompt', re: /(?<![가-힣])(너의|네|니|시스템)\s*(모든\s*)?(지시|명령|지침|규칙|설정|프롬프트)\s*(사항|내용|들)?\s*(은|는|을|를|도)?\s*(모두\s*|전부\s*|다\s*)?(무시|잊어|잊고|따르지\s*마)/ },
	// '시스템 메시지가 보여요'(오류 화면)는 보냄 — 프롬프트·지시문을 보여 달라는 요청만
	{ kind: 'prompt', re: /(시스템|system)\s*(프롬프트|prompt|지시문|instructions?)\s*(을|를|좀|전체|전부|그대로|내용)?\s*.{0,6}?((보여|알려|말해|복사해|적어|출력해|공개해)\s*(줘|주|봐)|출력|공개|유출)/i },
	{ kind: 'prompt', re: /(너의|네|니|당신의|호빗의?)\s*(프롬프트|prompt|지시문|설정\s*문구)\s*(을|를|좀|전체|전부|그대로|내용)?\s*.{0,6}?((보여|알려|말해|복사해|적어|출력해|공개해)\s*(줘|주|봐)|출력|공개|유출)/i },
	{ kind: 'prompt', re: /\b(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+|your\s+)*(previous|prior|above|earlier|preceding|system)\s+(instructions?|prompts?|rules|directions|messages?)/i },
	{ kind: 'prompt', re: /\b(reveal|show|print|repeat|leak|output|tell)\s+(me\s+)?(your|the)\s+(system\s+|initial\s+|hidden\s+)?(prompt|instructions)\b/i },
	{ kind: 'prompt', re: /\bjail\s*-?break|\bdo\s+anything\s+now\b|\bDAN\s*(mode|모드|처럼|으로|로|프롬프트)|탈옥\s*(모드|해|시켜|프롬프트)|(개발자|developer)\s*(모드|mode)\s*(로|on|켜|활성)/i },
];

/** 공격 입력이면 종류(sql·xss·path·template·prompt), 아니면 null */
export function detectAttack(text: string): string | null {
	const t = String(text ?? '').normalize('NFC');
	for (const p of ATTACK_PATTERNS) if (p.re.test(t)) return p.kind;
	return null;
}

// ── 개인 AI처럼 쓰는 요청 ────────────────────────────────
// "~해 줘/주세요/줄래" 같은 분명한 요청 끝말이 있어야 잡음 ("코딩테스트 준비 동아리", "과제 제출 사이트"는 보냄)
const ASK = '\\s*(줘|줘요|주세요|줄래|줄래요|주라|주실래요?|주시겠어요?|주실\\s*수)';
const re = (s: string, flags = 'i') => new RegExp(s, flags);
// 증명서·서류 번역(공증·영문 발급)은 학사 질문 — 번역 요청이어도 보냄
// 공지·학칙을 영어로 알려 달라는 유학생 질문도 학사 질문
const CAMPUS_TEXT = /증명서|성적표|서류|공증|학위|졸업장|재학|휴학|학적|등록금|장학|공지|안내문|학칙|규정|수강|졸업|transcript|certificate|diploma|document|notice|regulation/i;

const PERSONAL_USE_PATTERNS: { kind: PersonalUseKind; re: RegExp; unless?: RegExp }[] = [
	// 코드 작성
	// '프로그램'(교환학생·비교과)·'과목 코드'(학수번호)는 학사 용어라 제외
	{ kind: 'code', re: re(`(코드|코딩|함수|알고리즘|스크립트|sql문|정규식|크롤러)\\s*(을|를|좀|하나|한\\s*개)?\\s*.{0,10}?(짜|작성해|만들어|구현해|써|짜\\s*봐|짜서\\s*보여)${ASK}`), unless: /(과목|학수번호|학수|강의|수강|학과|전공|인증|초대|할인|쿠폰)\s*코드/ },
	{ kind: 'code', re: re(`(파이썬|python|자바스크립트|javascript|타입스크립트|typescript|자바|java|c\\+\\+|c언어|c#|코틀린|kotlin|스위프트|swift|러스트|rust|go언어|golang|html|css|리액트|react|sql)\\s*(으)?로\\s*.{0,20}?(짜|작성해|만들어|구현해|코딩해|짜\\s*봐)${ASK}`) },
	{ kind: 'code', re: re(`(코드|소스|버그|컴파일\\s*에러)\\s*(을|를|좀)?\\s*.{0,8}?(고쳐|수정해|디버깅해|리팩토링해|최적화해|설명해)${ASK}`) },
	{ kind: 'code', re: /```|#include\s*<|public\s+static\s+void\s+main|\bdef\s+\w+\s*\(.*\)\s*:|console\.log\s*\(|System\.out\.print/ },
	{ kind: 'code', re: /\b(write|generate|implement)\s+(me\s+)?(a|an|the|some)?\s*([\w+#-]+\s+){0,3}(code|function|script|algorithm|regex)\b/i, unless: /(course|class|subject)\s+code/i },
	{ kind: 'code', re: /\b(code|program|function|script)\s+(in|using|with)\s+(python|java|javascript|typescript|c\+\+|c#|rust|kotlin|swift)\b/i },
	{ kind: 'code', re: /\b(fix|debug|refactor)\s+(my|this|the\s+following)\s+(code|program|function|bug)\b/i },
	// 자소서·레포트·에세이 대필
	{
		kind: 'essay',
		re: re(`(자기\\s*소개서|자소서|에세이|레포트|리포트|보고서|논문|독후감|감상문|소논문|발표\\s*대본|연설문|소설|가사|학업\\s*계획서|연구\\s*계획서|personal\\s*statement)\\s*(을|를|좀|하나|한\\s*편|초안)?\\s*.{0,8}?(써|작성해|대신\\s*써|대신\\s*작성해|만들어|첨삭해|다듬어|완성해)${ASK}`),
	},
	{ kind: 'essay', re: re(`(대신|대필)\\s*(써|작성해)${ASK}`) },
	{ kind: 'essay', re: /\b(write|draft|compose)\s+(me\s+)?(a|an|my|the)?\s*(\w+\s+){0,2}(essay|cover\s+letter|personal\s+statement|report|paper|poem|story|statement\s+of\s+purpose|lyrics)\b/i },
	// 번역 — 학교 서류 번역(공증 등)은 보냄
	{
		kind: 'translate',
		re: re(`(번역해|영작해|영어로\\s*(번역해|옮겨)|한국어로\\s*(번역해|옮겨)|한글로\\s*(번역해|옮겨)|(일본어|중국어|영어|한국어)\\s*번역)${ASK}|번역\\s*좀\\s*(해|부탁)|번역\\s*(해\\s*)?(줘|주세요)\\s*[:：]`),
		unless: CAMPUS_TEXT,
	},
	{ kind: 'translate', re: /\btranslate\s+(this|that|it|these|the\s+following|the\s+sentence|the\s+text|my|into|to)\b|\btranslate\s*["'“:：]/i, unless: CAMPUS_TEXT },
	// 과제·시험 문제 풀이
	{ kind: 'homework', re: re(`(과제|숙제|문제|퀴즈|기출|연습\\s*문제|문항|증명|방정식|적분|미분|시험)\\s*(\\d+\\s*번)?\\s*(을|를|좀|도|들|번)?\\s*.{0,10}?(풀어|풀이해|대신\\s*풀어|답\\s*(좀\\s*)?알려|정답\\s*(좀\\s*)?알려)${ASK}`) },
	{ kind: 'homework', re: re(`(과제|숙제)\\s*(를|좀)?\\s*(대신\\s*)?해${ASK}`) },
	{ kind: 'homework', re: /\b(solve|answer)\s+(this|these|the|my)\s+(\w+\s+)?(problem|equation|question|homework|assignment|exam|quiz)s?\b|\bdo\s+my\s+(homework|assignment)\b/i },
	// 계산식만 보낸 경우 ("123*456=?") — 끝에 =·?·은/는이 있어야 ('2024-1', 전화번호는 보냄)
	{ kind: 'homework', re: /^\s*\(?\d+(\.\d+)?\)?(\s*[+\-*/×÷^]\s*\(?\d+(\.\d+)?\)?)+\s*(=\s*\??|\?|은\s*\??|는\s*\??|(은|는)?\s*얼마\S*)\s*$/ },
	// 역할극
	{ kind: 'roleplay', re: re(`(역할\\s*극|롤\\s*플레이|롤플|상황\\s*극)\\s*(을|를|좀)?\\s*(하자|해\\s*보자|할래|해${ASK})`) },
	{ kind: 'roleplay', re: /(너는|넌|너)\s*(이제부터|지금부터)\s*.{1,20}?(이야|야|이다|입니다|역할이?야?|처럼\s*\S+)\s*[.!~]*\s*$/ },
	{ kind: 'roleplay', re: re(`(인\\s*척|인\\s*것처럼|역할을?\\s*맡아서?|캐릭터로)\\s*(해|말해|대답해|행동해|연기해|굴어)${ASK}`) },
	{ kind: 'roleplay', re: /\b(role-?play|pretend\s+(to\s+be|you\s+are|you're)|act\s+as\s+(a|an|my)|you\s+are\s+now\s+(a|an|my))\b/i },
	// 학교와 분명히 관계없는 요청
	{ kind: 'general', re: re(`로또\\s*(번호|당첨)|운세|타로\\s*(봐|점)|주식\\s*(추천|종목)|(코인|비트코인)\\s*(추천|시세|가격)|레시피\\s*(알려|추천)|요리법|농담\\s*(하나|좀)?\\s*해${ASK}|아재\\s*개그|날씨\\s*(어때|알려)`) },
	{ kind: 'general', re: /\b(tell\s+me\s+a\s+joke|lottery\s+numbers?|stock\s+(tips|picks)|horoscope|recipe\s+for|weather\s+(today|tomorrow|forecast))\b/i },
];

/** 개인 AI처럼 쓰는 요청이면 종류, 아니면 null (애매하면 null — LLM이 판단) */
// 장소 종류 — 이 말이 있고 다른 지역·내 위치를 물으면 far_place
const PLACE_KIND_RE = /맛집|밥집|술집|카페|커피|식당|음식점|국밥|치킨|피자|빵집|베이커리|편의점|약국|병원|은행|헬스장|미용실|노래방|pc\s*방|숙소|호텔|모텔|restaurants?|cafes?|coffee|pharmacy|hotel|bars?\b|places?\s*to\s*eat/i;
// 학교 주변으로 보는 말 (이 말이 있으면 다른 지역 이름이 같이 있어도 막지 않음 — 예: "안암역 근처 카페")
const CAMPUS_AREA_RE = /안암|고려대|고대|정경대|정대\s*후문|참살이|개운사|제기동|보문|학교|캠퍼스|정문|후문|이공계|애기능|하나스퀘어|우정정보관|정보대|교우회관|korea\s*univ|campus/i;
// 사용자 위치 주변 ("내 위치", "우리 집 근처", "near me")
const MY_LOCATION_RE = /(내|제|나의|저의|현재|지금)\s*(위치|주변|근처|동네)|우리\s*(집|동네)|집\s*(근처|앞|주변)|여기\s*(서)?\s*(근처|주변|가까운)|near\s*me|my\s*(location|area|place|home)|around\s*me/i;
// 다른 지역 — 자주 나오는 곳 + "○○역/○○동/○○구" 형태
const OTHER_AREA_RE = /강남|홍대|신촌|이태원|명동|잠실|건대|성수|종로|여의도|압구정|합정|연남|을지로|혜화|대학로|성신여대|노원|부산|대구|광주|대전|인천|제주|수원|경주|전주|해운대|일본|도쿄|오사카|[가-힣]{1,5}(역|구)\s*(근처|주변|앞|에|에서|쪽|맛집|카페)|\b(gangnam|hongdae|sinchon|itaewon|myeongdong|busan|jeju|tokyo|osaka)\b/i;

/** 학교 주변이 아닌 장소를 묻는 질문 (다른 지역·내 위치) — 규칙 */
export function isFarPlaceQuestion(text: string): boolean {
	const t = String(text ?? '');
	if (!PLACE_KIND_RE.test(t)) return false;
	if (MY_LOCATION_RE.test(t)) return true;
	return OTHER_AREA_RE.test(t) && !CAMPUS_AREA_RE.test(t);
}

export function detectPersonalUse(text: string, settings: BotSettings = DEFAULT_BOT_SETTINGS): PersonalUseKind | null {
	const t = String(text ?? '').normalize('NFC');
	if (settings.blockFarPlace && isFarPlaceQuestion(t)) return 'far_place';
	if (!settings.blockPersonalUse) return null;
	for (const p of PERSONAL_USE_PATTERNS) {
		if (p.re.test(t) && !(p.unless && p.unless.test(t))) return p.kind;
	}
	return null;
}

export const isOffensive = (text: string) => {
	try {
		return checkRules(String(text ?? '')).blocked;
	} catch {
		return false;
	}
};

// ── 경고·정지 기록 ────────────────────────────────────────
type Rec = { hits: number[]; until: number; lastRate: number };
const records = new Map<string, Rec>();

const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isLocal = (ip?: string) => Boolean(ip && LOCAL_IPS.has(ip));

/** 세션(브라우저) 기준 키 — 세션 번호 없이 오는 요청(스크립트)은 IP로 대신 */
const subjects = (ip?: string, sessionId?: string) => ({
	primary: sessionId ? `s:${String(sessionId).slice(0, 100)}` : `n:${ip || '-'}`,
	ip: `ip:${ip || '-'}`,
});

function rec(key: string, now: number): Rec {
	let r = records.get(key);
	if (!r) {
		if (records.size >= MAX_RECORDS) {
			const oldest = records.keys().next().value;
			if (oldest !== undefined) records.delete(oldest);
		}
		r = { hits: [], until: 0, lastRate: 0 };
		records.set(key, r);
	}
	r.hits = r.hits.filter((t) => now - t < DAY);
	return r;
}

/** n번째 경고에 따른 정지 시간 — 기본: 3번째 10분, 4번째 1시간, 5번째부터 24시간 */
export function suspendMs(n: number, settings: BotSettings = DEFAULT_BOT_SETTINGS): number {
	const w = settings.warnLimit;
	const [a, b, c] = settings.suspendMinutes;
	if (n >= w + 2) return c * MIN;
	if (n === w + 1) return b * MIN;
	if (n === w) return a * MIN;
	return 0;
}

function addHit(r: Rec, reason: StrikeReason, now: number): boolean {
	// 횟수 초과는 1분에 한 번만 셈 — 스크립트가 1분에 수백 번 보내도 곧바로 24시간이 되지 않게
	if (reason === 'rate_limit') {
		if (now - r.lastRate < MIN) return false;
		r.lastRate = now;
	}
	r.hits.push(now);
	return true;
}

/** 경고 1회 기록 → 지금 상태 (strikes = 세션 기준 횟수, until = 정지 끝 시각 또는 0) */
export function addStrike(
	ip: string | undefined,
	sessionId: string | undefined,
	reason: StrikeReason,
	now = Date.now(),
	settings: BotSettings = DEFAULT_BOT_SETTINGS
) {
	const keys = subjects(ip, sessionId);
	const p = rec(keys.primary, now);
	const added = addHit(p, reason, now);
	if (added) {
		const ms = suspendMs(p.hits.length, settings);
		if (ms) p.until = Math.max(p.until, now + ms);
	}
	const i = rec(keys.ip, now);
	if (addHit(i, reason, now)) {
		const ms = Math.min(suspendMs(i.hits.length - IP_EXTRA, settings), IP_MAX_SUSPEND);
		if (ms > 0) i.until = Math.max(i.until, now + ms);
	}
	const until = Math.max(p.until, i.until);
	return { added, strikes: p.hits.length, until: until > now ? until : 0 };
}

/** 정지 중이면 끝 시각, 아니면 0 */
export function suspendedUntil(ip: string | undefined, sessionId: string | undefined, now = Date.now()): number {
	const keys = subjects(ip, sessionId);
	const until = Math.max(records.get(keys.primary)?.until ?? 0, records.get(keys.ip)?.until ?? 0);
	return until > now ? until : 0;
}

const strikeCount = (ip: string | undefined, sessionId: string | undefined, now: number) =>
	(records.get(subjects(ip, sessionId).primary)?.hits ?? []).filter((t) => now - t < DAY).length;

/** 테스트용 — 기록 비우기 */
export function resetAbuseRecords() {
	records.clear();
}

const suspendedInfo = (reason: BlockReason, strikes: number, until: number, now: number): Moderation => ({
	level: 'suspended',
	reason,
	strikes,
	until: new Date(until).toISOString(),
	retry_after_sec: Math.ceil((until - now) / 1000),
});

/**
 * 질문 검사 — 막아야 하면 안내 문구와 moderation 정보, 통과면 null.
 * 순서: 정지 중 → 횟수 초과 → 길이 → 욕설 → 공격 입력 → 개인 AI 요청
 */
// ── 불필요한 질문·과다 사용 ─────────────────────────────────
// 기준 숫자는 설정(BotSettings) — 기본: 같은 질문 3번째부터 안내만(LLM 안 부름)·6번째부터 경고, 뜻 없는 입력 5번째 경고
const REPEAT_WINDOW = 10 * MIN;
export const DAILY_CHAR_BUDGET = DEFAULT_BOT_SETTINGS.dailyCharBudget; // 기본값 — 하루 질문 글자 수 합 (보통 학생은 하루 몇백~몇천 자)

type Usage = { recent: { key: string; at: number }[]; junk: number[]; day: string; chars: number };
const usage = new Map<string, Usage>();
const kstDay = (now: number) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
const normQ = (t: string) => t.toLowerCase().replace(/[\s?!.~,'"ㅎㅋㅠㅜ^]+/g, '');

/** 뜻 없는 입력 — 한글 음절·영단어가 없음(ㅋㅋ·ㅁㄴㅇㄹ·!!!·1111), 같은 글자 반복(아아아아아아), 자판 두드리기(asdf, qwer) */
export function isMeaningless(text: string): boolean {
	const t = String(text ?? '').trim();
	if (!t) return true;
	const hangul = (t.match(/[가-힣]/g) ?? []).length;
	const words = t.match(/[a-z]{2,}/gi) ?? [];
	if (!hangul && !words.length) return true; // 자음·모음, 기호, 숫자만
	if (/([가-힣a-z])\1{5,}/i.test(t.replace(/\s/g, '')) && hangul + words.join('').length <= 8) return true; // 아아아아아아
	if (!hangul && words.every((w) => /^(asdf|qwer|zxcv|sdf|wer|xcv|jkl|hjk|uiop|fgh)+[a-z]*$/i.test(w) || (!/[aeiouy]/i.test(w) && w.length >= 5)))
		return true;
	return false;
}

function usageOf(key: string, now: number): Usage {
	let u = usage.get(key);
	if (!u) {
		if (usage.size > MAX_RECORDS) usage.delete(usage.keys().next().value as string);
		u = { recent: [], junk: [], day: kstDay(now), chars: 0 };
		usage.set(key, u);
	}
	if (u.day !== kstDay(now)) {
		u.day = kstDay(now);
		u.chars = 0;
	}
	u.recent = u.recent.filter((r) => now - r.at < REPEAT_WINDOW);
	u.junk = u.junk.filter((at) => now - at < REPEAT_WINDOW);
	return u;
}

export function screenQuestion(input: {
	text: unknown;
	ip?: string | undefined;
	sessionId?: string | undefined;
	now?: number;
	limited?: (ip: string | undefined, sessionId: string | undefined) => boolean;
	settings?: BotSettings; // 없으면 지금 쓰는 설정 (관리자 사이트 > 챗봇 설정)
}): Gate | null {
	const { ip, sessionId } = input;
	const cfg = input.settings ?? currentBotSettings();
	const now = input.now ?? Date.now();
	const text = String(input.text ?? '');
	const local = isLocal(ip);

	if (!local) {
		const until = suspendedUntil(ip, sessionId, now);
		if (until) {
			return { message: suspendedMessage(until - now, false), moderation: suspendedInfo('suspended', strikeCount(ip, sessionId, now), until, now) };
		}
	}

	// 경고를 주고 안내 — 이번 경고로 정지되면 정지 안내까지
	const strike = (reason: StrikeReason, base: Msg): Gate => {
		if (local) return { message: base, moderation: { level: 'blocked', reason, strikes: 0 } };
		const s = addStrike(ip, sessionId, reason, now, cfg);
		if (s.until) {
			return { message: join(join(base, { ko: '\n\n', en: '\n\n' }), suspendedMessage(s.until - now, true)), moderation: suspendedInfo(reason, s.strikes, s.until, now) };
		}
		if (!s.added) return { message: base, moderation: { level: 'blocked', reason, strikes: s.strikes } };
		return { message: join(base, warningSuffix(s.strikes, cfg.warnLimit)), moderation: { level: 'warning', reason, strikes: s.strikes } };
	};

	const limited = input.limited ?? ((i: string | undefined, s: string | undefined) => questionLimited(i, s, Date.now(), cfg));
	if (limited(ip, sessionId)) return strike('rate_limit', LIMIT_MESSAGE);

	if (text.length > cfg.maxQuestionChars) {
		if (text.length > strikeChars(cfg)) return strike('oversized', tooLongMessage(cfg.maxQuestionChars));
		return { message: tooLongMessage(cfg.maxQuestionChars), moderation: { level: 'blocked', reason: 'too_long', strikes: local ? 0 : strikeCount(ip, sessionId, now) } };
	}

	if (isOffensive(text)) return strike('offensive', PROFANITY_MESSAGE);
	if (detectAttack(text)) return strike('attack', ATTACK_MESSAGE);

	// 불필요한 질문·과다 사용 (서버 안 질문은 제외 — 시나리오 테스트가 같은 질문을 되풀이할 수 있음)
	if (!local) {
		const u = usageOf(subjects(ip, sessionId).primary, now);
		if (u.chars + text.length > cfg.dailyCharBudget) {
			return { message: DAILY_BUDGET_MESSAGE, moderation: { level: 'blocked', reason: 'daily_budget', strikes: strikeCount(ip, sessionId, now) } };
		}
		if (isMeaningless(text)) {
			u.junk.push(now);
			if (u.junk.length >= cfg.meaninglessStrikeAt) return strike('spam', MEANINGLESS_MESSAGE);
			return { message: MEANINGLESS_MESSAGE, moderation: { level: 'blocked', reason: 'meaningless', strikes: strikeCount(ip, sessionId, now) } };
		}
		const key = normQ(text);
		const same = u.recent.filter((r) => r.key === key).length + 1;
		u.recent.push({ key, at: now });
		if (same >= cfg.repeatStrikeAt) return strike('spam', REPEAT_MESSAGE);
		if (same >= cfg.repeatNoticeAt) {
			return { message: REPEAT_MESSAGE, moderation: { level: 'blocked', reason: 'repeat', strikes: strikeCount(ip, sessionId, now) } };
		}
		u.chars += text.length; // 실제로 답하러 가는 질문만 셈
	}

	const kind = detectPersonalUse(text, cfg);
	if (kind) {
		return { message: personalUseMessage(kind), moderation: { level: 'blocked', reason: 'off_topic', strikes: local ? 0 : strikeCount(ip, sessionId, now) } };
	}
	return null;
}

// 오래된 기록 정리 (10분마다) — 24시간 지난 경고와 끝난 정지는 지움
setInterval(() => {
	const now = Date.now();
	for (const [k, r] of records) {
		r.hits = r.hits.filter((t) => now - t < DAY);
		if (!r.hits.length && r.until <= now) records.delete(k);
	}
}, 600_000).unref();
