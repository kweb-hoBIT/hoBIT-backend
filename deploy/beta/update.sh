#!/usr/bin/env bash
# 자동 배포(GitHub Actions)가 서버에서 부름 — 코드는 이미 origin/renewal 로 맞춰진 상태
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/update.sh <저장소> <이전 커밋>
# 바뀐 것만: 패키지 목록이 바뀌었을 때만 설치, 빌드, 해당 서버만 재시작
# 베타가 꺼져 있으면(beta.sh off) 코드만 바꾸고 재시작하지 않음
set -euo pipefail

REPO="$1"; OLD="${2:-}"
R="$HOME/hobit-renewal"; DIR="$R/$REPO"
FLAG=/etc/caddy/beta-off.flag
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null; nvm use 20 >/dev/null

changed() { [ -z "$OLD" ] || ! git -C "$DIR" diff --quiet "$OLD" HEAD -- "$@"; }
health() { for i in $(seq 1 20); do curl -sf -m 3 "$1" >/dev/null && { echo "정상: $1"; return 0; }; sleep 3; done; echo "응답 없음: $1"; return 1; }

cd "$DIR"
echo "$REPO: $(git log -1 --format='%h %s' | cut -c1-70)"

case "$REPO" in
  hoBIT-backend|hoBIT-admin-backend)
    changed package.json package-lock.json && npm ci --no-audit --no-fund --loglevel=error
    npx tsc -p .
    APP=$([ "$REPO" = hoBIT-backend ] && echo renewal-hobit-backend || echo renewal-admin-backend)
    URL=$([ "$REPO" = hoBIT-backend ] && echo http://127.0.0.1:4100/health || echo http://127.0.0.1:5100/)
    ;;
  hoBIT-rag)
    changed requirements.txt && venv/bin/pip install -q -r requirements.txt
    venv/bin/python -m compileall -q src config collector scripts >/dev/null
    APP=renewal-rag; URL=http://127.0.0.1:8100/health
    ;;
  *) echo "모르는 저장소: $REPO"; exit 1 ;;
esac

if [ -f "$FLAG" ]; then
  echo "베타가 꺼져 있어 재시작하지 않음 (켜면 새 코드로 시작)"; exit 0
fi
pm2 restart "$APP" --update-env >/dev/null
health "$URL"
