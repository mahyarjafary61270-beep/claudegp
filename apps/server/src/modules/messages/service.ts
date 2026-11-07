import type { Prisma } from '@prisma/client';
import { extractMentions } from '@mg/shared';
import { prisma } from '../../lib/db';
import { nextId } from '../../lib/snowflake';
import { forbidden, notFound } from '../../plugins/errors';
import { hub } from '../../ws/hub';
import { toMessageDTO, type MessageRecord } from '../serialize';

export const messageInclude = {
  author: true,
  attachments: true,
  reactions: true,
  mentions: true,
  pins: true,
  replyTo: { include: { author: true } },
} satisfies Prisma.MessageInclude;

export function broadcastMessage(m: MessageRecord): void {
  // audience resolution: server channels broadcast to server members, DMs to participants
  void prisma.channel
    .findUnique({ where: { id: m.channelId }, select: { serverId: true, type: true } })
    .then((ch) => {
      if (!ch) return;
      const dto = toMessageDTO(m, m.authorId ?? '');
      if (ch.serverId) {
        hub.sendToServer(ch.serverId, { t: 'message_new', message: dto });
      } else {
        void prisma.channelMember
          .findMany({ where: { channelId: m.channelId }, select: { userId: true } })
          .then((rows) => hub.sendToUsers(rows.map((r) => r.userId), { t: 'message_new', message: dto }));
      }
    })
    .catch(() => undefined);
}

export interface CreateMessageInput {
  channelId: string;
  authorId: string;
  content: string;
  attachmentIds: string[];
  replyToId: string | null;
}

export async function createMessage(input: CreateMessageInput): Promise<MessageRecord> {
  // validate attachments belong to this uploader and are unclaimed
  let attachments: { id: string }[] = [];
  if (input.attachmentIds.length > 0) {
    const rows = await prisma.attachment.findMany({ where: { id: { in: input.attachmentIds } } });
    if (rows.length !== input.attachmentIds.length || rows.some((a) => a.uploaderId !== input.authorId || a.messageId)) {
      throw forbidden('Invalid attachments');
    }
    attachments = rows.map((a) => ({ id: a.id }));
  }

  // mentions: resolve usernames in content
  const usernames = extractMentions(input.content);
  let mentionRows: { userId: string; messageId: string }[] = [];
  if (usernames.length > 0) {
    const users = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true } });
    mentionRows = users.map((u) => ({ userId: u.id, messageId: '' }));
  }

  if (input.replyToId) {
    const parent = await prisma.message.findFirst({ where: { id: input.replyToId, channelId: input.channelId }, select: { id: true } });
    if (!parent) throw notFound('Reply target not found');
  }

  const id = nextId();
  const message = await prisma.message.create({
    data: {
      id,
      channelId: input.channelId,
      authorId: input.authorId,
      content: input.content,
      replyToId: input.replyToId ?? null,
      mentions: { create: mentionRows.map((m) => ({ userId: m.userId })) },
      attachments: { connect: attachments },
    },
    include: messageInclude,
  });

  await prisma.channel.update({ where: { id: input.channelId }, data: { lastMsgAt: message.createdAt } });
  return message;
}

export async function getMessageOr404(channelId: string, messageId: string): Promise<MessageRecord> {
  const m = await prisma.message.findFirst({ where: { id: messageId, channelId }, include: messageInclude });
  if (!m) throw notFound('Message not found');
  return m;
}

export async function createSystemMessage(channelId: string, content: string): Promise<void> {
  try {
    const m = await prisma.message.create({
      data: { id: nextId(), channelId, kind: 'SYSTEM', content },
      include: messageInclude,
    });
    await prisma.channel.update({ where: { id: channelId }, data: { lastMsgAt: m.createdAt } }).catch(() => undefined);
    broadcastMessage(m);
  } catch {
    /* channel may have been deleted concurrently */
  }
}
