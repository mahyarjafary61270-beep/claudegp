import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }],
});

prisma.$on('warn' as never, (e: unknown) => logger.warn({ db: e }, 'prisma warning'));
prisma.$on('error' as never, (e: unknown) => logger.error({ db: e }, 'prisma error'));

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
