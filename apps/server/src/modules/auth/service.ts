import argon2 from 'argon2';
import { env } from '../../env';
import { prisma } from '../../lib/db';
import { randomId } from '../../lib/snowflake';
import { sha256Hex, signJwt, verifyJwt } from '../../lib/jwt';
import { AppError, unauthorized } from '../../plugins/errors';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
const REFRESH_COOKIE = 'mg_rt';
const ACCESS_COOKIE = 'mg_at';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  isGlobalAdmin: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function signAccessToken(user: AuthUser): string {
  return signJwt({ sub: user.id, un: user.username }, env.JWT_ACCESS_SECRET, ACCESS_TTL_SECONDS);
}

export function verifyAccessToken(token: string): { sub: string } | null {
  const payload = verifyJwt(token, env.JWT_ACCESS_SECRET);
  if (!payload || typeof payload.sub !== 'string') return null;
  return { sub: payload.sub };
}

export async function userFromAccessToken(token: string): Promise<AuthUser | null> {
  const claims = verifyAccessToken(token);
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return null;
  return { id: user.id, username: user.username, displayName: user.displayName, isGlobalAdmin: user.isGlobalAdmin };
}

export async function createRefreshToken(userId: string): Promise<string> {
  const id = randomId();
  const token = signJwt({ sub: userId, jti: id, typ: 'r' }, env.JWT_REFRESH_SECRET, REFRESH_TTL_SECONDS);
  await prisma.refreshToken.create({
    data: {
      id,
      userId,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    },
  });
  return token;
}

/** Rotate a refresh token. Detects reuse: a revoked/unknown token revokes the whole family. */
export async function rotateRefreshToken(token: string): Promise<string> {
  const payload = verifyJwt(token, env.JWT_REFRESH_SECRET);
  const jti = typeof payload?.jti === 'string' ? payload.jti : null;
  const userId = typeof payload?.sub === 'string' ? payload.sub : null;
  if (!payload || !jti || !userId || payload.typ !== 'r') throw unauthorized('Invalid refresh token');

  const row = await prisma.refreshToken.findUnique({ where: { id: jti } });
  if (!row || row.tokenHash !== sha256Hex(token)) {
    // Token not in DB (forged or from an older family) — nothing to revoke beyond this.
    throw unauthorized('Invalid refresh token');
  }
  if (row.revokedAt || row.expiresAt.getTime() < Date.now()) {
    // Reuse detected: revoke every token for this user.
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, 'TOKEN_REUSE', 'Refresh token reuse detected; please log in again');
  }

  const newId = randomId();
  const newToken = signJwt({ sub: row.userId, jti: newId, typ: 'r' }, env.JWT_REFRESH_SECRET, REFRESH_TTL_SECONDS);
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: newId },
    }),
    prisma.refreshToken.create({
      data: {
        id: newId,
        userId: row.userId,
        tokenHash: sha256Hex(newToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    }),
  ]);
  return newToken;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256Hex(token) },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function setSessionCookies(reply: { setCookie: (n: string, v: string, o: Record<string, unknown>) => void }, accessToken: string, refreshToken: string): void {
  const secure = env.NODE_ENV === 'production';
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_TTL_SECONDS + 30,
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/api/auth',
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export function clearSessionCookies(reply: { clearCookie: (n: string, o?: Record<string, unknown>) => void }): void {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export { ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_TTL_SECONDS };
