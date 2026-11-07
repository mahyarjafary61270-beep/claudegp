import type { NowPlayingDTO } from '@mg/shared';
import { nowPlayingUrl, type RadioStation } from '@mg/shared';
import { logger } from '../../lib/logger';

interface CacheEntry {
  at: number;
  data: NowPlayingDTO | null;
}

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, CacheEntry>();

interface AzuraCastResponse {
  listeners?: { current?: number };
  now_playing?: {
    song?: { text?: string; title?: string; artist?: string; art?: string };
    elapsed?: number;
  };
}

/**
 * Now-playing via AzuraCast public API, falling back to ICY in-stream metadata.
 * Fetched on demand (never polled when nobody listens); cached 15s per station.
 */
export async function getNowPlaying(station: RadioStation, allowNetwork = true): Promise<NowPlayingDTO | null> {
  const hit = cache.get(station.id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  if (!allowNetwork) return hit?.data ?? null;

  let data: NowPlayingDTO | null = null;
  try {
    data = await fromAzuraCast(station);
  } catch {
    try {
      data = await fromIcy(station);
    } catch {
      data = null;
    }
  }
  cache.set(station.id, { at: Date.now(), data });
  return data;
}

async function fromAzuraCast(station: RadioStation): Promise<NowPlayingDTO | null> {
  const res = await fetch(nowPlayingUrl(station.shortcode), { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`nowplaying api ${res.status}`);
  const json = (await res.json()) as AzuraCastResponse;
  const song = json.now_playing?.song;
  if (!song) return null;
  const title = song.title || song.text || '';
  const derivedArtist =
    song.artist ? song.artist : song.text && song.title ? song.text.replace(new RegExp(`${song.title}\\s*$`), '').replace(/ - $/, '') : null;
  const artist = derivedArtist ?? null;
  return {
    stationId: station.id,
    title,
    artist: artist || null,
    artworkUrl: song.art || null,
    listeners: typeof json.listeners?.current === 'number' ? json.listeners.current : null,
  };
}

/** Minimal ICY metadata reader: request with Icy-MetaData and parse the first StreamTitle. */
async function fromIcy(station: RadioStation): Promise<NowPlayingDTO | null> {
  const res = await fetch(station.url, {
    headers: { 'Icy-MetaData': '1', 'User-Agent': 'MahyarGap/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok || !res.body) throw new Error('icy fetch failed');
  const metaInt = Number(res.headers.get('icy-metaint') ?? '0');
  const icyName = res.headers.get('icy-name');

  let title: string | null = null;
  if (metaInt > 0) {
    title = await readIcyTitle(res.body, metaInt);
  }
  if (!title && icyName) {
    return { stationId: station.id, title: icyName, artist: null, artworkUrl: null, listeners: null };
  }
  if (!title) throw new Error('no icy title found');

  const [artistPart, ...rest] = title.split(' - ');
  return {
    stationId: station.id,
    title: rest.join(' - ') || title,
    artist: rest.length > 0 ? artistPart ?? null : null,
    artworkUrl: null,
    listeners: null,
  };
}

async function readIcyTitle(body: ReadableStream<Uint8Array>, metaInt: number): Promise<string | null> {
  const reader = body.getReader();
  let consumedAudio = 0;
  let inMeta = false;
  let metaLen = 0;
  let metaBuf: number[] = [];
  let totalRead = 0;
  try {
    while (totalRead < 4 * 1024 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      totalRead += value.byteLength;
      let chunk = value;
      while (chunk.length > 0) {
        if (!inMeta) {
          const need = metaInt - consumedAudio;
          if (chunk.length < need) {
            consumedAudio += chunk.length;
            chunk = new Uint8Array(0);
          } else {
            chunk = chunk.subarray(need);
            consumedAudio = 0;
            inMeta = true;
            metaLen = 0;
            metaBuf = [];
          }
        } else if (metaLen === 0) {
          metaLen = chunk[0]! * 16;
          chunk = chunk.subarray(1);
          if (metaLen === 0) {
            inMeta = false; // empty meta block, back to audio
          }
        } else {
          const take = Math.min(metaLen - metaBuf.length, chunk.length);
          metaBuf.push(...chunk.subarray(0, take));
          chunk = chunk.subarray(take);
          if (metaBuf.length >= metaLen) {
            const meta = new TextDecoder().decode(Uint8Array.from(metaBuf)).replace(/\0+$/, '');
            const m = /StreamTitle='([^']*)'/.exec(meta);
            return m ? m[1]! : null;
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return null;
}

export function invalidateNowPlaying(stationId: string): void {
  cache.delete(stationId);
}

export function logNowPlayingDebug(): void {
  logger.debug({ cacheSize: cache.size }, 'nowplaying cache');
}
