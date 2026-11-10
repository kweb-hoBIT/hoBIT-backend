#!/usr/bin/env bash
# 리뉴얼 베타 켜기·끄기 (서버에서) — 운영(www·admin·api1·api2)은 영향 없음
#
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh off            # 지금 끔: API는 "점검 중"(503), 리뉴얼 서버·Qdrant·Redis 멈춤 (메모리 반환)
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh on             # 지금 켬
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh on --in 5d     # 5일 뒤 자동으로 켬 (예: 12h, 3d)
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh off --in 2h    # 2시간 뒤 자동으로 끔
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh status         # 상태·예약 확인
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/beta.sh cancel         # 예약 취소
#
# 데이터
#   ... beta.sh refresh-db           # 운영 DB(hobit)를 다시 복사해 베타 DB(hobit_renewal)를 최신으로 (베타에서 고친 FAQ·가입 등은 사라짐 — 지우기 전에 백업)
#   ... beta.sh crawl [all|boards|static]   # 홈페이지 공지·페이지 다시 수집 → 정제 → 색인 (기본 all, 바뀐 것만, OpenAI 비용 소액)
#   ... beta.sh crawl-auto on|off    # 정기 수집 켜기·끄기 — crontab에 5분마다 crawl-tick 한 줄 (일정은 관리자 사이트 > 챗봇 설정 > 정기 수집에서)
#   ... beta.sh crawl-tick           # 지금 돌릴 수집이 있으면 실행 (crawl_tick.py가 정함, 5분마다 자동)
#   ... beta.sh crawl-quick          # 공지·장학 게시판 목록 첫 페이지만 보고 새 글이 있으면 게시판 수집 (15분마다 자동)
#   ... beta.sh test                 # 시나리오 테스트 34개를 베타 서버에 (질문 기록 제외, 실패하면 알림) — 배포 후 자동
#   ... beta.sh rec-check            # 추천 문장 점검: 답 못 하는 예시 질문은 추천에서 뺌 (약 210개 × 2원)
#   ... beta.sh alert-email <주소>   # 수집·점검이 실패하면 이 주소로 메일 (off = 끄기, test = 시험 메일)
#   ... beta.sh db-backup now|on|off # DB 백업: 지금 한 번 / 매일 03:40 자동 켜기·끄기 (운영 hobit + 베타 hobit_renewal, 14일 보관)
#
# 채팅
#   ... beta.sh email-verify off     # 학교 메일 코드 인증 없이 바로 채팅 (시연용 — 누구나 다른 학생 메일로 들어올 수 있음)
#   ... beta.sh email-verify on      # 다시 메일 인증 (기본)
#
# 예약은 systemd 타이머 — 서버가 재부팅되면 예약이 사라지므로 status로 확인
set -euo pipefail

R="$HOME/hobit-renewal"
K="$R/hoBIT-backend/deploy/beta"
FLAG=/etc/caddy/beta-off.flag
APPS="renewal-hobit-backend renewal-admin-backend renewal-rag"
SELF="$(readlink -f "$0")"
PROD_ENV="$HOME/hobit/hoBIT-admin-backend/.env"
CRON_TAG="# hobit-renewal-crawl"
BACKUP_TAG="# hobit-db-backup"
BACKUP_DIR="$HOME/backups/daily"
BACKUP_KEEP_DAYS=14
CHAT_ENV="$R/hoBIT-backend/.env"
ALERT_FILE="$R/alert-email"        # 실패 알림 받을 주소 (한 줄)
ALERT_STATE="$R/.last-alert"       # 같은 문제는 하루에 한 번만 알림
LATEST="$R/hoBIT-rag/logs/pipeline/latest.json"

load_pm2() { export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null; nvm use 20 >/dev/null; }

off() {
  sudo touch "$FLAG"                                    # 화면·API에 "점검 중" (즉시)
  load_pm2; pm2 stop $APPS >/dev/null 2>&1 || true; pm2 save >/dev/null
  ( cd "$K" && sudo docker compose stop >/dev/null 2>&1 ) || true
  echo "베타 꺼짐 — $(date '+%m/%d %H:%M')"
}

on() {
  ( cd "$K" && sudo docker compose start >/dev/null 2>&1 || sudo docker compose up -d >/dev/null )
  for i in $(seq 1 30); do curl -sf http://127.0.0.1:6333/healthz >/dev/null && break; sleep 2; done
  load_pm2; pm2 start $APPS >/dev/null 2>&1 || pm2 start "$K/ecosystem.config.js" >/dev/null; pm2 save >/dev/null
  for i in $(seq 1 30); do curl -sf http://127.0.0.1:4100/health >/dev/null && break; sleep 2; done
  sudo rm -f "$FLAG"                                    # 서버가 준비된 뒤에 점검 해제
  echo "베타 켜짐 — $(date '+%m/%d %H:%M') (챗봇 API $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health))"
}

