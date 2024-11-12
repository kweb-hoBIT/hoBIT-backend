-- 테스트 데이터 입력
INSERT INTO faqs (
  maincategory_ko, 
  maincategory_en, 
  subcategory_ko, 
  subcategory_en, 
  question_ko, 
  question_en, 
  answer_ko, 
  answer_en, 
  manager, 
  created_at, 
  updated_at
) VALUES ("테스트", "test", "테스트", "test", " 테스트인가요?", "Is it test?", " 테스트입니다.", "That's right.", "허찬", now(), now());

-- 전체 faqs 리스트 조회
SELECT * FROM faqs;