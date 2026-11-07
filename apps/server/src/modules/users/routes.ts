import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { profileUpdateSchema } from '@mg/shared';
import { prisma } from '../../lib/db';
import { nextId } from '../../lib/snowflake';
import { badRequest, notFound } from '../../plugins/errors';
import { toUserDTO } from '../serialize';
import { storage } from '../uploads/storage';
import { sniffImageMime } from '../uploads/filetype';
import { getPresence } from '../../ws/presence';

export function userRoutes(app: FastifyInstance): void {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound('User not found');
    return { user: toUserDTO(user) };
  });

  app.patch('/me', { preHandler: [app.authenticate] }, async (req) => {
    const body = profileUpdateSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.statusText !== undefined ? { statusText: body.statusText } : {}),
        ...(body.accentColor !== undefined ? { accentColor: body.accentColor } : {}),
      },
    });
    return { user: toUserDTO(user) };
  });

  app.post(
    '/me/avatar',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req) => {
      const file = await req.file({ limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
      if (!file) throw badRequest('No file uploaded');
      const buf = await file.toBuffer();
      const mime = sniffImageMime(buf);
      if (!mime) throw badRequest('Only images (png, jpg, webp, gif) are allowed');

      const webp = await sharp(buf)
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();

      const key = `avatars/${req.user!.id}.webp`;
      await storage.put(key, webp);
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl: `/api/files/${key}?v=${Date.now()}` },
      });
      return { user: toUserDTO(user) };
    },
  );

  app.get('/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User not found');
    return { user: toUserDTO(user), presence: getPresence(user.id) };
  });
}

/** Used by uploads module when generating attachment ids */
export { nextId };
