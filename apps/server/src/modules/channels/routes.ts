import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { channelCreateSchema, channelReorderSchema, channelUpdateSchema, searchSchema } from '@mg/shared';
import { prisma } from '../../lib/db';
import { nextId } from '../../lib/snowflake';
import { badRequest, forbidden, notFound } from '../../plugins/errors';
import { hub } from '../../ws/hub';
import { requireChannelAccess, requirePermission } from '../servers/permissions';
import { voiceTracker } from '../voice/service';

export function channelRoutes(app: FastifyInstance): void {
  app.post('/servers/:id/channels', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await requirePermission(id, req.user!.id, 'manage_channels');
    const body = channelCreateSchema.parse(req.body);
    const max = await prisma.channel.aggregate({ where: { serverId: id, type: body.type }, _max: { position: true } });
    const channel = await prisma.channel.create({
      data: {
        id: nextId(),
        serverId: id,
        name: body.type === 'TEXT' ? body.name.toLowerCase().replace(/\s+/g, '-') : body.name,
        type: body.type,
        topic: body.topic ?? null,
        position: (max._max.position ?? -1) + 1,
        createdBy: req.user!.id,
      },
    });
    const dto = { id: channel.id, serverId: channel.serverId, name: channel.name, type: channel.type, topic: channel.topic, position: channel.position, createdAt: channel.createdAt.toISOString() };
    hub.sendToServer(id, { t: 'channel_new', channel: dto });
    return reply.code(201).send({ channel: dto });
  });

  app.patch('/channels/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const access = await requireChannelAccess(id, req.user!.id);
    if (!access.channel.serverId) throw badRequest('DM channels cannot be edited');
    await requirePermission(access.channel.serverId, req.user!.id, 'manage_channels');
    const body = channelUpdateSchema.parse(req.body);
    const channel = await prisma.channel.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
      },
    });
    const dto = { id: channel.id, serverId: channel.serverId, name: channel.name, type: channel.type, topic: channel.topic, position: channel.position, createdAt: channel.createdAt.toISOString() };
    hub.sendToServer(access.channel.serverId, { t: 'channel_update', channel: dto });
    return { channel: dto };
  });

  app.delete('/channels/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const access = await requireChannelAccess(id, req.user!.id);
    if (!access.channel.serverId) throw badRequest('DM channels cannot be deleted');
    await requirePermission(access.channel.serverId, req.user!.id, 'manage_channels');
    if (access.channel.type === 'VOICE') {
      const { radioManager } = await import('../radio/manager');
      await radioManager.stop(id, 'channel-deleted');
    }
    voiceTracker.invalidateChannel(id);
    await prisma.channel.delete({ where: { id } });
    hub.sendToServer(access.channel.serverId, { t: 'channel_delete', serverId: access.channel.serverId, channelId: id });
    return { ok: true };
  });

  app.post('/servers/:id/channels/reorder', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requirePermission(id, req.user!.id, 'manage_channels');
    const body = channelReorderSchema.parse(req.body);
    const channels = await prisma.channel.findMany({ where: { serverId: id, type: { in: ['TEXT', 'VOICE'] } } });
    const byId = new Map(channels.map((c) => [c.id, c]));
    if (body.channelIds.some((cid) => !byId.has(cid))) throw badRequest('Unknown channel in reorder list');
    // positions are per-type so text and voice lists order independently
    const counters = { TEXT: 0, VOICE: 0 } as Record<string, number>;
    await prisma.$transaction(
      body.channelIds.map((cid) => {
        const ch = byId.get(cid)!;
        const pos = counters[ch.type]!;
        counters[ch.type] = pos + 1;
        return prisma.channel.update({ where: { id: cid }, data: { position: pos } });
      }),
    );
    return { ok: true };
  });

  // Full-text search across the server's channels
  app.get('/servers/:id/search', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requirePermission(id, req.user!.id, 'view');
    const query = searchSchema.parse(req.query);
    const q = query.q.replace(/[%_]/g, ' ').slice(0, 100);
    const rows = await prisma.$queryRaw<
      { id: string; channelId: string; content: string; createdAt: Date; authorId: string | null; rank: number }[]
    >(Prisma.sql`
      SELECT m.id, m."channelId", m.content, m."createdAt", m."authorId",
             ts_rank_cd(m.search_vector, plainto_tsquery('simple', ${q})) AS rank
      FROM messages m
      JOIN channels c ON c.id = m."channelId"
      WHERE c."serverId" = ${id}
        AND m.search_vector @@ plainto_tsquery('simple', ${q})
      ORDER BY rank DESC, m.id DESC
      LIMIT 30
    `);
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
    const authors = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, displayName: true, avatarUrl: true, accentColor: true, username: true } })
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        channelId: r.channelId,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        author: r.authorId ? (authorMap.get(r.authorId) ?? null) : null,
      })),
    };
  });
}
