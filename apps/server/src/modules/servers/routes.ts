import type { FastifyInstance } from 'fastify';
import { banSchema, inviteCreateSchema, roleUpdateSchema, serverUpdateSchema } from '@mg/shared';
import { prisma } from '../../lib/db';
import { nextId, randomId } from '../../lib/snowflake';
import { badRequest, forbidden, notFound } from '../../plugins/errors';
import { toInviteDTO, toMemberDTO, toUserDTO } from '../serialize';
import { hub } from '../../ws/hub';
import { canActOnRole, roleCan } from '@mg/shared';
import { requireMembership, requirePermission } from './permissions';
import { getPresence } from '../../ws/presence';

export function serverRoutes(app: FastifyInstance): void {
  app.get('/servers', { preHandler: [app.authenticate] }, async (req) => {
    const memberships = await prisma.member.findMany({
      where: { userId: req.user!.id },
      include: { server: true },
      orderBy: { joinedAt: 'asc' },
    });
    return { items: memberships.map((m) => ({ ...m.server, role: m.role })) };
  });

  app.get('/servers/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const member = await requireMembership(id, req.user!.id);
    const [channels, members] = await Promise.all([
      prisma.channel.findMany({ where: { serverId: id, type: { in: ['TEXT', 'VOICE'] } }, orderBy: [{ type: 'asc' }, { position: 'asc' }] }),
      prisma.member.findMany({ where: { serverId: id }, include: { user: true }, orderBy: { joinedAt: 'asc' } }),
    ]);
    return {
      server: { id: member.server.id, name: member.server.name, iconColor: member.server.iconColor, ownerId: member.server.ownerId, createdAt: member.server.createdAt.toISOString() },
      channels: channels.map((c) => ({
        id: c.id,
        serverId: c.serverId,
        name: c.name,
        type: c.type,
        topic: c.topic,
        position: c.position,
        createdAt: c.createdAt.toISOString(),
      })),
      members: members.map((m) => ({ ...toMemberDTO(m), presence: getPresence(m.userId) })),
    };
  });

  app.patch('/servers/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requirePermission(id, req.user!.id, 'manage_server');
    const body = serverUpdateSchema.parse(req.body);
    const server = await prisma.server.update({ where: { id }, data: { name: body.name } });
    hub.sendToServer(id, { t: 'server_update', serverId: id, name: server.name });
    return { ok: true };
  });

  app.delete('/servers/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const member = await requireMembership(id, req.user!.id);
    if (member.server.ownerId !== req.user!.id && !req.user!.isGlobalAdmin) throw forbidden('Only the owner can delete the server');
    const members = hub.serverMembers.get(id) ?? new Set<string>();
    await prisma.server.delete({ where: { id } });
    hub.sendToUsers(members, { t: 'server_update', serverId: id, name: '' });
    return { ok: true };
  });

  // ---- members ----

  app.patch('/servers/:id/members/:uid', { preHandler: [app.authenticate] }, async (req) => {
    const { id, uid } = req.params as { id: string; uid: string };
    const actor = await requirePermission(id, req.user!.id, 'manage_members');
    const target = await requireMembership(id, uid);
    if (!canActOnRole(actor.role, target.role)) throw forbidden('You cannot change this member\'s role');
    const body = roleUpdateSchema.parse(req.body);
    await prisma.member.update({ where: { serverId_userId: { serverId: id, userId: uid } }, data: { role: body.role } });
    hub.sendToServer(id, { t: 'member_update', serverId: id, userId: uid, role: body.role });
    return { ok: true };
  });

  app.delete('/servers/:id/members/:uid', { preHandler: [app.authenticate] }, async (req) => {
    const { id, uid } = req.params as { id: string; uid: string };
    const actor = await requirePermission(id, req.user!.id, 'manage_members');
    if (uid === req.user!.id) throw badRequest('Use leave instead');
    const target = await requireMembership(id, uid);
    if (!canActOnRole(actor.role, target.role)) throw forbidden('You cannot kick this member');
    await prisma.member.delete({ where: { serverId_userId: { serverId: id, userId: uid } } });
    hub.removeServerMembership(id, uid);
    hub.sendToServer(id, { t: 'member_left', serverId: id, userId: uid, kicked: true, banned: false });
    hub.send(uid, { t: 'force_logout', reason: 'kicked' });
    return { ok: true };
  });

  app.post('/servers/:id/leave', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const member = await requireMembership(id, req.user!.id);
    if (member.server.ownerId === req.user!.id) {
      const count = await prisma.member.count({ where: { serverId: id } });
      if (count > 1) throw forbidden('Transfer ownership before leaving');
      await prisma.server.delete({ where: { id } });
    } else {
      await prisma.member.delete({ where: { serverId_userId: { serverId: id, userId: req.user!.id } } });
    }
    hub.removeServerMembership(id, req.user!.id);
    hub.sendToServer(id, { t: 'member_left', serverId: id, userId: req.user!.id, kicked: false, banned: false });
    return { ok: true };
  });

  // ---- bans ----

  app.post('/servers/:id/bans/:uid', { preHandler: [app.authenticate] }, async (req) => {
    const { id, uid } = req.params as { id: string; uid: string };
    const actor = await requirePermission(id, req.user!.id, 'manage_members');
    if (uid === req.user!.id) throw badRequest('You cannot ban yourself');
    const target = await requireMembership(id, uid);
    if (!canActOnRole(actor.role, target.role)) throw forbidden('You cannot ban this member');
    const body = banSchema.parse(req.body ?? {});
    await prisma.$transaction([
      prisma.serverBan.upsert({
        where: { serverId_userId: { serverId: id, userId: uid } },
        create: { serverId: id, userId: uid, reason: body.reason ?? null, createdById: req.user!.id },
        update: { reason: body.reason ?? null },
      }),
      prisma.member.deleteMany({ where: { serverId: id, userId: uid } }),
    ]);
    hub.removeServerMembership(id, uid);
    hub.sendToServer(id, { t: 'member_left', serverId: id, userId: uid, kicked: false, banned: true });
    hub.send(uid, { t: 'force_logout', reason: 'banned' });
    return { ok: true };
  });

  app.delete('/servers/:id/bans/:uid', { preHandler: [app.authenticate] }, async (req) => {
    const { id, uid } = req.params as { id: string; uid: string };
    await requirePermission(id, req.user!.id, 'manage_members');
    await prisma.serverBan.deleteMany({ where: { serverId: id, userId: uid } });
    return { ok: true };
  });

  app.get('/servers/:id/bans', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requirePermission(id, req.user!.id, 'manage_members');
    const bans = await prisma.serverBan.findMany({ where: { serverId: id }, include: { user: true } });
    return { items: bans.map((b) => ({ userId: b.userId, reason: b.reason, createdAt: b.createdAt.toISOString(), user: toUserDTO(b.user) })) };
  });

  // ---- invites ----

  app.get('/servers/:id/invites', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    await requirePermission(id, req.user!.id, 'create_invite');
    const invites = await prisma.invite.findMany({ where: { serverId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { items: invites.map(toInviteDTO) };
  });

  app.post('/servers/:id/invites', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await requirePermission(id, req.user!.id, 'create_invite');
    const body = inviteCreateSchema.parse(req.body ?? {});
    const invite = await prisma.invite.create({
      data: {
        id: nextId(),
        code: randomId().slice(0, 12).toUpperCase(),
        serverId: id,
        createdById: req.user!.id,
        maxUses: body.maxUses ?? null,
        expiresAt: body.expiresInHours ? new Date(Date.now() + body.expiresInHours * 3600_000) : null,
      },
    });
    return reply.code(201).send(toInviteDTO(invite));
  });

  // join via invite
  app.post('/invites/:code/join', { preHandler: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const { code } = req.params as { code: string };
    const invite = await prisma.invite.findUnique({ where: { code } });
    if (!invite || !invite.serverId) throw notFound('Invite not found');
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) throw badRequest('Invite expired');
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) throw badRequest('Invite exhausted');
    const banned = await prisma.serverBan.findUnique({ where: { serverId_userId: { serverId: invite.serverId, userId: req.user!.id } } });
    if (banned) throw forbidden('You are banned from this server');
    const existing = await prisma.member.findUnique({ where: { serverId_userId: { serverId: invite.serverId, userId: req.user!.id } } });
    if (existing) return { serverId: invite.serverId, joined: false };
    await prisma.member.create({ data: { serverId: invite.serverId, userId: req.user!.id, role: 'MEMBER' } });
    await prisma.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
    hub.addServerMembership(invite.serverId, req.user!.id);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (user) hub.sendToServer(invite.serverId, { t: 'member_joined', serverId: invite.serverId, user: toUserDTO(user) });
    return { serverId: invite.serverId, joined: true };
  });

  // create registration invite (global admins only)
  app.post('/invites/registration', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.user!.isGlobalAdmin) throw forbidden('Only global admins can create registration invites');
    const body = inviteCreateSchema.parse(req.body ?? {});
    const invite = await prisma.invite.create({
      data: {
        id: nextId(),
        code: randomId().slice(0, 12).toUpperCase(),
        serverId: null,
        createdById: req.user!.id,
        maxUses: body.maxUses ?? 1,
        expiresAt: body.expiresInHours ? new Date(Date.now() + body.expiresInHours * 3600_000) : null,
      },
    });
    return reply.code(201).send(toInviteDTO(invite));
  });
}
