import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_PUBLIC_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  LIVEKIT_URL: z.string().min(1, 'LIVEKIT_URL is required (wss://...)'),
  LIVEKIT_API_KEY: z.string().min(1, 'LIVEKIT_API_KEY is required'),
  LIVEKIT_API_SECRET: z.string().min(1, 'LIVEKIT_API_SECRET is required'),
  REGISTRATION_MODE: z.enum(['invite', 'open']).default('invite'),
  INVITE_CODE: z.string().optional(),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  MAX_CONCURRENT_RADIOS: z.coerce.number().int().min(1).max(20).default(2),
  RADIO_MODE: z.enum(['auto', 'ingress', 'rtc']).default('auto'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ✗ ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration:\n${lines.join('\n')}\n\nSee .env.example for all required variables.`);
  }
  return result.data;
}

export const env: Env = loadEnv();
