import type { FastifyInstance } from 'fastify';
import { radioStartSchema } from '@mg/shared';
import { getStation } from '@mg/shared';
import { badRequest, forbidden, notFound } from '../../plugins/errors';
import { requireChannelAccess } from '../servers/permissions';
import { voiceTracker } from '../voice/service';
import { radioManager, RadioLimitError } from './manager';
import { getNowPlaying } from './nowplaying';
import { prisma } from '../../lib/db';

export function radioRoutes(app: FastifyInstance): void {
  // /mp — start or switch the radio in the voice channel the caller is inside
  app.post(
    '/channels/:id/radio',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await requireChannelAccess(id, req.user!.id);
      const body = radioStartSchema.parse(req.body);
      const station = getStation(body.stationId);
      if (!station) throw badRequest('Unknown station');

      const channel = await prisma.channel.findUnique({ where: { id } });
      if (!channel || channel.type !== 'VOICE') throw badRequest('Radio can only play in a voice channel');

      const humans = voiceTracker.humansIn(id);
      const isActive = voiceTracker.membersOf(id).length > 0;
      if (!isActive || !humans.includes(req.user!.id)) {
        throw Object.assign(forbidden('Join the voice channel first, then run /mp'), { code: 'NOT_IN_VOICE' });
      }

      try {
        const state = await radioManager.start(id, body.stationId, req.user!.id);
        return reply.code(201).send({ radio: state });
      } catch (err) {
        if (err instanceof RadioLimitError) {
          throw Object.assign(forbidden(err.message), { code: 'RADIO_LIMIT' });
        }
        throw err;
      }
    },
  );

  // /stop — started-by, any listener in the channel, or an admin may stop it
  app.delete('/channels/:id/radio', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannelAccess(id, req.user!.id);
    const active = radioManager.get(id);
    if (!active) throw notFound('No radio playing here');

    const allowed =
      active.startedById === req.user!.id ||
      voiceTracker.humansIn(id).includes(req.user!.id) ||
      (await accessIsAdmin(id, req.user!.id));
    if (!allowed) throw forbidden('Only listeners or admins can stop the radio');

    await radioManager.stop(id, 'manual');
    return { ok: true };
  });

  // /np — now playing (cached; no network polling when nobody listens)
  app.get('/channels/:id/radio', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannelAccess(id, req.user!.id);
    const active = radioManager.get(id);
    if (!active) return { radio: null, nowPlaying: null };
    const station = getStation(active.stationId);
    const humans = voiceTracker.humansIn(id);
    const np = station ? await getNowPlaying(station, humans.length > 0) : null;
    return {
      radio: {
        channelId: active.channelId,
        stationId: active.stationId,
        mode: active.mode === 'INGRESS' ? 'ingress' : 'rtc',
        startedById: active.startedById,
        startedAt: new Date(active.startedAt).toISOString(),
        listeners: humans.length,
      },
      nowPlaying: np,
    };
  });

  app.get('/radios', { preHandler: [app.authenticate] }, async () => {
    // global snapshot of all active radios (for the /radios command card)
    return { items: radioManager.listAll() };
  });
}

async function accessIsAdmin(channelId: string, userId: string): Promise<boolean> {
  const access = await requireChannelAccess(channelId, userId).catch(() => null);
  return access?.member ? ['OWNER', 'ADMIN'].includes(access.member.role) : false;
}