schedule() { # $1 = on|off, $2 = 5d / 12h / 30m
  local d="$2" sec
  case "$d" in *d) sec=$(( ${d%d} * 86400 ));; *h) sec=$(( ${d%h} * 3600 ));; *m) sec=$(( ${d%m} * 60 ));; *) echo "시간 형식: 5d / 12h / 30m"; exit 1;; esac
  sudo systemctl stop "beta-$1.timer" >/dev/null 2>&1 || true
  sudo systemd-run --unit "beta-$1" --on-active="${sec}s" --uid "$(id -u)" --setenv HOME="$HOME" /bin/bash "$SELF" "$1" >/dev/null
  echo "예약: $(date -d "+${sec} seconds" '+%m/%d %H:%M')에 베타 $1"
}

status() {
  if [ -f "$FLAG" ]; then echo "상태: 꺼짐 (점검 중 표시)"; else echo "상태: 켜짐"; fi
  load_pm2; pm2 jlist 2>/dev/null | python3 -c "import sys,json; [print('  ', p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name'].startswith('renewal-')]"
  systemctl list-timers --all 2>/dev/null | grep -E "beta-(on|off)" | awk '{print "   예약:", $0}' || true
  free -h | sed -n 2p | awk '{print "   메모리:", $3, "/", $2}'
  crontab -l 2>/dev/null | grep -q "$CRON_TAG" && echo "   정기 수집: 켜짐" || echo "   정기 수집: 꺼짐"
  crontab -l 2>/dev/null | grep -q "$BACKUP_TAG" && echo "   DB 백업: 켜짐 (마지막: $(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1 | xargs -r basename))" || echo "   DB 백업: 꺼짐 (beta.sh db-backup on)"
  [ "$(val CHAT_SKIP_EMAIL_VERIFY "$CHAT_ENV")" = "1" ] && echo "   채팅 메일 인증: 꺼짐 (코드 없이 입장)" || echo "   채팅 메일 인증: 켜짐"
  ls -t "$R/hoBIT-rag/logs"/pipeline_*.log 2>/dev/null | head -1 | xargs -r -I{} sh -c 'echo "   마지막 수집: $(basename {} .log | sed s/pipeline_//)"'
  [ -f "$LATEST" ] && python3 -c "import json;d=json.load(open('$LATEST'));print('   수집 결과:', '정상' if d['ok'] else '문제 — ' + ' / '.join(d['problems']))"
  ls -t "$R/hoBIT-rag/logs"/rec_check_*.log 2>/dev/null | head -1 | xargs -r -I{} sh -c 'echo "   마지막 추천 점검: $(basename {} .log | sed s/rec_check_//) — $(tail -n 50 {} | grep -m1 "^답함" || echo 결과 없음)"'
  [ -s "$ALERT_FILE" ] && echo "   실패 알림: $(cat "$ALERT_FILE")" || echo "   실패 알림: 꺼짐 (beta.sh alert-email <주소>)"
}

# 실패 알림 메일 — 주소가 없으면 건너뜀. 같은 내용은 24시간에 한 번만 (3시간마다 같은 메일이 오지 않게)
alert() { # $1 = 제목, $2 = 본문
  [ -s "$ALERT_FILE" ] || return 0
  local to sig now last_sig last_at
  to="$(head -1 "$ALERT_FILE")"; sig="$(printf '%s' "$1$2" | md5sum | cut -c1-12)"; now="$(date +%s)"
  if [ -f "$ALERT_STATE" ]; then read -r last_sig last_at < "$ALERT_STATE" || true; fi
  if [ "${last_sig:-}" = "$sig" ] && [ $(( now - ${last_at:-0} )) -lt 86400 ]; then return 0; fi
  printf 'To: %s\nSubject: =?UTF-8?B?%s?=\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n%s\n\n— hoBIT 베타 서버 (%s)\n' \
    "$to" "$(printf '[hoBIT 베타] %s' "$1" | base64 -w0)" "$2" "$(date '+%Y-%m-%d %H:%M')" | msmtp "$to" \
    && echo "$sig $now" > "$ALERT_STATE" || echo "알림 메일 보내기 실패 (~/.msmtprc 확인)"
}

