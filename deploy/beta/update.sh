#!/usr/bin/env bash
# 자동 배포(GitHub Actions)가 서버에서 부름 — 코드는 이미 origin/renewal 로 맞춰진 상태
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/update.sh <저장소> <이전 커밋>
# 바뀐 것만: 패키지 목록이 바뀌었을 때만 설치, 빌드, 해당 서버만 재시작
# 새 버전이 응답하지 않으면 이전 커밋으로 되돌려 다시 띄우고 실패로 끝냄 (배포 화면에 빨간 표시)
# 베타가 꺼져 있으면(beta.sh off) 코드만 바꾸고 재시작하지 않음
set -euo pipefail

# 전체를 함수로 감싸 끝까지 읽은 뒤 실행 — 되돌리기 중에 이 파일 자체가 바뀌어도 안전하게
main() {
  REPO="$1"; OLD="${2:-}"
  R="$HOME/hobit-renewal"; DIR="$R/$REPO"
  K="$R/hoBIT-backend/deploy/beta"
  FLAG=/etc/caddy/beta-off.flag
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null; nvm use 20 >/dev/null

  cd "$DIR"
  echo "$REPO: $(git log -1 --format='%h %s' | cut -c1-70)"

  case "$REPO" in
    hoBIT-backend) APP=renewal-hobit-backend; URL=http://127.0.0.1:4100/health ;;
    hoBIT-admin-backend) APP=renewal-admin-backend; URL=http://127.0.0.1:5100/ ;;
    hoBIT-rag) APP=renewal-rag; URL=http://127.0.0.1:8100/health ;;
    *) echo "모르는 저장소: $REPO"; exit 1 ;;
  esac

  build "$OLD"
  if [ -f "$FLAG" ]; then
    echo "베타가 꺼져 있어 재시작하지 않음 (켜면 새 코드로 시작)"; exit 0
  fi
  restart
  if health "$URL"; then
    # 챗봇 답변에 영향을 주는 저장소면 시나리오 테스트를 뒤에서 돌림 (배포는 기다리지 않음, 실패하면 알림 메일)
    case "$REPO" in
      hoBIT-backend|hoBIT-rag) setsid nohup bash "$K/beta.sh" test-after-deploy >/dev/null 2>&1 < /dev/null & ;;
    esac
    return 0
  fi

  [ -n "$OLD" ] || exit 1
  local NEW; NEW="$(git rev-parse HEAD)"
  echo "새 버전이 응답하지 않아 이전 버전(${OLD:0:7})으로 되돌림 — 원인: pm2 logs $APP --lines 50"
  git reset -q --hard "$OLD"
  build "$NEW"
  restart
  health "$URL" || echo "이전 버전도 응답하지 않음 — 서버 확인 필요"
  exit 1
}

# 기준 커밋($1)과 지금 코드 사이에 이 파일들이 바뀌었나 (기준이 없으면 바뀐 것으로 봄)
changed() { local base="$1"; shift; [ -z "$base" ] || ! git -C "$DIR" diff --quiet "$base" HEAD -- "$@"; }

build() { # $1 = 비교 기준 커밋 (패키지 목록이 바뀐 때만 설치)
  case "$REPO" in
    hoBIT-backend|hoBIT-admin-backend)
      if changed "$1" package.json package-lock.json; then npm ci --no-audit --no-fund --loglevel=error; fi
      npx tsc -p .
      ;;
    hoBIT-rag)
      if changed "$1" requirements.txt; then venv/bin/pip install -q -r requirements.txt; fi
      venv/bin/python -m compileall -q src config collector scripts >/dev/null
      ;;
  esac
}

# 설정 파일(ecosystem)의 환경 변수까지 반영해 그 서버만 다시 띄움
restart() { pm2 startOrReload "$K/ecosystem.config.js" --only "$APP" --update-env >/dev/null; }

health() { for i in $(seq 1 20); do curl -sf -m 3 "$1" >/dev/null && { echo "정상: $1"; return 0; }; sleep 3; done; echo "응답 없음: $1"; return 1; }

main "$@"
