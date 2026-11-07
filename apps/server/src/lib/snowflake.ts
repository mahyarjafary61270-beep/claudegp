/**
 * Snowflake-style sortable IDs: 42 bits timestamp(ms) | 10 bits worker | 12 bits seq.
 * Encoded as Crockford-style base32 (11 chars), lexicographically ordered by time.
 */
const EPOCH = 1704067200000; // 2024-01-01T00:00:00Z
const WORKER_BITS = 10;
const SEQ_BITS = 12;
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let workerId = BigInt(process.pid % 1024) & 0x3ffn;
let seq = 0;
let lastMs = 0;

export function setWorkerId(id: number): void {
  workerId = BigInt(id % 1024) & 0x3ffn;
}

export function nextId(): string {
  let ms = Date.now();
  if (ms === lastMs) {
    seq = (seq + 1) & 0xfff;
    if (seq === 0) {
      do {
        ms = Date.now();
      } while (ms === lastMs);
    }
  } else {
    seq = 0;
  }
  lastMs = ms;

  const value = ((BigInt(ms - EPOCH) & 0x1ffffffffffn) << BigInt(WORKER_BITS + SEQ_BITS)) | (workerId << BigInt(SEQ_BITS)) | BigInt(seq);
  return encodeBase32(value);
}

function encodeBase32(v: bigint): string {
  let out = '';
  for (let i = 10; i >= 0; i--) {
    out += B32[Number((v >> BigInt(i * 5)) & 0x1fn)];
  }
  return out;
}

const B32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B32.length; i++) B32_LOOKUP[B32[i]!] = i;

/** Decode a snowflake id back to its creation timestamp (ms). */
export function idToTimestamp(id: string): number {
  let v = 0n;
  for (const ch of id.toUpperCase()) {
    const d = B32_LOOKUP[ch];
    if (d === undefined) return 0;
    v = (v << 5n) | BigInt(d);
  }
  return Number(v >> BigInt(WORKER_BITS + SEQ_BITS)) + EPOCH;
}

export function randomId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => B32[b & 31]).join('');
}
