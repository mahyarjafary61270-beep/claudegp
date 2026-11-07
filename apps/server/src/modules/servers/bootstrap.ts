import type { Server } from '@prisma/client';
import { prisma } from '../../lib/db';
import { nextId } from '../../lib/snowflake';
import { logger } from '../../lib/logger';

/**
 * First-run seeding: the default server "Mahyar Gap" with text channels
 * #general, #memes and voice channels Lounge, Gaming, Radio.
 * Created lazily when the first user registers (they become the owner).
 */
export async function getOrCreateDefaultServer(ownerId: string): Promise<Server | null> {
  const existing = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) return existing;

  const server = await prisma.server.create({
    data: {
      id: nextId(),
      name: 'Mahyar Gap',
      ownerId,
      iconColor: '#ff4d8d',
      channels: {
        create: [
          { id: nextId(), name: 'general', type: 'TEXT', position: 0 },
          { id: nextId(), name: 'memes', type: 'TEXT', position: 1 },
          { id: nextId(), name: 'Lounge', type: 'VOICE', position: 0 },
          { id: nextId(), name: 'Gaming', type: 'VOICE', position: 1 },
          { id: nextId(), name: 'Radio', type: 'VOICE', position: 2 },
        ],
      },
    },
    include: { channels: true },
  });
  logger.info({ serverId: server.id }, 'seeded default server');
  return server;
}
