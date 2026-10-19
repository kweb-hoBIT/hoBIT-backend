# 리뉴얼 베타 배포 (운영 서버 옆에 나란히)

운영(www·admin·api1·api2.hobit.kr, DB `hobit`, `~/hobit`)은 그대로 두고, 같은 EC2(t3.medium)에 새 주소·새 포트·복사본 DB로 띄운다.

| 주소 | 무엇 | 어디 |
|---|---|---|
| beta.hobit.kr | 학생 화면 (hoBIT-frontend) | Vercel (kwebhobit/hoBIT-frontend `renewal` 브랜치) |
| beta-admin.hobit.kr | 관리자 화면 (hoBIT-admin-frontend) | Vercel (kwebhobit/hoBIT-admin-frontend `renewal` 브랜치) |
| beta-api1.hobit.kr | 챗봇 API + 실시간 채팅 (:4100) | EC2 · Caddy |
| beta-api2.hobit.kr | 관리자 API (:5100) | EC2 · Caddy |
| (서버 안) | RAG :8100 · Qdrant :6333 · Redis :6379 | EC2 |

DB: `hobit_renewal` (운영 `hobit` 복사본), `hobit_renewal_chat` (채팅, 자동 생성)

## 브랜치와 자동 배포
| 브랜치 | push하면 |
|---|---|
| `renewal` | **베타**에 자동 반영 (`.github/workflows/beta-deploy.yml`) — 테스트 → 서버에서 코드 받기 → 빌드 → 그 서버만 재시작 |
| `main` | **운영**에 자동 반영 (`actual-deploy.yml`, 기존) — 정식 전환 때 `renewal`을 합침 |

- 백엔드 3개(backend · admin-backend · rag): 서버 `~/hobit-renewal/<저장소>`에서 `git reset --hard origin/renewal` → `update.sh` (패키지 목록이 바뀐 때만 설치)
- 화면 2개: 기존 develop 배포처럼 kwebhobit 저장소의 `renewal` 브랜치로 보냄 → Vercel이 빌드
- 베타가 꺼져 있으면(`beta.sh off`) 코드만 바꾸고 재시작하지 않음
- 필요한 GitHub 비밀값: 백엔드 `EC2_HOST`·`EC2_USER`·`EC2_PRIVATE_KEY` (hoBIT-rag에도), 화면 `KWEBHOBIT_PERSONAL_ACCESS_TOKEN`·`KWEBHOBIT_EMAIL` (기존 그대로)

## 처음 한 번 (서버 준비)
1. **(로컬)** `bash hoBIT-backend/deploy/beta/push.sh` — Qdrant 검색 데이터·RAG 크롤링 상태 업로드 (로컬 Qdrant가 켜져 있어야 함)
2. **(서버)**
   ```bash
   git clone -b renewal git@github.com:kweb-hoBIT/hoBIT-backend.git ~/hobit-renewal/hoBIT-backend
   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/server-setup.sh
   ```
   운영 DB 백업 → 복사본, 나머지 저장소 받기, Qdrant·Redis, .env, 빌드, pm2 실행. 중간에 OpenAI 키를 한 번 물어봄 (화면에 안 보임). 메일은 서버의 SES 설정(~/.msmtprc)을 씀
3. **(Route 53, hobit.kr 영역)** `beta-api1`·`beta-api2` → A `3.221.6.95`, `beta`·`beta-admin` → Vercel이 알려주는 값
4. **(서버)** DNS가 잡히면 Caddy에 `Caddyfile.beta` 붙이고 reload (server-setup.sh 마지막에 명령 나옴)
5. **(Vercel)** kwebhobit/hoBIT-frontend · hoBIT-admin-frontend 프로젝트 → Settings → Domains → 도메인 추가 후 **Git Branch를 `renewal`로**, Environment Variables(Preview · renewal 브랜치)
   - 학생 화면: `REACT_APP_HOBIT_BACKEND_ENDPOINT=https://beta-api1.hobit.kr`
   - 관리자 화면: `REACT_APP_HOBIT_ADMIN_BACKEND_ENDPOINT=https://beta-api2.hobit.kr/api`, `REACT_APP_HOBIT_CHAT_ENDPOINT=https://beta-api1.hobit.kr`, `REACT_APP_HOBIT_URL=https://beta.hobit.kr`

## 확인
- `curl https://beta-api1.hobit.kr/health` → 200, `curl https://beta-api2.hobit.kr/` → 200
- 가입 키: 서버에서 `grep -E '^(MANAGER|SENIOR|DEVELOPER)_KEY=' ~/hobit-renewal/hoBIT-admin-backend/.env`
- 메모리: `free -h` (Rasa 1개 + 리뉴얼 기준 약 2.1GB / 3.7GB)

## 켜기·끄기 (점검 스위치)
```bash
bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh off            # 지금 끔 — 화면에 "잠시 쉬어가요", 리뉴얼 서버·Qdrant·Redis 멈춤
bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh on --in 5d     # 5일 뒤 자동으로 켬
bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh status         # 상태·예약
bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh cancel         # 예약 취소
```
- `/etc/caddy/beta-off.flag` 파일이 있으면 beta-api1·2 가 503 `{"maintenance":true}` — Caddy 재시작 필요 없음
- 화면 두 개는 이 신호를 보고 점검 안내를 띄움 (서버 연결 실패와 구분)
- 예약은 systemd 타이머 — 서버 재부팅 시 사라지므로 `status`로 확인

## 되돌리기
- 리뉴얼만 끄기: `pm2 delete renewal-hobit-backend renewal-admin-backend renewal-rag && pm2 save`, `cd ~/hobit-renewal/hoBIT-backend/deploy/beta && sudo docker compose down`
- Caddy: `sudo cp /etc/caddy/Caddyfile.bak-<시각> /etc/caddy/Caddyfile && sudo systemctl reload caddy`
- Rasa 2개로: `~/hobit/hoBIT-RASAnlu/scripts/rasa_run.sh.bak-20261019` 복원 + `/etc/caddy/Caddyfile.bak-20261019` → `sudo systemctl restart rasa_run`
- 운영 DB 백업: `~/backups/hobit_<시각>.sql.gz`