alert_email() { # $1 = 주소 | off | test | (없음 = 지금 설정 보기)
  case "${1:-}" in
    "") [ -s "$ALERT_FILE" ] && echo "실패 알림: $(cat "$ALERT_FILE")" || echo "실패 알림 꺼짐" ;;
    off) rm -f "$ALERT_FILE" "$ALERT_STATE"; echo "실패 알림 꺼짐" ;;
    test) rm -f "$ALERT_STATE"; alert "알림 시험" "실패 알림이 이 주소로 온다는 시험 메일이에요."; echo "시험 메일 보냄 → $(cat "$ALERT_FILE" 2>/dev/null)" ;;
    *@*) echo "$1" > "$ALERT_FILE"; chmod 600 "$ALERT_FILE"; echo "실패 알림 → $1 (시험: beta.sh alert-email test)" ;;
    *) echo "beta.sh alert-email <메일 주소> | off | test"; exit 1 ;;
  esac
}

val() { grep -E "^$1=" "$2" | head -1 | cut -d= -f2- | tr -d '\r'; }   # .env 값 (출력하지 않음)

refresh_db() {
  local TS; TS="$(date +%Y%m%d_%H%M)"
  read -rp "베타 DB(hobit_renewal)를 운영 최신 데이터로 다시 만들어요. 베타에서 바꾼 FAQ·가입·키워드는 사라져요 (백업은 남김). 진행할까요? [y/N] " a
  [ "$a" = "y" ] || [ "$a" = "Y" ] || { echo "취소"; exit 0; }
  local H U; H="$(val DB_HOST "$PROD_ENV")"; U="$(val DB_USER "$PROD_ENV")"; export MYSQL_PWD="$(val DB_PASSWORD "$PROD_ENV")"
  mkdir -p "$HOME/backups"; chmod 700 "$HOME/backups"
  mysqldump -h"$H" -u"$U" --single-transaction --no-tablespaces --set-gtid-purged=OFF hobit_renewal | gzip > "$HOME/backups/hobit_renewal_before_refresh_$TS.sql.gz"
  mysqldump -h"$H" -u"$U" --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF hobit | gzip > "$HOME/backups/hobit_$TS.sql.gz"
  chmod 600 "$HOME/backups/"*"$TS.sql.gz"
  mysql -h"$H" -u"$U" -e "DROP DATABASE hobit_renewal; CREATE DATABASE hobit_renewal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
  gunzip -c "$HOME/backups/hobit_$TS.sql.gz" | mysql -h"$H" -u"$U" hobit_renewal
  echo "베타 DB 새로 복사됨 — FAQ $(mysql -h"$H" -u"$U" -N -e 'SELECT COUNT(*) FROM hobit_renewal.faqs')개 (이전 베타 DB 백업: ~/backups/hobit_renewal_before_refresh_$TS.sql.gz)"
  # 리뉴얼 백엔드가 켜질 때 만드는 표(키워드 규칙 등)를 다시 만들도록 재시작, FAQ 검색 데이터도 맞춤
  if [ ! -f "$FLAG" ]; then load_pm2; pm2 restart renewal-admin-backend renewal-hobit-backend >/dev/null; fi
  crawl all --skip-crawl
}

db_backup() { # 운영·베타 DB를 날짜별 파일로 (같은 서버 안 — 서버 자체가 망가지는 경우는 EBS 스냅샷으로 대비)
  local TS H U ok=1 db f; TS="$(date +%Y%m%d_%H%M)"
  H="$(val DB_HOST "$PROD_ENV")"; U="$(val DB_USER "$PROD_ENV")"; export MYSQL_PWD="$(val DB_PASSWORD "$PROD_ENV")"
  mkdir -p "$BACKUP_DIR"; chmod 700 "$HOME/backups" "$BACKUP_DIR"
  for db in hobit hobit_renewal; do
    f="$BACKUP_DIR/${db}_$TS.sql.gz"
    if mysqldump -h"$H" -u"$U" --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$db" | gzip > "$f" \
       && [ "$(gunzip -c "$f" | tail -1 | grep -c 'Dump completed')" = 1 ]; then
      chmod 600 "$f"; echo "백업: $f ($(du -h "$f" | cut -f1))"
    else
      ok=0; rm -f "$f"; echo "백업 실패: $db"
    fi
  done
  find "$BACKUP_DIR" -name '*.sql.gz' -mtime +"$BACKUP_KEEP_DAYS" -delete   # 14일 지난 것 정리
  [ "$ok" = 1 ] || { alert "DB 백업 실패" "$(date '+%m/%d %H:%M') DB 백업이 실패했어요. 서버에서 beta.sh db-backup now 로 다시 시도해 주세요."; return 1; }
}

