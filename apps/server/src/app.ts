import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { env } from './env';
import { logger } from './lib/logger';
import authPlugin from './plugins/auth';
import { registerErrorHandler } from './plugins/errors';
import { authRoutes } from './modules/auth/routes';
import { userRoutes } from './modules/users/routes';
import { serverRoutes } from './modules/servers/routes';
import { channelRoutes } from './modules/channels/routes';
import { dmRoutes } from './modules/dms/routes';
import { messageRoutes } from './modules/messages/routes';
import { uploadRoutes, startUploadSweeper } from './modules/uploads/routes';
import { voiceRoutes } from './modules/voice/routes';
import { radioRoutes } from './modules/radio/routes';
import { livekitWebhookRoutes } from './modules/livekit/webhook';
import { gatewayHandler, startWsHeartbeat } from './ws/gateway';
import { roomService } from './modules/livekit/clients';
import { voiceTracker } from './modules/voice/service';
import { storage } from './modules/uploads/storage';

const API_PREFIX = '/api';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
    disableRequestLogging: true,
  });

  registerErrorHandler(app);

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'wss://*.livekit.cloud', 'wss://livekit.cloud'],
        fontSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  });

  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  await app.register(compress, { encodings: ['br', 'gzip'], threshold: 512 });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many requests, slow down' }),
  });

  await app.register(authPlugin);

  // ---- health ----
  app.get('/healthz', async () => ({ ok: true, uptime: process.uptime() }));

  // ---- API routes ----
  app.register(
    async (api) => {
      authRoutes(api);
      userRoutes(api);
      serverRoutes(api);
      channelRoutes(api);
      dmRoutes(api);
      messageRoutes(api);
      uploadRoutes(api);
      voiceRoutes(api);
      radioRoutes(api);
      livekitWebhookRoutes(api);
    },
    { prefix: API_PREFIX },
  );

  // ---- WebSocket gateway ----
  app.get('/ws', { websocket: true }, (socket) => {
    void gatewayHandler(socket);
  });

  // ---- SPA static files ----
  // from apps/server/dist: ../.. = apps/ → apps/web/dist
  const webDist = join(__dirname, '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders(res, pathname) {
        if (pathname.startsWith('/assets/')) {
          res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('cache-control', 'public, max-age=0, must-revalidate');
        }
      },
    });
    const indexHtml = await readFile(join(webDist, 'index.html'), 'utf8').catch(() => null);
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && req.url !== '/ws' && indexHtml) {
        void reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-cache').send(indexHtml);
        return;
      }
      void reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
    });
    logger.info({ webDist }, 'serving SPA');
  } else {
    logger.info('web dist not found — API only mode (dev: use vite dev server)');
  }

  return app;
}

/** 30s reconciliation sweep: LiveKit is the source of truth for voice presence. */
export function startVoiceReconciler(): NodeJS.Timeout {
  const t = setInterval(
    () => {
      void (async () => {
        try {
          const rooms = await roomService.listRooms();
          const voiceRooms = rooms.filter((r) => r.name.startsWith('voice:'));
          const states: { name: string; participants: { identity: string; name?: string; metadata?: string }[] }[] = [];
          for (const room of voiceRooms.slice(0, 50)) {
            const participants = await roomService.listParticipants(room.name).catch(() => []);
            states.push({
              name: room.name,
              participants: participants.map((p) => ({ identity: p.identity, name: p.name, metadata: p.metadata })),
            });
          }
          await voiceTracker.syncFromLivekit(states);
        } catch (err) {
          logger.debug({ err }, 'voice reconciler cycle failed');
        }
      })();
    },
    30_000,
  );
  t.unref();
  return t;
}

export { startUploadSweeper, startWsHeartbeat, storage };
