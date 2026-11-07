import type { FastifyInstance } from 'fastify';
import { dmCreateSchema } from '@mg/shared';
import { prisma } from '../../lib/db';
import { nextId } from '../../lib/snowflake';
import { badRequest, notFound } from '../../plugins/errors';
import { toChannelDTO, toUserDTO } from '../serialize';
import { hub } from '../../ws/hub';

export function dmRoutes(app: FastifyInstance): void {
  app.get('/dms', { preHandler: [app.authenticate] }, async (req) => {
    const memberships = await prisma.channelMember.findMany({
      where: { userId: req.user!.id, channel: { type: 'DM' } },
      include: { channel: { include: { members: { include: { user: true } } } } },
    });
    const channels = memberships
      .map((m) => m.channel)
      .sort((a, b) => (b.lastMsgAt?.getTime() ?? 0) - (a.lastMsgAt?.getTime() ?? 0));
    return { items: channels.map((c) => toChannelDTO(c, req.user!.id)) };
  });

  app.post('/dms', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = dmCreateSchema.parse(req.body);
    if (body.userId === req.user!.id) throw badRequest('Cannot open a DM with yourself');
    const peer = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!peer) throw notFound('User not found');

    // find an existing DM between the two
    const mine = await prisma.channelMember.findMany({
      where: { userId: req.user!.id, channel: { type: 'DM' } },
      select: { channelId: true },
    });
    const theirs = await prisma.channelMember.findMany({
      where: { userId: body.userId, channelId: { in: mine.map((m) => m.channelId) } },
      select: { channelId: true },
    });
    if (theirs.length > 0 && theirs[0]) {
      const channel = await prisma.channel.findUnique({
        where: { id: theirs[0].channelId },
        include: { members: { include: { user: true } } },
      });
      if (channel) {
        hub.addDmPair(req.user!.id, body.userId);
        return { channel: toChannelDTO(channel, req.user!.id) };
      }
    }

    const channel = await prisma.channel.create({
      data: {
        id: nextId(),
        name: 'dm',
        type: 'DM',
        members: { create: [{ userId: req.user!.id }, { userId: body.userId }] },
      },
      include: { members: { include: { user: true } } },
    });
    hub.addDmPair(req.user!.id, body.userId);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const initiatorDto = toChannelDTO(channel, body.userId); // peer = me
    const peerDto = toChannelDTO(channel, req.user!.id); // peer = them
    hub.send(body.userId, { t: 'dm_new', channel: initiatorDto, user: toUserDTO(me) });
    hub.send(req.user!.id, { t: 'dm_new', channel: peerDto, user: toUserDTO(peer) });
    return reply.code(201).send({ channel: initiatorDto });
  });
}
