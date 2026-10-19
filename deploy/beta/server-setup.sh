#!/usr/bin/env bash
# 서버(EC2)에서 실행 — 리뉴얼 베타를 운영 서비스 옆에 띄움
#   git clone -b renewal git@github.com:kweb-hoBIT/hoBIT-backend.git ~/hobit-renewal/hoBIT-backend   # 처음 한 번
#   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/server-setup.sh
#
# 운영(~/hobit, DB hobit, 포트 4000·5001, pm2 hobit-backend·admin-backend)은 읽기만 함:
#   - 운영 DB는 백업만 받고, 리뉴얼은 복사본 DB(hobit_renewal)와 새 채팅 DB(hobit_renewal_chat)를 씀
#   - 포트 4100(챗봇 API), 5100(관리자 API), 8100(RAG), 6333(Qdrant), 6379(Redis) — 모두 새 포트
# 여러 번 실행해도 됨 (이미 있는 DB·.env는 그대로 둠)
set -euo pipefail

R="$HOME/hobit-renewal"
K="$R/hoBIT-backend/deploy/beta"   # 이 스크립트가 있는 곳
PROD_ENV="$HOME/hobit/hoBIT-admin-backend/.env"
TS="$(date +%Y%m%d_%H%M)"
BETA_WEB="https://beta.hobit.kr"
BETA_ADMIN_WEB="https://beta-admin.hobit.kr"
BETA_API1="https://beta-api1.hobit.kr"
BETA_API2="https://beta-api2.hobit.kr"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
val() { grep -E "^$1=" "$2" | head -1 | cut -d= -f2- | tr -d '\r'; }   # .env 값 읽기 (출력하지 않음)
rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48; }

[ -d "$R/data/qdrant-snapshots" ] || { echo "먼저 로컬에서 hoBIT-backend/deploy/beta/push.sh 로 검색 데이터를 올리세요"; exit 1; }

say "0) 코드 받기 (GitHub renewal 브랜치)"
for repo in hoBIT-backend hoBIT-admin-backend hoBIT-rag; do
  if [ -d "$R/$repo/.git" ]; then
    git -C "$R/$repo" fetch -q origin renewal && git -C "$R/$repo" reset -q --hard origin/renewal
  else
    git clone -q -b renewal "git@github.com:kweb-hoBIT/$repo.git" "$R/$repo"
  fi
  echo "$repo: $(git -C "$R/$repo" log -1 --format='%h %s' | cut -c1-60)"
done
# RAG 크롤링 상태(정제본·수집 기록)는 git에 없으므로 올려 둔 것을 복사 (이미 있으면 그대로)
[ -d "$R/data/rag-datasets" ] && rsync -a --ignore-existing "$R/data/rag-datasets/" "$R/hoBIT-rag/datasets/"

# ── 운영 DB 접속 정보 (값은 화면에 안 찍음) ────────────────────────
DB_HOST="$(val DB_HOST "$PROD_ENV")"; DB_USER="$(val DB_USER "$PROD_ENV")"; DB_PASSWORD="$(val DB_PASSWORD "$PROD_ENV")"
DEEPL_KEY="$(val DEEPL_KEY "$PROD_ENV")"
export MYSQL_PWD="$DB_PASSWORD"
SQL() { mysql -h"$DB_HOST" -u"$DB_USER" "$@"; }

say "1) 운영 DB 백업 → 복사본 DB"
mkdir -p "$HOME/backups"; chmod 700 "$HOME/backups"
DUMP="$HOME/backups/hobit_$TS.sql.gz"
mysqldump -h"$DB_HOST" -u"$DB_USER" --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF hobit | gzip > "$DUMP"
chmod 600 "$DUMP"; echo "백업: $DUMP ($(du -h "$DUMP" | cut -f1))"
if [ -z "$(SQL -N -e "SHOW DATABASES LIKE 'hobit_renewal'")" ]; then
  SQL -e "CREATE DATABASE hobit_renewal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
  gunzip -c "$DUMP" | SQL hobit_renewal
  echo "hobit_renewal 만듦 (운영 데이터 복사)"
else
  echo "hobit_renewal 이미 있음 — 그대로 둠 (새로 복사하려면 DROP 후 다시 실행)"
fi
SQL -N -e "SELECT 'faqs', (SELECT COUNT(*) FROM hobit_renewal.faqs), 'users', (SELECT COUNT(*) FROM hobit_renewal.users)"

say "2) Qdrant·Redis (Docker, 서버 안에서만)"
mkdir -p "$R/data/qdrant" "$R/data/redis" "$R/data/chat-files"
( cd "$K" && sudo docker compose up -d )
for i in $(seq 1 30); do curl -sf http://127.0.0.1:6333/healthz >/dev/null && break; sleep 2; done
for c in renewal_static renewal_dynamic; do
  if curl -sf "http://127.0.0.1:6333/collections/$c" >/dev/null; then
    echo "$c 이미 있음"
  else
    curl -sf -X POST "http://127.0.0.1:6333/collections/$c/snapshots/upload?priority=snapshot" \
      -F "snapshot=@$R/data/qdrant-snapshots/$c.snapshot" >/dev/null && echo "$c 복원 ✓"
  fi
  curl -sf "http://127.0.0.1:6333/collections/$c" | python3 -c "import sys,json; print('   points', json.load(sys.stdin)['result']['points_count'])"
done

