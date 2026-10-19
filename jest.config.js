/** 실시간 상담 테스트 — 단위(tests/unit)·통합(tests/integration, 로컬 MariaDB 필요) */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
  testTimeout: 30000,
};
