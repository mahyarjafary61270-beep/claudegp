import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt, sha256Hex } from '../lib/jwt';
import { hashPassword, verifyPassword, signAccessToken, verifyAccessToken } from '../modules/auth/service';
import { idToTimestamp, nextId } from '../lib/snowflake';

const SECRET = 'test-secret-16chars-min';

describe('jwt', () => {
  it('round-trips a token', () => {
    const token = signJwt({ sub: 'u123' }, SECRET, 60);
    const payload = verifyJwt(token, SECRET);
    expect(payload?.sub).toBe('u123');
  });

  it('rejects wrong secret', () => {
    const token = signJwt({ sub: 'u1' }, SECRET, 60);
    expect(verifyJwt(token, 'another-secret-16chars!')).toBeNull();
  });

  it('rejects tampered payload', () => {
    const token = signJwt({ sub: 'u1' }, SECRET, 60);
    const [h, , s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now() / 1000) + 999 })).toString('base64url')}.${s}`;
    expect(verifyJwt(forged, SECRET)).toBeNull();
  });

  it('rejects expired tokens', () => {
    const token = signJwt({ sub: 'u1' }, SECRET, -1);
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it('deterministic sha256 helper', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
  });
});

describe('argon2 passwords', () => {
  it('hashes and verifies (argon2id)', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});

describe('access tokens', () => {
  it('verifyAccessToken returns subject', () => {
    const token = signAccessToken({ id: 'u42', username: 'mahyar', displayName: 'Mahyar', isGlobalAdmin: true });
    expect(verifyAccessToken(token)?.sub).toBe('u42');
  });
  it('rejects garbage', () => {
    expect(verifyAccessToken('not-a-token')).toBeNull();
  });
});

describe('snowflake ids', () => {
  it('are lexicographically ordered by time', async () => {
    const a = nextId();
    await new Promise((r) => setTimeout(r, 3));
    const b = nextId();
    expect(b > a).toBe(true);
    expect(idToTimestamp(b)).toBeGreaterThanOrEqual(idToTimestamp(a));
  });
});
