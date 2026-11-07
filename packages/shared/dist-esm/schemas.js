import { z } from 'zod';
import { RADIO_STATIONS } from './radios';
export const usernameSchema = z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores');
export const passwordSchema = z.string().min(8).max(128);
export const registerSchema = z.object({
    username: usernameSchema,
    password: passwordSchema,
    displayName: z.string().min(1).max(48).optional(),
    inviteCode: z.string().trim().min(1).max(64).optional(),
});
export const loginSchema = z.object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
});
export const profileUpdateSchema = z
    .object({
    displayName: z.string().min(1).max(48).optional(),
    statusText: z.string().max(120).nullable().optional(),
    accentColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .optional(),
    locale: z.enum(['fa', 'en']).optional(),
})
    .strict();
export const channelCreateSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1)
        .max(32)
        .regex(/^[\w\u0600-\u06FF-]+$/u, 'Channel name: letters, numbers, dash and underscore only'),
    type: z.enum(['TEXT', 'VOICE']),
    topic: z.string().trim().max(200).optional(),
});
export const channelUpdateSchema = z
    .object({
    name: z
        .string()
        .trim()
        .min(1)
        .max(32)
        .regex(/^[\w\u0600-\u06FF-]+$/u)
        .optional(),
    topic: z.string().trim().max(200).nullable().optional(),
})
    .strict();
export const channelReorderSchema = z.object({
    channelIds: z.array(z.string().min(1).max(32)).min(1).max(100),
});
export const messageCreateSchema = z
    .object({
    content: z.string().max(4000).default(''),
    attachmentIds: z.array(z.string().min(1).max(32)).max(4).optional(),
    replyToId: z.string().min(1).max(32).nullable().optional(),
})
    .refine((v) => v.content.trim().length > 0 || (v.attachmentIds && v.attachmentIds.length > 0), {
    message: 'Message needs content or an attachment',
});
export const messageEditSchema = z.object({
    content: z.string().min(1).max(4000),
});
export const dmCreateSchema = z.object({ userId: z.string().min(1).max(32) });
export const radioStartSchema = z.object({
    stationId: z.enum(RADIO_STATIONS.map((s) => s.id)),
});
export const serverCreateSchema = z.object({
    name: z.string().trim().min(1).max(48),
});
export const serverUpdateSchema = z.object({ name: z.string().trim().min(1).max(48) }).strict();
export const inviteCreateSchema = z
    .object({
    maxUses: z.number().int().min(1).max(1000).nullable().optional(),
    expiresInHours: z.number().int().min(1).max(24 * 30).nullable().optional(),
    /** true => registration invite (null serverId) */
    registration: z.boolean().optional(),
})
    .strict();
export const roleUpdateSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER']) });
export const banSchema = z.object({ reason: z.string().max(200).optional() }).strict();
export const voiceTokenSchema = z.object({ channelId: z.string().min(1).max(32) });
export const voiceAdminSchema = z.object({ userId: z.string().min(1).max(32) });
export const searchSchema = z.object({
    q: z.string().trim().min(1).max(100),
    channelId: z.string().min(1).max(32).optional(),
});
