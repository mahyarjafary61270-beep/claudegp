import type { FastifyInstance } from 'fastify';
import { env } from '../../env';
import { prisma } from '../../lib/db';
import { nextId, randomId } from '../../lib/snowflake';
import { AppError, badRequest, unauthorized } from '../../plugins/errors';
import { loginSchema, registerSchema } from '@mg/shared';
import { toUserDTO } from '../serialize';
import { hub } from '../../ws/hub';
import { getOrCreateDefaultServer } from '../servers/bootstrap';
import {
  clearSessionCookies,
  createRefreshToken,
  hashPassword,
  rotateRefreshToken,
  revokeRefreshToken,
  setSessionCookies,
  signAccessToken,
  verifyPassword,
} from './service';
import { REFRESH_COOKIE } from './service';

const REFRESH_COOKIE_OPTS = { path: '/api/auth' };

export function authRoutes(app: FastifyInstance): void {
  app.post(
    '/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const body = registerSchema.parse(req.body);
      const isFirstUser = (await prisma.user.count()) === 0;

      if (!isFirstUser && env.REGISTRATION_MODE === 'invite') {
        if (!body.inviteCode) throw badRequest('An invite code is required to register');
        const valid = await validateInvite(body.inviteCode);
        if (!valid) throw badRequest('Invalid or expired invite code');
      }

      const existing = await prisma.user.findUnique({ where: { username: body.username.toLowerCase() } });
      if (existing) throw new AppError(409, 'USERNAME_TAKEN', 'That username is already taken');

      const user = await prisma.user.create({
        data: {
          id: nextId(),
          username: body.username.toLowerCase(),
          displayName: body.displayName?.trim() || body.username,
          passwordHash: await hashPassword(body.password),
          isGlobalAdmin: isFirstUser,
        },
      });

      const server = await getOrCreateDefaultServer(user.id);
      if (server) {
        await prisma.member.create({
          data: { serverId: server.id, userId: user.id, role: isFirstUser ? 'OWNER' : 'MEMBER' },
        }).catch(() => undefined);
        hub.addServerMembership(server.id, user.id);
      }

      if (!isFirstUser && env.REGISTRATION_MODE === 'invite' && body.inviteCode !== env.INVITE_CODE) {
        await prisma.invite.updateMany(
          { where: { code: body.inviteCode ?? '\u0000', serverId: null }, data: { uses: { increment: 1 } } },
        );
      }

      const authUser = { id: user.id, username: user.username, displayName: user.displayName, isGlobalAdmin: user.isGlobalAdmin };
      const accessToken = signAccessToken(authUser);
      const refreshToken = await createRefreshToken(user.id);
      setSessionCookies(reply, accessToken, refreshToken);
      return reply.code(201).send({ user: toUserDTO(user), accessToken });
    },
  );

  app.post(
    '/login',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { username: body.username.toLowerCase() } });
      // Constant-ish behavior for missing users
      const hash = user?.passwordHash ?? 'argon2$mismatchhashvalue0000000000000000000000000000000000000000000000000000';
      const ok = await verifyPassword(hash, body.password);
      if (!user || !ok) throw unauthorized('Wrong username or password');

      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
      const authUser = { id: user.id, username: user.username, displayName: user.displayName, isGlobalAdmin: user.isGlobalAdmin };
      const accessToken = signAccessToken(authUser);
      const refreshToken = await createRefreshToken(user.id);
      setSessionCookies(reply, accessToken, refreshToken);
      return { user: toUserDTO(user), accessToken };
    },
  );

  app.post(
    '/refresh',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE];
      if (!token) throw unauthorized('No refresh token');
      const newRefresh = await rotateRefreshToken(token);
      const { verifyJwt } = await import('../../lib/jwt');
      const claims = verifyJwt(newRefresh, env.JWT_REFRESH_SECRET);
      if (!claims || typeof claims.sub !== 'string') throw unauthorized('Invalid refresh token');
      const user = await prisma.user.findUnique({ where: { id: claims.sub } });
      if (!user) throw unauthorized('User no longer exists');
      const authUser = { id: user.id, username: user.username, displayName: user.displayName, isGlobalAdmin: user.isGlobalAdmin };
      const accessToken = signAccessToken(authUser);
      setSessionCookies(reply, accessToken, newRefresh);
      return { user: toUserDTO(user), accessToken };
    },
  );

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    clearSessionCookies(reply);
    return { ok: true };
  });
}

async function validateInvite(code: string): Promise<boolean> {
  if (env.INVITE_CODE && code === env.INVITE_CODE) return true;
  const invite = await prisma.invite.findUnique({ where: { code } });
  if (!invite || invite.serverId !== null) return false;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return false;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return false;
  return true;
}

/** Ensure randomId import is used (invite code generation helper for other modules). */
export function newInviteCode(): string {
  return randomId().slice(0, 10).toUpperCase();
}

export { REFRESH_COOKIE_OPTS };
