import { isFarPlaceQuestion } from '../../src/middleware/abuse';

describe('학교 주변이 아닌 장소 질문 (주변 장소 검색은 안암캠퍼스만)', () => {
	it.each([
		'강남역 근처 맛집 추천해줘',
		'홍대 카페 알려줘',
		'내 위치 주변 약국 어디야',
		'우리 집 근처 맛집',
		'부산 해운대 맛집 추천',
		'best restaurants in gangnam',
		'cafes near me',
		'잠실 국밥 맛집',
	])('막음: %s', (q) => expect(isFarPlaceQuestion(q)).toBe(true));

	it.each([
		'정보대 근처 24시간 카페 있어?',
		'참살이길 국밥 맛집 추천해줘',
		'안암역 근처 카페',
		'근처 약국 어디야?',
		'고대 정문 앞 맛집',
		'any good restaurants near campus?',
		'강남 인턴 채용 공고 있어?',
		'졸업요건 알려줘',
		'학생식당 메뉴 알려줘',
	])('통과: %s', (q) => expect(isFarPlaceQuestion(q)).toBe(false));
});
