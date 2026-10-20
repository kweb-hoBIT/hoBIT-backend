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
#   ... beta.sh crawl-auto on|off    # 정기 수집: 3시간마다 게시판(매시 20분), 매일 04:30 전체 — crontab
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
CHAT_ENV="$R/hoBIT-backend/.env"

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
  [ "$(val CHAT_SKIP_EMAIL_VERIFY "$CHAT_ENV")" = "1" ] && echo "   채팅 메일 인증: 꺼짐 (코드 없이 입장)" || echo "   채팅 메일 인증: 켜짐"
  ls -t "$R/hoBIT-rag/logs"/pipeline_*.log 2>/dev/null | head -1 | xargs -r -I{} sh -c 'echo "   마지막 수집: $(basename {} .log | sed s/pipeline_//)"'
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

crawl() { # $1 = all|boards|static, 나머지는 run_pipeline.py 옵션
  local scope="${1:-all}"; shift || true
  local ocr="--no-ocr"; command -v tesseract >/dev/null && ocr=""   # 서버에 OCR 도구가 없으면 이미지 글자 인식은 건너뜀 (이전 결과 유지)
  mkdir -p "$R/hoBIT-rag/logs"
  local log="$R/hoBIT-rag/logs/pipeline_$(date +%Y%m%d_%H%M%S).log"
  echo "수집 시작 ($scope) — 기록: $log"
  ( cd "$R/hoBIT-rag" && venv/bin/python scripts/run_pipeline.py --scope "$scope" $ocr "$@" ) 2>&1 | tee "$log" | grep -E "INFO|오류|ERROR|documents" || true
  find "$R/hoBIT-rag/logs" -maxdepth 1 -name "pipeline_*.log" -mtime +30 -delete
}

crawl_auto() {
  local cur; cur="$(crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true)"
  if [ "$1" = "on" ]; then
    printf '%s\n%s\n%s\n' "$cur" \
      "20 */3 * * * /bin/bash $SELF crawl boards >/dev/null 2>&1 $CRON_TAG" \
      "30 4 * * * /bin/bash $SELF crawl all >/dev/null 2>&1 $CRON_TAG" | sed '/^$/d' | crontab -
    echo "정기 수집 켜짐: 3시간마다 게시판(매시 20분), 매일 04:30 전체 (기존 자정 스냅샷·03시 Rasa 업데이트와 안 겹침)"
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
  crawl-auto) crawl_auto "${2:?on 또는 off}" ;;
  email-verify) case "${2:-}" in on|off) email_verify "$2" ;; *) echo "email-verify on 또는 off"; exit 1 ;; esac ;;
  *) sed -n 2,20p "$SELF" ;;
esac
