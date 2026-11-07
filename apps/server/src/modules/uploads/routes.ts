import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { badRequest, notFound } from '../../plugins/errors';
import { nextId } from '../../lib/snowflake';
import { prisma } from '../../lib/db';
import { toAttachmentDTO } from '../serialize';
import { storage } from './storage';
import { extForMime, sniffImageMime } from './filetype';

const MAX_UPLOAD = 8 * 1024 * 1024;

export function uploadRoutes(app: FastifyInstance): void {
  app.post(
    '/uploads',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const file = await req.file({ limits: { fileSize: MAX_UPLOAD, files: 1 } });
      if (!file) throw badRequest('No file uploaded');
      const raw = await file.toBuffer();

      const mime = sniffImageMime(raw);
      if (!mime) throw badRequest('Only images are supported (png, jpg, webp, gif)');

      const id = nextId();
      let buf: Buffer;
      let finalMime: string;
      let width: number | null = null;
      let height: number | null = null;

      if (mime === 'image/gif') {
        // keep animation; GIFs carry no EXIF
        buf = raw;
        finalMime = 'image/gif';
      } else {
        const image = sharp(raw, { failOn: 'error' }).rotate(); // bakes EXIF orientation; webp output drops all metadata
        const meta = await image.metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
        const needsRecode = mime !== 'image/webp' || (width ?? 0) > 2048 || (height ?? 0) > 2048;
        if (needsRecode) {
          buf = await image.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          const outMeta = await sharp(buf).metadata();
          width = outMeta.width ?? width;
          height = outMeta.height ?? height;
        } else {
          buf = await image.toBuffer();
        }
        finalMime = 'image/webp';
      }

      const ext = extForMime(finalMime);
      const key = `attachments/${id}.${ext}`;
      await storage.put(key, buf);

      const attachment = await prisma.attachment.create({
        data: {
          id,
          uploaderId: req.user!.id,
          path: key,
          mime: finalMime,
          size: buf.length,
          width,
          height,
          name: (file.filename || 'image').slice(0, 120),
        },
      });
      return reply.code(201).send({ attachment: toAttachmentDTO(attachment) });
    },
  );

  // authenticated file serving (cookie or bearer) — <img> tags carry cookies
  app.get('/files/*', { preHandler: [app.authenticate] }, async (req, reply) => {
    const key = (req.params as { '*': string })['*'];
    if (!key || key.includes('..')) throw notFound();
    if (key.startsWith('avatars/')) {
      const buf = await storage.get(key);
      if (!buf) throw notFound();
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', 'private, max-age=3600')
        .send(buf);
    }
    if (key.startsWith('attachments/')) {
      const id = key.split('/')[1]?.split('.')[0] ?? '';
      const att = await prisma.attachment.findFirst({ where: { OR: [{ id }, { path: key }] } });
      if (!att) throw notFound();
      const buf = await storage.get(att.path);
      if (!buf) throw notFound();
      return reply
        .header('content-type', att.mime)
        .header('content-length', buf.length)
        .header('cache-control', 'private, max-age=604800, immutable')
        .header('content-disposition', `inline; filename="${encodeURIComponent(att.name)}"`)
        .send(buf);
    }
    throw notFound();
  });
}

/** Hourly sweeper: remove attachment rows never attached to a message within 24h. */
export function startUploadSweeper(): NodeJS.Timeout {
  const t = setInterval(
    () => {
      void prisma.attachment
        .findMany({ where: { messageId: null, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } }, select: { id: true, path: true } })
        .then((rows) =>
          Promise.all(
            rows.map(async (r) => {
              await prisma.attachment.delete({ where: { id: r.id } }).catch(() => undefined);
              await storage.delete(r.path);
            }),
          ),
        )
        .catch(() => undefined);
    },
    60 * 60 * 1000,
  );
  t.unref();
  return t;
}
