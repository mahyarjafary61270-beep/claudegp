import type {
  AttachmentDTO,
  ChannelDTO,
  InviteDTO,
  MemberDTO,
  MessageDTO,
  UserDTO,
} from '@mg/shared';
import type {
  Attachment,
  Channel,
  Invite,
  Member,
  Message,
  MessageReaction,
  Prisma,
  User,
} from '@prisma/client';

type UserRecord = Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'accentColor' | 'statusText' | 'isGlobalAdmin' | 'createdAt'>;

export function toUserDTO(u: UserRecord): UserDTO {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    statusText: u.statusText,
    accentColor: u.accentColor,
    isGlobalAdmin: u.isGlobalAdmin,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toMemberDTO(m: Member & { user: UserRecord }): MemberDTO {
  return {
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    user: toUserDTO(m.user),
  };
}

type ChannelRecord = Prisma.ChannelGetPayload<{ include: { members: { include: { user: true } } } }>;

export function toChannelDTO(c: ChannelRecord, viewerId: string): ChannelDTO {
  if (c.type === 'DM') {
    const peer = c.members.find((m) => m.userId !== viewerId)?.user;
    return {
      id: c.id,
      serverId: null,
      name: peer ? peer.displayName : 'DM',
      type: 'DM',
      topic: null,
      position: 0,
      createdAt: c.createdAt.toISOString(),
      peer: peer
        ? {
            id: peer.id,
            username: peer.username,
            displayName: peer.displayName,
            avatarUrl: peer.avatarUrl,
            accentColor: peer.accentColor,
            statusText: peer.statusText,
          }
        : null,
    };
  }
  return {
    id: c.id,
    serverId: c.serverId,
    name: c.name,
    type: c.type,
    topic: c.topic,
    position: c.position,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toChannelDTOPlain(c: Pick<Channel, 'id' | 'serverId' | 'name' | 'type' | 'topic' | 'position' | 'createdAt'>): ChannelDTO {
  return {
    id: c.id,
    serverId: c.serverId,
    name: c.name,
    type: c.type,
    topic: c.topic,
    position: c.position,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toAttachmentDTO(a: Attachment): AttachmentDTO {
  return {
    id: a.id,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    name: a.name,
    url: `/api/files/${a.id}`,
  };
}

export type MessageRecord = Prisma.MessageGetPayload<{
  include: {
    author: true;
    attachments: true;
    reactions: true;
    mentions: true;
    pins: true;
    replyTo: { include: { author: true } };
  };
}>;

export function toMessageDTO(m: MessageRecord, viewerId: string): MessageDTO {
  const grouped = new Map<string, { emoji: string; count: number; me: boolean }>();
  for (const r of m.reactions as (MessageReaction & { userId: string })[]) {
    const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, me: false };
    g.count += 1;
    if (r.userId === viewerId) g.me = true;
    grouped.set(r.emoji, g);
  }
  const authorPublic = m.author
    ? {
        id: m.author.id,
        username: m.author.username,
        displayName: m.author.displayName,
        avatarUrl: m.author.avatarUrl,
        accentColor: m.author.accentColor,
      }
    : null;
  return {
    id: m.id,
    channelId: m.channelId,
    kind: m.kind === 'SYSTEM' ? 'system' : 'text',
    content: m.content,
    author: authorPublic,
    attachments: m.attachments.map(toAttachmentDTO),
    reactions: [...grouped.values()],
    mentions: m.mentions.map((x) => x.userId),
    replyTo:
      m.replyTo && m.replyToId
        ? {
            id: m.replyTo.id,
            content: m.replyTo.content.slice(0, 140),
            author: m.replyTo.author
              ? {
                  id: m.replyTo.author.id,
                  displayName: m.replyTo.author.displayName,
                  avatarUrl: m.replyTo.author.avatarUrl,
                  accentColor: m.replyTo.author.accentColor,
                }
              : null,
          }
        : null,
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    pinned: m.pins.length > 0,
  };
}

export function toInviteDTO(i: Invite): InviteDTO {
  return {
    id: i.id,
    code: i.code,
    serverId: i.serverId,
    uses: i.uses,
    maxUses: i.maxUses,
    expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
  };
}
