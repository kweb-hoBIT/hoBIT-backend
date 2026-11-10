// pm2 — 리뉴얼 베타 3개 (운영 hobit-backend·admin-backend와 이름·포트가 겹치지 않게)
//   pm2 start ~/hobit-renewal/deploy/beta/ecosystem.config.js && pm2 save
const HOME = process.env.HOME;
const R = `${HOME}/hobit-renewal`;
module.exports = {
  apps: [
    {
      name: 'renewal-hobit-backend', // 4100 — 챗봇 API + 실시간 채팅
      cwd: `${R}/hoBIT-backend`,
      script: 'dist/src/main.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
    {
      name: 'renewal-admin-backend', // 5100
      cwd: `${R}/hoBIT-admin-backend`,
      script: 'dist/src/server.js',
      env: { NODE_ENV: 'production', RAG_URL: 'http://127.0.0.1:8100' }, // 대시보드의 데이터 수집 상태
      max_memory_restart: '400M',
    },
    {
      name: 'renewal-rag', // 8100 (서버 안에서만)
      cwd: `${R}/hoBIT-rag`,
      script: `${R}/hoBIT-rag/venv/bin/uvicorn`,
      args: 'src.main:app --host 127.0.0.1 --port 8100 --workers 1 --timeout-keep-alive 65',
      interpreter: 'none',
      max_memory_restart: '900M',
      // 다시 켤 때 처리 중인 답변(길면 20초)을 끝낼 때까지 기다림 — 기본 1.6초면 강제 종료돼 학생 질문이 끊겼음
      kill_timeout: 30000,
    },
  ],
};
