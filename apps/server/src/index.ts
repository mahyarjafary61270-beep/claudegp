import { buildApp, startVoiceReconciler, startUploadSweeper, startWsHeartbeat } from './app';
import { env } from './env';
import { logger } from './lib/logger';
import { storage } from './modules/uploads/storage';
import { prisma, disconnectDb } from './lib/db';
import { hub } from './ws/hub';
import { radioManager } from './modules/radio/manager';
import { startPresenceSweep } from './ws/presence';

async function main(): Promise<void> {
  await storage.init();

  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    const forceTimer = setTimeout(() => process.exit(1), 10_000);
    forceTimer.unref();
    try {
      await radioManager.stopAll();
      await app.close();
      await disconnectDb();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    process.exit(1);
  }

  // rebuild audience indexes for presence fan-out
  void (async () => {
    try {
      const [members, dmPairs] = await Promise.all([
        prisma.member.findMany({ select: { serverId: true, userId: true } }),
        prisma.channelMember.findMany({
          where: { channel: { type: 'DM' } },
          select: { channelId: true, userId: true },
        }),
      ]);
      const pairMap = new Map<string, string[]>();
      for (const p of dmPairs) {
        const arr = pairMap.get(p.channelId) ?? [];
        arr.push(p.userId);
        pairMap.set(p.channelId, arr);
      }
      const pairs = [...pairMap.values()].filter((a) => a.length === 2).map(([a, b]) => ({ a: a as string, b: b as string }));
      hub.rebuildIndexes({ serverMembers: members, dmPairs: pairs });
      logger.info({ servers: hub.serverMembers.size, users: members.length }, 'hub indexes rebuilt');
    } catch (err) {
      logger.error({ err }, 'failed to rebuild hub indexes');
    }
  })();

  // background jobs
  startWsHeartbeat();
  startPresenceSweep();
  startVoiceReconciler();
  startUploadSweeper();
  void radioManager.cleanupAtBoot();
}

void main();
