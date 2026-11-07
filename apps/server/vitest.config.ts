import { defineConfig } from 'vitest/config';

// env.ts validates at import time (fail-fast), so tests run with dummy secrets.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-16-ch',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16-ch',
      LIVEKIT_URL: 'wss://test.livekit.cloud',
      LIVEKIT_API_KEY: 'testkey',
      LIVEKIT_API_SECRET: 'testsecret',
      UPLOAD_DIR: './data/test-uploads',
    },
  },
});
