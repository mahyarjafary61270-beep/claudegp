import type { FastifyInstance } from 'fastify';
import { TrackSource, TrackType } from 'livekit-server-sdk';
import { forbidden, notFound } from '../../plugins/errors';
import { requireChannelAccess } from '../servers/permissions';
import { voiceTracker } from './service';
import { createVoiceToken, roomService } from '../livekit/clients';
import { toUserDTO } from '../serialize';
import { prisma } from '../../lib/db';

export function voiceRoutes(app: FastifyInstance): void {
  // Short-lived join token; only issued for voice channels the user can access.
  app.post(
    '/voice/token',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const body = req.body as { channelId?: string };
      const channelId = typeof body.channelId === 'string' ? body.channelId : '';
      const access = await requireChannelAccess(channelId, req.user!.id);
      if (access.channel.type !== 'VOICE' || !access.channel.serverId) throw forbidden('Not a voice channel');
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw notFound('User not found');
      const identity = user.id;
      const token = await createVoiceToken({
        identity,
        name: user.displayName,
        room: voiceTracker.roomName(channelId),
        metadata: JSON.stringify({ displayName: user.displayName, avatarUrl: user.avatarUrl, accentColor: user.accentColor }),
      });
      return {
        token,
        url: process.env.LIVEKIT_URL!,
        room: voiceTracker.roomName(channelId),
        identity,
      };
    },
  );

  // current members (initial state before ws sync)
  app.get('/voice/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannelAccess(id, req.user!.id);
    return { members: voiceTracker.membersOf(id) };
  });

  // admin: server-mute a participant
  app.post('/voice/:id/mute', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const access = await requireChannelAccess(id, req.user!.id);
    if (!access.member || !['OWNER', 'ADMIN'].includes(access.member.role)) throw forbidden('Admin only');
    const body = req.body as { userId?: string };
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId || userId === req.user!.id) throw forbidden('Invalid target');
    const room = voiceTracker.roomName(id);
    const participants = await roomService.listParticipants(room);
    const target = participants.find((p) => p.identity === userId);
    if (!target) throw notFound('Participant not in voice');
    const micTrack = target.tracks.find((t) => t.source === TrackSource.MICROPHONE || t.type === TrackType.AUDIO);
    if (micTrack?.sid) {
      await roomService.mutePublishedTrack(room, userId, micTrack.sid, true);
    } else {
      // no mic track published — block future publishing instead
      await roomService.updateParticipant(room, userId, undefined, {
        canPublish: false,
        canPublishData: false,
        canSubscribe: true,
        canPublishSources: [],
        hidden: false,
        recorder: false,
      } as never);
    }
    await voiceTracker.applyFlags(userId, { muted: true });
    return { ok: true };
  });

  // admin: kick from voice
  app.post('/voice/:id/kick', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const access = await requireChannelAccess(id, req.user!.id);
    if (!access.member || !['OWNER', 'ADMIN'].includes(access.member.role)) throw forbidden('Admin only');
    const body = req.body as { userId?: string };
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId) throw forbidden('Invalid target');
    await roomService.removeParticipant(voiceTracker.roomName(id), userId);
    return { ok: true };
  });

  app.get('/servers/:id/voice', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const channels = await prisma.channel.findMany({ where: { serverId: id, type: 'VOICE' } });
    return {
      rooms: channels.map((c) => ({ channelId: c.id, members: voiceTracker.membersOf(c.id) })),
    };
  });

  // profile metadata used in participant list previews
  app.get('/users/profile-batch', { preHandler: [app.authenticate] }, async (req) => {
    const ids = ((req.query as { ids?: string }).ids ?? '')
      .split(',')
      .filter(Boolean)
      .slice(0, 50);
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } } }) : [];
    return { items: users.map(toUserDTO) };
  });
}
