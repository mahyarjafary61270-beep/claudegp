import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv, EnvError } from '../env';

const BASE: Record<string, string> = {
  DATABASE_URL: 'postgresql://u:p@h:5432/db',
  JWT_ACCESS_SECRET: 'access-secret-at-least-16-chars',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-16-chars',
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'key',
  LIVEKIT_API_SECRET: 'secret',
};

afterEach(() => {
  delete process.env.RAILWAY_TEST_MARKER;
});

describe('environment validation', () => {
  it('accepts a valid minimal environment and applies defaults', () => {
    const env = loadEnv(BASE);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.REGISTRATION_MODE).toBe('invite');
    expect(env.MAX_CONCURRENT_RADIOS).toBe(2);
    expect(env.RADIO_MODE).toBe('auto');
    expect(env.UPLOAD_DIR).toBe('./data/uploads');
  });

  it('fails fast listing every missing variable', () => {
    try {
      loadEnv({});
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const msg = (err as Error).message;
      expect(msg).toContain('DATABASE_URL');
      expect(msg).toContain('JWT_ACCESS_SECRET');
      expect(msg).toContain('LIVEKIT_API_KEY');
    }
  });

  it('rejects short secrets', () => {
    expect(() => loadEnv({ ...BASE, JWT_ACCESS_SECRET: 'short' })).toThrow(EnvError);
  });

  it('rejects invalid radio mode and registration mode', () => {
    expect(() => loadEnv({ ...BASE, RADIO_MODE: 'weird' as never })).toThrow(EnvError);
    expect(() => loadEnv({ ...BASE, REGISTRATION_MODE: 'sometimes' as never })).toThrow(EnvError);
  });

  it('coerces numeric env vars', () => {
    const env = loadEnv({ ...BASE, PORT: '4000', MAX_CONCURRENT_RADIOS: '5' });
    expect(env.PORT).toBe(4000);
    expect(env.MAX_CONCURRENT_RADIOS).toBe(5);
  });
});
