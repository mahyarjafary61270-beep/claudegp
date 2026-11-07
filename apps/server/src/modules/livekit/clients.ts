import { AccessToken, IngressClient, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../../env';

/** LiveKit host in http(s) form for server-side API clients */
function httpHost(): string {
  return env.LIVEKIT_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export const roomService = new RoomServiceClient(httpHost(), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
export const ingressClient = new IngressClient(httpHost(), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
export const webhookReceiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

export function createVoiceToken(opts: {
  identity: string;
  name: string;
  room: string;
  metadata?: string;
  ttlSeconds?: number;
}): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.name,
    ttl: opts.ttlSeconds ?? 3600 * 4,
    metadata: opts.metadata,
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}

export function createRadioToken(opts: { identity: string; name: string; room: string; metadata: string }): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.name,
    ttl: 3600 * 12,
    metadata: opts.metadata,
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });
  return at.toJwt();
}
