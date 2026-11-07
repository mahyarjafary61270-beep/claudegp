import { createHmac, timingSafeEqual } from 'node:crypto';

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function hmac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export interface JwtPayload {
  sub: string;
  [key: string]: unknown;
}

export function signJwt(payload: JwtPayload, secret: string, ttlSeconds: number): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(
    Buffer.from(
      JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      }),
    ),
  );
  const sig = b64url(hmac(`${header}.${body}`, secret));
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const expected = hmac(`${header}.${body}`, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload & { exp?: number };
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (JSON.parse(Buffer.from(header, 'base64url').toString('utf8')).alg !== 'HS256') return null;
    return payload;
  } catch {
    return null;
  }
}

export function sha256Hex(s: string): string {
  return createHmac('sha256', 'mg-hash').update(s).digest('hex');
}
