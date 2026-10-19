#!/usr/bin/env bash
# 로컬(Mac)에서 — 첫 배포 때 한 번: 검색 데이터(Qdrant 스냅샷)와 RAG 크롤링 상태를 서버로 올림
#   bash hoBIT-backend/deploy/beta/push.sh        (hobit_renewal 폴더에서)
# 코드는 서버가 GitHub renewal 브랜치에서 직접 받음 (server-setup.sh · 자동 배포)
set -euo pipefail

KEY="/Users/yoonseo/고려대학교/스터디/KWEB/hoBIT/aws/hobit.pem"
HOST="ubuntu@3.221.6.95"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"   # hobit_renewal
SSH="ssh -i $KEY -o ConnectTimeout=15"
D="hobit-renewal/data"

$SSH "$HOST" "mkdir -p ~/$D/qdrant-snapshots ~/$D/rag-datasets"

echo "== 1) Qdrant 검색 데이터 스냅샷 (로컬 Qdrant가 켜져 있어야 함)"
SNAP_DIR="$(mktemp -d)"
for c in renewal_static renewal_dynamic; do
  name=$(curl -sf -X POST "http://localhost:6333/collections/$c/snapshots" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['name'])")
  curl -sf "http://localhost:6333/collections/$c/snapshots/$name" -o "$SNAP_DIR/$c.snapshot"
  curl -sf -X DELETE "http://localhost:6333/collections/$c/snapshots/$name" >/dev/null || true
  echo "   $c → $(du -h "$SNAP_DIR/$c.snapshot" | cut -f1)"
done
rsync -az -e "$SSH" "$SNAP_DIR/" "$HOST:~/$D/qdrant-snapshots/"
rm -rf "$SNAP_DIR"

echo "== 2) RAG 크롤링 상태 (정제본·원본·수집 기록 — 서버에서 증분 수집을 이어서 하려면 필요)"
rsync -az -e "$SSH" --exclude .pipeline.lock --exclude rec_pool \
  "$ROOT/hoBIT-rag/datasets/" "$HOST:~/$D/rag-datasets/"

echo "== 끝. 서버에서:"
echo "   git clone -b renewal git@github.com:kweb-hoBIT/hoBIT-backend.git ~/hobit-renewal/hoBIT-backend   # 처음 한 번"
echo "   bash ~/hobit-renewal/hoBIT-backend/deploy/beta/server-setup.sh"
