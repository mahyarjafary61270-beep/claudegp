import type { FastifyInstance } from 'fastify';
import { TrackSource } from 'livekit-server-sdk';
import { webhookReceiver } from './clients';
import { voiceTracker } from '../voice/service';
import { logger } from '../../lib/logger';
import { unauthorized } from '../../plugins/errors';
import { env } from '../../env';

/**
 * LiveKit Cloud webhook receiver.
 * Set the webhook URL in the LiveKit dashboard to:
 *   https://<your-app>.up.railway.app/api/livekit/webhook
 */
export function livekitWebhookRoutes(app: FastifyInstance): void {
  app.post('/livekit/webhook', { config: { rateLimit: { max: 3000, timeWindow: '1 minute' } } }, async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !env.LIVEKIT_URL) throw unauthorized('Missing webhook signature');
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    try {
      const event = await webhookReceiver.receive(body, authHeader);
      const roomName = event.room?.name ?? '';
      const channelId = voiceTracker.channelIdFromRoom(roomName);
      const identity = event.participant?.identity;

      switch (event.event) {
        case 'participant_joined': {
          if (channelId && identity) {
            await voiceTracker.onJoined(channelId, {
              identity,
              name: event.participant?.name ?? '',
              metadata: event.participant?.metadata,
            });
          }
          break;
        }
        case 'participant_left': {
          if (channelId && identity) await voiceTracker.onLeft(channelId, identity);
          break;
        }
        case 'room_finished': {
          if (channelId) await voiceTracker.onRoomFinished(channelId);
          break;
        }
        case 'track_published': {
          if (channelId && identity && event.track?.source === TrackSource.SCREEN_SHARE) {
            voiceTracker.setStreaming(channelId, identity, true);
          }
          break;
        }
        case 'track_unpublished': {
          if (channelId && identity && event.track?.source === TrackSource.SCREEN_SHARE) {
            voiceTracker.setStreaming(channelId, identity, false);
          }
          break;
        }
        default:
          break;
      }
      return reply.code(204).send();
    } catch (err) {
      logger.warn({ err }, 'livekit webhook rejected');
      throw unauthorized('Invalid webhook signature');
    }
  });
}