db_backup_auto() {
  local cur; cur="$(crontab -l 2>/dev/null | grep -v "$BACKUP_TAG" || true)"
  if [ "$1" = "on" ]; then
    printf '%s\n%s\n' "$cur" "40 3 * * * /bin/bash $SELF db-backup now >/dev/null 2>&1 $BACKUP_TAG" | sed '/^$/d' | crontab -
    echo "DB 백업 켜짐: 매일 03:40 (운영·베타, ${BACKUP_KEEP_DAYS}일 보관 — $BACKUP_DIR)"
  else
    printf '%s\n' "$cur" | sed '/^$/d' | crontab -
    echo "DB 백업 꺼짐"
  fi
}

scenario_test() { # 배포 후 자동(update.sh) 또는 직접 — 같은 시간에 두 번 돌지 않게 잠금
  local dir="$R/hoBIT-rag/logs/scenarios"; mkdir -p "$dir"
  exec 9>"$dir/.lock"
  flock -n 9 || { echo "시나리오 테스트가 이미 실행 중 — 건너뜀"; return 0; }
  local out code=0
  out="$(cd "$R/hoBIT-rag" && venv/bin/python scripts/scenario_check.py 2>&1)" || code=$?
  echo "$out"
  if [ "$code" != 0 ]; then
    alert "배포 후 시나리오 테스트 실패" "새 버전에서 답변 동작이 기대와 다른 시나리오가 있어요 (한 번 더 돌려도 실패).
$out

자세한 결과: $dir/latest.json"
  fi
}

crawl_quick() { # 새 공지가 있을 때만 게시판 수집 — 목록 4장만 보므로 학교 서버·비용 부담 거의 없음
  local lock="$R/hoBIT-rag/datasets/.pipeline.lock"
  # 다른 수집이 돌고 있으면 건너뜀 (겹치면 파이프라인이 바로 끝나 '수집 실패' 알림이 잘못 감)
  if [ -f "$lock" ] && ! flock -n "$lock" true; then echo "다른 수집이 실행 중 — 건너뜀"; return 0; fi
  local code=0
  ( cd "$R/hoBIT-rag" && venv/bin/python scripts/check_new_notices.py ) || code=$?
  if [ "$code" = 10 ]; then crawl boards; elif [ "$code" != 0 ]; then echo "새 공지 확인 실패 (다음 확인 때 다시)"; fi
}

crawl() { # $1 = all|boards|static, 나머지는 run_pipeline.py 옵션
  local scope="${1:-all}"; shift || true
  local ocr="--no-ocr"; command -v tesseract >/dev/null && ocr=""   # 서버에 OCR 도구가 없으면 이미지 글자 인식은 건너뜀 (이전 결과 유지)
  mkdir -p "$R/hoBIT-rag/logs"
  local log="$R/hoBIT-rag/logs/pipeline_$(date +%Y%m%d_%H%M%S).log"
  echo "수집 시작 ($scope) — 기록: $log"
  local started; started="$(date +%Y-%m-%dT%H:%M:%S)"
  if [ -t 1 ]; then   # 터미널에서 직접 실행: 진행 바(tqdm)까지 전부 실시간으로
    ( cd "$R/hoBIT-rag" && PYTHONUNBUFFERED=1 COLUMNS="$(tput cols 2>/dev/null || echo 100)" venv/bin/python scripts/run_pipeline.py --scope "$scope" $ocr "$@" ) 2>&1 | tee "$log" || true
  else                # 정기 수집(cron)·백그라운드: 요약 줄만
    ( cd "$R/hoBIT-rag" && venv/bin/python scripts/run_pipeline.py --scope "$scope" $ocr "$@" ) 2>&1 | tee "$log" | grep -E "INFO|오류|ERROR|documents" || true
  fi
  find "$R/hoBIT-rag/logs" -maxdepth 1 -name "pipeline_*.log" -mtime +30 -delete
  # 결과 확인 → 문제가 있으면 알림 (실패해도 다음 단계로 넘어가는 단계가 많아 로그만으로는 놓치기 쉬움)
  local result
  result="$(python3 - "$LATEST" "$started" <<'PY' 2>/dev/null || echo "결과 파일을 읽지 못함"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("수집이 끝나지 않았어요 (요약이 기록되지 않음)"); sys.exit()
if d.get("finished_at", "") < sys.argv[2]:
    print("수집이 끝나지 않았어요 (요약이 기록되지 않음)")
elif not d.get("ok"):
    print("\n".join("- " + p for p in d.get("problems", [])))
PY
)"
  if [ -n "$result" ]; then
    echo "문제: $result"
    alert "데이터 수집 문제 ($scope)" "$result

