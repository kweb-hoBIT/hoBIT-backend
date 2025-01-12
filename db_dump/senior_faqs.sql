-- MySQL dump 10.13  Distrib 9.0.1, for macos13.7 (x86_64)
--
-- Host: localhost    Database: hobit
-- ------------------------------------------------------
-- Server version	9.0.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `senior_faqs`
--

DROP TABLE IF EXISTS `senior_faqs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `senior_faqs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `maincategory_ko` varchar(45) NOT NULL,
  `maincategory_en` varchar(45) NOT NULL,
  `subcategory_ko` varchar(45) NOT NULL,
  `subcategory_en` varchar(45) NOT NULL,
  `detailcategory_ko` varchar(45) NOT NULL,
  `detailcategory_en` varchar(45) NOT NULL,
  `answer_ko` varchar(3000) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `answer_en` varchar(3000) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `manager` varchar(45) NOT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `senior_faqs_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `senior_faqs_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `senior_faqs`
--

LOCK TABLES `senior_faqs` WRITE;
/*!40000 ALTER TABLE `senior_faqs` DISABLE KEYS */;
INSERT INTO `senior_faqs` VALUES (1,'수강신청','Course Registration','일반','General','기간','Duration','[{\"title\":\"기간\",\"answer\":\"기간은 보통 2월(1학기), 5월(여름계절학기), 8월(2학기), 11월(겨울계절학기)이고, 학년마다 수강신청 기간이 달라 해당 날짜를 정확하게 알아볼 필요가 있어.\",\"url\":\"info.korea.ac.kr\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Duration\",\"answer\":\"The dates are usually February (first semester), May (summer semester), August (second semester), and November (winter semester), but each academic year has a different application period, so you\'ll need to check the dates to be sure.\",\"url\":\"info.korea.ac.kr\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 07:08:23','2025-01-12 08:31:37'),(2,'수강신청','Course Registration','일반','General','사이트','Website','[{\"title\":\"사이트\",\"answer\":\"수강신청 사이트는 수강신청, 수강희망/관심과목 등록(이후 수희등), 과목조회, 안내사항으로 구성되어 있어. 수강신청과 수희등이 수강신청에 사용될 두 기능이고, 과목 조회에서 어떤 강의가 있는지 대상이 누구인지 등을 확인할 수 있어. 안내사항에서는 수강신청 기간, 강의실 안내 등 필요한 정보를 확인할 수 있어.\",\"url\":\"info.korea.ac.kr\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Website\",\"answer\":\"The course registration site is organized into course registration, registering courses you want to take/are interested in (later known as enrollment), course search, and information. Enrollment and enrollment are the two functions you\'ll use to register for courses, while course search lets you see what courses are available and who they are for. You can check information such as enrollment period, classroom information, and more.\",\"url\":\"info.korea.ac.kr\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 07:09:12','2025-01-12 08:31:29'),(3,'수강신청','Course Registration','일반','General','방법','Methods','[{\"title\":\"방법\",\"answer\":\"수강희망과목등록(이하 수희등)은 본격적인 수강 신청 이전에 수강신청하고자 하는 강의를 담아두는 것을 말해. 다만, 수희등에 등록하였다고 하여 수강신청이 된 것은 아니므로 주의해야 하고, 신입생은 수희등을 이용할 수 없어.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}},{\"title\":\"방법\",\"answer\":\"수희등을 이용할 수 없는 경우, 학수번호와 분반을 이용하여 개설 과목을 검색하여 신청하거나, 개설 과목을 검색하여 신청할 수 있어. 수희등을 이용할 수 있는 경우, 등록된 관심 강의에서 수강신청할 수 있어.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}},{\"title\":\"방법\",\"answer\":\"또한, 신청한 강의를 취소하고 싶거나 놓친 강의를 신청할 기회를 얻고 싶다면 수강정정을  시도할 수 있어. 수강정정 역시 수강신청과 같은 사이트에서 할 수 있어.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Methods\",\"answer\":\"The course registration (hereinafter referred to as the \\\"wish list\\\") is a way to record the courses you want to take before applying for a full course. However, it should be noted that registering in the wish list does not mean that you have registered for the course, and freshmen cannot use the wish list.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}},{\"title\":\"Methods\",\"answer\":\"If you don\'t have access to the gradebook, you can search for and sign up for courses by using your course number and class, or you can search for and sign up for courses. If you do have access to the gradebook, you can sign up for courses you\'re interested in.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}},{\"title\":\"Methods\",\"answer\":\"If you want to cancel a course you\'ve signed up for or want to get a chance to sign up for a course you missed, you can try to add a course, which can also be done on the same site as signing up for a course.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:30:53','2025-01-12 08:31:16'),(4,'수강신청','Course Registration','팁','Tips','KLUE','KLUE','[{\"title\":\"KLUE\",\"answer\":\"KLUE는 고려대학교 학생들이 수강한 과목에 대한 평을 볼 수 있는 사이트야. 근데 신입생은 계정을 만들 수가 없어서, 뻔선에게 부탁해서 관심 있는 과목에 대해 미리 알아보면 좋을 거야!\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"KLUE\",\"answer\":\"KLUE is a site where you can read reviews of courses taken by KU students, but freshmen can\'t create an account, so it\'s a good idea to ask an alum to help you find out about the courses you\'re interested in!\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:32:44','2025-01-12 08:34:22'),(5,'수강신청','Course Registration','팁','Tips','강의실','Classroom','[{\"title\":\"강의실\",\"answer\":\"특히 신입생들은 교양을 듣는 경우가 많을 거야. 문과대랑 이과대랑 거리가 걸어서 10분에서 15분 정도 걸리니까 시간표를 짤 때 이 부분을 잘 고려해서 짜는 게 좋아. 그리고 점심시간도 고려하는 것도 좋을 거야!\\n\\n교내 셔틀버스도 함께 운영하니 참고해~\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Classroom\",\"answer\":\"Especially for freshmen, the distance between the liberal arts and sciences is about 10 to 15 minutes on foot, so it\'s a good idea to take this into account when organizing your schedule, and also take into account lunch breaks!\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:33:49','2025-01-12 08:34:12'),(6,'공간정보','Spatial information','예약','Scheduling','열람실','Reading Room','[{\"title\":\"열람실\",\"answer\":\"키오스크(학생증 필요) 또는 KLIB2 앱을 통해 예약할 수 있어. 앱을 통해 예약하는 경우 최초 10분 내에 앱을 통한 인증이 필요해. 이후 4시간 간격으로 시간 연장이 필요하니 잊지마!\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Reading Room\",\"answer\":\"You can book through the kiosks (student ID required) or the KLIB2 app. If you book through the app, you\'ll need to authenticate through the app within the first 10 minutes, and then extend your time in 4-hour intervals.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:36:05','2025-01-12 08:36:25'),(7,'공간정보','Spatial information','예약','Scheduling','스터디룸','Study Rooms','[{\"title\":\"스터디룸\",\"answer\":\"스터디룸 예약은 KLIB 2 ‘스터디룸 시설물 예약’을 통해 예약할 수 있어.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Study Rooms\",\"answer\":\"Study room reservations can be made through KLIB 2 \'Book a Study Room Facility\'.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:38:02','2025-01-12 08:39:59'),(8,'공간정보','Spatial information','이과캠퍼스','Science Campus','과학도서관','Science Library','[{\"title\":\"과학도서관\",\"answer\":\"1층에는 알파 라운지, 인피니티 라운지 등 자유롭게 공부할 수 있는 시설이 있어. 이때, 좌석에 번호가 있는 경우는 자리 예약이 따로 필요하니 참고해! 이외 2층, 4층, 5층에 B-Lounge, 노트북 열람실, 일반열람실이 있어.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Science Library\",\"answer\":\"On the first floor, you can find the Alpha Lounge and Infinity Lounge, where you can study freely, but you need to reserve a seat if the seats are numbered! On the second, fourth, and fifth floors, you can find the B-Lounge, laptop reading room, and general reading room.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:39:26','2025-01-12 08:40:16'),(9,'공간정보','Spatial information','이과캠퍼스','Science Campus','하나스퀘어','HanaSquare','[{\"title\":\"하나스퀘어\",\"answer\":\"과도 바로 아래에 위치하고 잔디광장에서 들어갈 수도 있어. 과학도서관과 이어진 연결통로 또한 존재해! 하스 열람실은 24시간 오픈하지만, 시험 기간에 자리잡기가 치열하니 참고해. 열람실 외에도 맘스터치, 편의점, 기념품점 등 여러 편의시설이 존재하는 곳이야.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"HanaSquare\",\"answer\":\"It\'s located right under the bridge and can also be accessed from the lawn. There is also a connection to the Science Library! The Hearth Reading Room is open 24 hours a day, but be aware that seating is limited during exam periods. In addition to the reading room, there are a number of other amenities, including a MomsTouch, convenience store, and gift shop.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:42:54','2025-01-12 08:43:06'),(10,'공간정보','Spatial information','이과캠퍼스','Science Campus','애기능생활관','Aegineung','[{\"title\":\"애기능생활관\",\"answer\":\"정보대학에서 자주 사용하는 건물이야. 3층은 강의실과 연구실이 위치하고, 2층은 학생식당이 위치해있어. 강의실도 대여할 수 있는데 따로 예약이 필요하니 참고해!\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Aegineung\",\"answer\":\"This building is often used by the School of Information. The third floor houses lecture halls and laboratories, and the second floor houses the student cafeteria. You can also rent a lecture hall, but you need to make a reservation.\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:45:55','2025-01-12 08:46:10'),(11,'맛집/카페','Restaurants/Cafes','한식','Korean food','철남','Chulnam','[{\"title\":\"철남\",\"answer\":\"오거리 골목에 위치한 두루치기 맛집이야. 달달한 스타일의 국물없는 두루치기 좋아하면 정말 좋아할 곳!! 맵기도 조절 가능하고 두루치기 종류도 다양해. 모든 메뉴에 볶음밥이 서비스이고 사장님이랑 가위바위보해서 이기면 음료도 서비스로 주신대~\\n\\n추천메뉴 - 맵달새\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','[{\"title\":\"Chulnam\",\"answer\":\"If you like sweet-style soupless dumplings, you\'ll love this place!!! The spiciness is adjustable and there are many types of dumplings. All menus come with fried rice and if you win a game of rock, paper, scissors with the boss, he\'ll give you a free drink~.\\n\\nRecommended Menu - Spicy Dumpling\",\"url\":\"\",\"map\":{\"latitude\":\"\",\"longitude\":\"\"}}]','-',4,4,'2025-01-12 08:49:10','2025-01-12 08:49:28');
/*!40000 ALTER TABLE `senior_faqs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-01-12 17:54:23
