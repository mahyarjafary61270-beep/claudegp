import type { Channel, Member, Server } from '@prisma/client';
import type { PermissionAction } from '@mg/shared';
import { roleCan } from '@mg/shared';
import { prisma } from '../../lib/db';
import { forbidden, notFound } from '../../plugins/errors';
import { hub } from '../../ws/hub';

export async function getMembership(serverId: string, userId: string): Promise<(Member & { server: Server }) | null> {
  return prisma.member.findUnique({
    where: { serverId_userId: { serverId, userId } },
    include: { server: true },
  });
}

export async function requireMembership(serverId: string, userId: string): Promise<Member & { server: Server }> {
  const m = await getMembership(serverId, userId);
  if (!m) throw forbidden('You are not a member of this server');
  return m;
}

export async function requirePermission(serverId: string, userId: string, action: PermissionAction): Promise<Member & { server: Server }> {
  const m = await requireMembership(serverId, userId);
  if (!roleCan(m.role, action)) throw forbidden(`Missing permission: ${action}`);
  return m;
}

export interface ChannelAccess {
  channel: Channel;
  member: (Member & { server: Server }) | null;
  /** userIds allowed to see this channel */
  audience: string[];
}

export async function getChannelAccess(channelId: string, userId: string): Promise<ChannelAccess | null> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;
  if (channel.type === 'DM') {
    const others = await prisma.channelMember.findMany({ where: { channelId: channel.id } });
    if (!others.some((m) => m.userId === userId)) return null;
    return { channel, member: null, audience: others.map((m) => m.userId) };
  }
  if (!channel.serverId) return null;
  const member = await requireMembership(channel.serverId, userId);
  const members = hub.serverMembers.get(channel.serverId);
  return { channel, member, audience: members ? [...members] : [] };
}

export async function requireChannelAccess(channelId: string, userId: string): Promise<ChannelAccess> {
  const access = await getChannelAccess(channelId, userId);
  if (!access) throw forbidden('No access to this channel');
  return access;
}