기록: $log
마지막 줄:
$(tail -c 3000 "$log" | tr '\r' '\n' | grep -vE 'it/s|s/it' | tail -n 15)"
  fi
}

rec_check() {
  if [ -f "$FLAG" ]; then echo "베타가 꺼져 있어 건너뜀"; return 0; fi
  mkdir -p "$R/hoBIT-rag/logs"
  local log="$R/hoBIT-rag/logs/rec_check_$(date +%Y%m%d_%H%M%S).log"
  echo "추천 문장 점검 시작 — 기록: $log"
  if ! ( cd "$R/hoBIT-rag" && RAG_URL=http://127.0.0.1:8100 PYTHONUNBUFFERED=1 venv/bin/python scripts/check_rec_items.py ) 2>&1 | tee "$log"; then
    alert "추천 문장 점검 실패" "기록: $log
$(tail -n 15 "$log")"
  fi
  find "$R/hoBIT-rag/logs" -maxdepth 1 -name "rec_check_*.log" -mtime +60 -delete
}

crawl_tick() { # 5분마다 (crontab) — 관리자 사이트에서 정한 일정에 맞는 수집만 실행
  if [ -f "$FLAG" ]; then return 0; fi   # 베타가 꺼져 있으면 쉼
  local acts; acts="$(python3 "$K/crawl_tick.py" 2>/dev/null || true)"
  for a in $acts; do
    case "$a" in
      quick) crawl_quick ;;
      boards|all|static) crawl "$a" ;;
      rec-check) rec_check ;;
    esac
  done
}

crawl_auto() {
  local cur; cur="$(crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true)"
  if [ "$1" = "on" ]; then
    printf '%s\n%s\n' "$cur" \
      "*/5 * * * * /bin/bash $SELF crawl-tick >/dev/null 2>&1 $CRON_TAG" | sed '/^$/d' | crontab -
    echo "정기 수집 켜짐: 5분마다 관리자 사이트(챗봇 설정 > 정기 수집)의 일정을 확인해 맞는 수집만 돌려요. 기본: 15분마다 새 공지 확인, 3시간마다 게시판(매시 20분), 매일 04:30 전체, 일요일 05:40 추천 문장 점검"
  else
    printf '%s\n' "$cur" | sed '/^$/d' | crontab -
    echo "정기 수집 꺼짐"
  fi
}

email_verify() { # $1 = on|off
  local v; [ "$1" = "off" ] && v=1 || v=0
  if grep -q '^CHAT_SKIP_EMAIL_VERIFY=' "$CHAT_ENV"; then sed -i "s/^CHAT_SKIP_EMAIL_VERIFY=.*/CHAT_SKIP_EMAIL_VERIFY=$v/" "$CHAT_ENV"
  else echo "CHAT_SKIP_EMAIL_VERIFY=$v" >> "$CHAT_ENV"; fi
  if [ ! -f "$FLAG" ]; then load_pm2; pm2 restart renewal-hobit-backend --update-env >/dev/null; fi
  if [ "$v" = 1 ]; then echo "채팅 메일 인증 꺼짐 — 학교 메일 주소만 입력하면 바로 입장 (시연이 끝나면 email-verify on)"
  else echo "채팅 메일 인증 켜짐 — 학교 메일로 받은 코드를 입력해야 입장"; fi
}

case "${1:-status}" in
  on|off) if [ "${2:-}" = "--in" ]; then schedule "$1" "${3:?예: 5d}"; else "$1"; fi ;;
  status) status ;;
  cancel) sudo systemctl stop beta-on.timer beta-off.timer >/dev/null 2>&1 || true; echo "예약 취소됨" ;;
  refresh-db) refresh_db ;;
  crawl) shift; crawl "$@" ;;
  crawl-quick) crawl_quick ;;
  crawl-tick) crawl_tick ;;
  test) scenario_test ;;
  test-after-deploy) sleep 90; scenario_test >/dev/null 2>&1 ;;   # update.sh가 부름 — 함께 배포되는 저장소가 모두 뜬 뒤
  crawl-auto) crawl_auto "${2:?on 또는 off}" ;;
  db-backup) case "${2:-}" in now) db_backup ;; on|off) db_backup_auto "$2" ;; *) echo "db-backup now | on | off"; exit 1 ;; esac ;;
  email-verify) case "${2:-}" in on|off) email_verify "$2" ;; *) echo "email-verify on 또는 off"; exit 1 ;; esac ;;
  rec-check) rec_check ;;
  alert-email) alert_email "${2:-}" ;;
  *) sed -n 2,22p "$SELF" ;;
esac
