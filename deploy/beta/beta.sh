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
# 예약은 systemd 타이머 — 서버가 재부팅되면 예약이 사라지므로 status로 확인
set -euo pipefail

R="$HOME/hobit-renewal"
K="$R/hoBIT-backend/deploy/beta"
FLAG=/etc/caddy/beta-off.flag
APPS="renewal-hobit-backend renewal-admin-backend renewal-rag"
SELF="$(readlink -f "$0")"

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
}

case "${1:-status}" in
  on|off) if [ "${2:-}" = "--in" ]; then schedule "$1" "${3:?예: 5d}"; else "$1"; fi ;;
  status) status ;;
  cancel) sudo systemctl stop beta-on.timer beta-off.timer >/dev/null 2>&1 || true; echo "예약 취소됨" ;;
  *) sed -n 2,12p "$SELF" ;;
esac
