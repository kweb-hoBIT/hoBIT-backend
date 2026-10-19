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
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
    {
      name: 'renewal-rag', // 8100 (서버 안에서만)
      cwd: `${R}/hoBIT-rag`,
      script: `${R}/hoBIT-rag/venv/bin/uvicorn`,
      args: 'src.main:app --host 127.0.0.1 --port 8100 --workers 1 --timeout-keep-alive 65',
      interpreter: 'none',
      max_memory_restart: '900M',
    },
  ],
};
