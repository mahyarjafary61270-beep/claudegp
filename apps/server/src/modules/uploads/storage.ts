import { mkdir, readFile, unlink, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '../../env';
import { logger } from '../../lib/logger';

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const KEY_RE = /^[\w][\w/.-]{0,200}$/;

export class LocalDiskStorage implements StorageAdapter {
  private base: string;

  constructor(baseDir = env.UPLOAD_DIR) {
    this.base = resolve(baseDir);
  }

  private path(key: string): string {
    if (!KEY_RE.test(key) || key.includes('..')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return join(this.base, key);
  }

  async init(): Promise<void> {
    await mkdir(this.base, { recursive: true });
    logger.info({ dir: this.base }, 'upload storage ready');
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch {
      /* already gone */
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
}

export const storage = new LocalDiskStorage();
