import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ACCESS_COOKIE, userFromAccessToken, type AuthUser } from '../modules/auth/service';
import { unauthorized } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export type { AuthUser };

export default fp(async (app: FastifyInstance) => {
  app.decorateRequest('user', null);

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies[ACCESS_COOKIE];
    if (!token) throw unauthorized();
    const user = await userFromAccessToken(token);
    if (!user) throw unauthorized('Invalid or expired token');
    req.user = user;
  });
});