say "3) 설정 파일 (.env) — 없을 때만 만듦"
if [ ! -f "$R/hoBIT-backend/.env" ] || [ ! -f "$R/hoBIT-admin-backend/.env" ] || [ ! -f "$R/hoBIT-rag/.env" ]; then
  read -rsp "OpenAI API 키를 붙여넣으세요 (화면에 안 보임): " OPENAI_KEY; echo
  [ -n "$OPENAI_KEY" ] || { echo "키가 비었어요"; exit 1; }
  # 메일: 서버의 SES 설정(~/.msmtprc)을 그대로 씀
  SMTP_USER="$(awk '$1=="user"{print $2; exit}' "$HOME/.msmtprc")"; SMTP_PASS="$(awk '$1=="password"{print $2; exit}' "$HOME/.msmtprc")"
  MAIL_FROM="$(awk '$1=="from"{print $2; exit}' "$HOME/.msmtprc")"
  AGENT_SECRET="$(rand)"
fi
umask 077
[ -f "$R/hoBIT-backend/.env" ] || cat > "$R/hoBIT-backend/.env" <<EOF
NODE_ENV=production
PORT=4100
TIMEZONE=+09:00
DB_HOST=$DB_HOST
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=hobit_renewal
JWT_SECRET=$(rand)
JWT_EXPIRATION=360000
OPENAI_KEY=$OPENAI_KEY
RAG_SERVER_URL=http://127.0.0.1:8100
CORS_ORIGINS=$BETA_WEB,$BETA_ADMIN_WEB
# 실시간 채팅
CHAT_DB_NAME=hobit_renewal_chat
CHAT_STUDENT_SECRET=$(rand)
CHAT_AGENT_SECRET=$AGENT_SECRET
CHAT_FILE_SECRET=$(rand)
CHAT_ALLOWED_ORIGINS=$BETA_WEB,$BETA_ADMIN_WEB
CHAT_STORAGE_DIR=$R/data/chat-files
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
CHAT_MAIL_FROM=hoBIT <$MAIL_FROM>
CHAT_SKIP_EMAIL_VERIFY=0
EOF
[ -f "$R/hoBIT-admin-backend/.env" ] || cat > "$R/hoBIT-admin-backend/.env" <<EOF
NODE_ENV=production
PORT=5100
API_URL=$BETA_API2/api
CLIENT_URL1=$BETA_WEB
CLIENT_URL2=$BETA_ADMIN_WEB
NLU_URL=http://127.0.0.1:5005/webhooks/rest/webhook
TIMEZONE=+09:00
DB_HOST=$DB_HOST
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=hobit_renewal
JWT_SECRET=$(rand)
JWT_EXPIRATION=3600
JWT_REFRESH_EXPIRATION=43200
OPENAI_KEY=$OPENAI_KEY
DEEPL_KEY=$DEEPL_KEY
# 가입 키 — 행정실 / 근로장학생 / 개발자 (새로 만든 값, 운영과 다름)
MANAGER_KEY=$(rand | cut -c1-20)
SENIOR_KEY=$(rand | cut -c1-20)
DEVELOPER_KEY=$(rand | cut -c1-20)
CHAT_AGENT_SECRET=$AGENT_SECRET
CHAT_DB_NAME=hobit_renewal_chat
EOF
[ -f "$R/hoBIT-rag/.env" ] || cat > "$R/hoBIT-rag/.env" <<EOF
OPENAI_KEY=$OPENAI_KEY
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
MAX_TOKENS=2000
TEMPERATURE=0.3
QDRANT_URL=http://127.0.0.1:6333
COLLECTION_STATIC=renewal_static
COLLECTION_DYNAMIC=renewal_dynamic
COLLECTION_BASELINE=renewal_baseline
REDIS_URL=redis://127.0.0.1:6379/0
REDIS_SESSION_TTL=86400
REC_NAMESPACE=rec
CHUNK_SIZE=800
CHUNK_OVERLAP=100
TOP_K=5
SCORE_THRESHOLD=0.7
FAQ_DB_HOST=$DB_HOST
FAQ_DB_USER=$DB_USER
FAQ_DB_PASSWORD=$DB_PASSWORD
FAQ_DB_NAME=hobit_renewal
EOF
umask 022
echo ".env 3개 준비됨 (값은 각 파일에)"

say "4) 설치·빌드"
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null
command -v pm2 >/dev/null || { echo "pm2를 찾지 못했어요 (운영 pm2가 설치된 node 버전으로 nvm use 하세요)"; exit 1; }
for p in hoBIT-backend hoBIT-admin-backend; do
  ( cd "$R/$p" && npm ci --no-audit --no-fund --loglevel=error && npx tsc -p . ) && echo "$p 빌드 ✓"
done
( cd "$R/hoBIT-rag" && { [ -d venv ] || python3 -m venv venv; } && venv/bin/pip install -q --upgrade pip && venv/bin/pip install -q -r requirements.txt ) && echo "RAG 설치 ✓"

say "5) 실행 (pm2)"
pm2 startOrReload "$K/ecosystem.config.js" --update-env
pm2 save >/dev/null
sleep 8
echo "RAG    : $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:8100/health)"
echo "챗봇 API: $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health)"
echo "관리자 API: $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:5100/)"
free -h | sed -n 1,2p

say "다음 할 일"
cat <<EOF
 1) Route 53 에 A 레코드 2개 추가: beta-api1.hobit.kr, beta-api2.hobit.kr → 3.221.6.95
 2) DNS 가 잡히면:  sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$TS
                   cat $K/Caddyfile.beta | sudo tee -a /etc/caddy/Caddyfile >/dev/null
                   sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
 3) Vercel 에 화면 2개 ($K/README.md)
 가입 키 확인:  grep -E '^(MANAGER|SENIOR|DEVELOPER)_KEY=' $R/hoBIT-admin-backend/.env
EOF
