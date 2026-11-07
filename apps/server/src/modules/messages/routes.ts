import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { messageCreateSchema, messageEditSchema } from '@mg/shared';
import { prisma } from '../../lib/db';
import { nextId } from '../../lib/snowflake';
import { badRequest, forbidden, notFound } from '../../plugins/errors';
import { toMessageDTO } from '../serialize';
import { hub } from '../../ws/hub';
import { requireChannelAccess } from '../servers/permissions';
import { broadcastMessage, createMessage, getMessageOr404, messageInclude } from './service';
import type { MessageRecord } from '../serialize';

export function messageRoutes(app: FastifyInstance): void {
  // Unread + mention counts for every channel the user can see
  app.get('/unread', { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user!.id;
    const [serverChannels, dmChannels, readStates] = await Promise.all([
      prisma.channel.findMany({
        where: { type: 'TEXT', server: { members: { some: { userId } } } },
        select: { id: true },
      }),
      prisma.channelMember.findMany({
        where: { userId, channel: { type: 'DM' } },
        select: { channelId: true },
      }),
      prisma.readState.findMany({ where: { userId }, select: { channelId: true, lastReadAt: true } }),
    ]);
    const channelIds = [...serverChannels.map((c) => c.id), ...dmChannels.map((c) => c.channelId)];
    if (channelIds.length === 0) return { items: [] };
    const epoch = new Date(0);
    const rows = await prisma.$queryRaw<{ cid: string; cnt: number; mentions: number; last_at: Date | null }[]>(Prisma.sql`
      SELECT m."channelId" AS cid,
             COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE mm."userId" IS NOT NULL)::int AS mentions,
             MAX(m."createdAt") AS last_at
      FROM messages m
      LEFT JOIN message_mentions mm ON mm."messageId" = m.id AND mm."userId" = ${userId}
      LEFT JOIN read_states rs ON rs."channelId" = m."channelId" AND rs."userId" = ${userId}
      WHERE m."channelId" IN (${Prisma.join(channelIds)})
        AND m."authorId" IS DISTINCT FROM ${userId}
        AND m."createdAt" > COALESCE(rs."lastReadAt", ${epoch}::timestamptz)
      GROUP BY m."channelId"
    `);
    const lastAtByChannel = new Map(rows.map((r) => [r.cid, r.last_at]));
    const lastMsgs = await prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, lastMsgAt: true },
    });
    const lastMsgMap = new Map(lastMsgs.map((c) => [c.id, c.lastMsgAt]));
    return {
      items: rows.map((r) => ({
        channelId: r.cid,
        count: r.cnt,
        mentionCount: r.mentions,
        lastMessageAt: (lastMsgMap.get(r.cid) ?? r.last_at ?? null)?.toISOString() ?? null,
      })),
    };
  });

  // History (cursor = last message id from previous page)
  app.get('/channels/:id/messages', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const query = req.query as { cursor?: string; limit?: string };
    await requireChannelAccess(id, req.user!.id);
    const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 100);
    const cursor = query.cursor && /^[0-9A-Z]{11}$/.test(query.cursor) ? query.cursor : null;

    const rows = await prisma.message.findMany({
      where: { channelId: id, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: messageInclude,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.reverse().map((m) => toMessageDTO(m as MessageRecord, req.user!.id)),
      nextCursor: hasMore && page[0] ? page[0].id : null,
      hasMore,
    };
  });

  app.post(
    '/channels/:id/messages',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await requireChannelAccess(id, req.user!.id);
      const body = messageCreateSchema.parse(req.body);
      const message = await createMessage({
        channelId: id,
        authorId: req.user!.id,
        content: body.content.trim(),
        attachmentIds: body.attachmentIds ?? [],
        replyToId: body.replyToId ?? null,
      });
      broadcastMessage(message);
      // mark read for the author implicitly
      await prisma.readState
        .upsert({
          where: { userId_channelId: { userId: req.user!.id, channelId: id } },
          create: { userId: req.user!.id, channelId: id, lastReadAt: new Date(), lastReadMessageId: message.id },
          update: { lastReadAt: new Date(), lastReadMessageId: message.id },
        })
        .catch(() => undefined);
      return reply.code(201).send({ message: toMessageDTO(message, req.user!.id) });
    },
  );

  app.patch('/channels/:id/messages/:mid', { preHandler: [app.authenticate] }, async (req) => {
    const { id, mid } = req.params as { id: string; mid: string };
    await requireChannelAccess(id, req.user!.id);
    const body = messageEditSchema.parse(req.body);
    const existing = await getMessageOr404(id, mid);
    if (existing.authorId !== req.user!.id) throw forbidden('You can only edit your own messages');
    if (existing.kind === 'SYSTEM') throw forbidden('System messages cannot be edited');
    const m = await prisma.message.update({
      where: { id: mid },
      data: { content: body.content, editedAt: new Date() },
      include: messageInclude,
    });
    const dto = toMessageDTO(m as MessageRecord, req.user!.id);
    const ch = await prisma.channel.findUnique({ where: { id }, select: { serverId: true } });
    if (ch?.serverId) hub.sendToServer(ch.serverId, { t: 'message_edit', message: dto });
    else void broadcastToDm(id, { t: 'message_edit', message: dto });
    return { message: dto };
  });

  app.delete('/channels/:id/messages/:mid', { preHandler: [app.authenticate] }, async (req) => {
    const { id, mid } = req.params as { id: string; mid: string };
    const access = await requireChannelAccess(id, req.user!.id);
    const existing = await getMessageOr404(id, mid);
    const canModerate = access.member ? ['OWNER', 'ADMIN'].includes(access.member.role) : false;
    if (existing.authorId !== req.user!.id && !canModerate && !req.user!.isGlobalAdmin) {
      throw forbidden('Not allowed to delete this message');
    }
    await prisma.message.delete({ where: { id: mid } });
    const ch = await prisma.channel.findUnique({ where: { id }, select: { serverId: true } });
    const ev = { t: 'message_delete' as const, channelId: id, messageId: mid };
    if (ch?.serverId) hub.sendToServer(ch.serverId, ev);
    else void broadcastToDm(id, ev);
    return { ok: true };
  });

  app.post('/channels/:id/messages/:mid/reactions', { preHandler: [app.authenticate] }, async (req) => {
    const { id, mid } = req.params as { id: string; mid: string };
    await requireChannelAccess(id, req.user!.id);
    const body = req.body as { emoji?: string };
    const emoji = typeof body.emoji === 'string' ? [...body.emoji].slice(0, 12).join('') : '';
    if (!emoji || emoji.length > 12 || emoji.length < 1) throw badRequest('Invalid emoji');
    await getMessageOr404(id, mid);
    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId: mid, userId: req.user!.id, emoji } },
    });
    if (existing) {
      await prisma.messageReaction.delete({ where: { messageId_userId_emoji: { messageId: mid, userId: req.user!.id, emoji } } });
    } else {
      await prisma.messageReaction.create({ data: { messageId: mid, userId: req.user!.id, emoji } });
    }
    const ev = { t: 'reaction' as const, channelId: id, messageId: mid, emoji, userId: req.user!.id, added: !existing };
    const ch = await prisma.channel.findUnique({ where: { id }, select: { serverId: true } });
    if (ch?.serverId) hub.sendToServer(ch.serverId, ev);
    else void broadcastToDm(id, ev);
    return { added: !existing };
  });

  app.get('/channels/:id/pins', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannelAccess(id, req.user!.id);
    const pins = await prisma.pin.findMany({
      where: { channelId: id },
      orderBy: { pinnedAt: 'desc' },
      take: 50,
      include: { message: { include: messageInclude } },
    });
    return { items: pins.map((p) => toMessageDTO(p.message as MessageRecord, req.user!.id)) };
  });

  app.post('/channels/:id/messages/:mid/pin', { preHandler: [app.authenticate] }, async (req) => {
    const { id, mid } = req.params as { id: string; mid: string };
    await requireChannelAccess(id, req.user!.id);
    await getMessageOr404(id, mid);
    const existing = await prisma.pin.findUnique({ where: { channelId_messageId: { channelId: id, messageId: mid } } });
    if (existing) {
      await prisma.pin.delete({ where: { channelId_messageId: { channelId: id, messageId: mid } } });
    } else {
      await prisma.pin.create({ data: { channelId: id, messageId: mid, pinnedById: req.user!.id } });
    }
    const ev = { t: 'pin' as const, channelId: id, messageId: mid, pinned: !existing };
    const ch = await prisma.channel.findUnique({ where: { id }, select: { serverId: true } });
    if (ch?.serverId) hub.sendToServer(ch.serverId, ev);
    else void broadcastToDm(id, ev);
    return { pinned: !existing };
  });

  app.post('/channels/:id/read', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannelAccess(id, req.user!.id);
    const body = req.body as { messageId?: string };
    const last = body.messageId && /^[0-9A-Z]{11}$/.test(body.messageId) ? body.messageId : null;
    await prisma.readState.upsert({
      where: { userId_channelId: { userId: req.user!.id, channelId: id } },
      create: { userId: req.user!.id, channelId: id, lastReadAt: new Date(), lastReadMessageId: last },
      update: { lastReadAt: new Date(), ...(last ? { lastReadMessageId: last } : {}) },
    });
    hub.send(req.user!.id, { t: 'unread_reset', channelId: id });
    return { ok: true };
  });

  app.get('/channels/:id/messages/:mid/context', { preHandler: [app.authenticate] }, async (req) => {
    const { id, mid } = req.params as { id: string; mid: string };
    await requireChannelAccess(id, req.user!.id);
    const before = await prisma.message.findMany({
      where: { channelId: id, id: { lte: mid } },
      orderBy: { id: 'desc' },
      take: 25,
      include: messageInclude,
    });
    const after = await prisma.message.findMany({
      where: { channelId: id, id: { gt: mid } },
      orderBy: { id: 'asc' },
      take: 25,
      include: messageInclude,
    });
    const items = [...before.reverse(), ...after].map((m) => toMessageDTO(m as MessageRecord, req.user!.id));
    return { items };
  });
}

export async function broadcastToDm(channelId: string, ev: Parameters<typeof hub.sendToUsers>[1]): Promise<void> {
  const rows = await prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } });
  hub.sendToUsers(rows.map((r) => r.userId), ev);
}
