/* eslint-disable no-console */
/**
 * Seed script for local development: creates a registration invite code so the
 * first users can sign up when REGISTRATION_MODE=invite and INVITE_CODE is unset.
 * The default server ("Mahyar Gap") and channels are seeded automatically at
 * runtime when the first user registers (see modules/servers/bootstrap.ts).
 *
 * Usage: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`Users exist (${userCount}) — nothing to seed. Registration invites can be created in-app by admins.`);
    return;
  }

  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  await prisma.invite.create({
    data: {
      id: `seed${Date.now().toString(36)}`,
      code,
      serverId: null, // registration invite
      maxUses: 5,
    },
  });
  console.log('──────────────────────────────────────────────');
  console.log('  Development registration invite created:');
  console.log(`  Invite code: ${code}`);
  console.log('──────────────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
