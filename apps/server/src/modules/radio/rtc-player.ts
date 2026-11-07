import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { env } from '../../env';
import { logger } from '../../lib/logger';
import ffmpegPath from 'ffmpeg-static';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const FRAME_MS = 20;
const SAMPLES_PER_FRAME = (SAMPLE_RATE / 1000) * FRAME_MS; // 960
const FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * 2; // s16le stereo
const MAX_RETRIES = 5;
const MAX_BUFFER = 4 * 1024 * 1024;

export interface RtcPlayerHandle {
  stop(): Promise<void>;
}

export interface RtcPlayerOptions {
  url: string;
  room: string;
  identity: string;
  name: string;
  metadata: string;
  token: string;
  onFatal: (err: Error) => void;
}

/**
 * Headless radio participant: ffmpeg decodes the station stream to 48 kHz
 * s16le PCM on stdout; we push 20 ms frames into an rtc-node AudioSource and
 * publish it as a LocalAudioTrack. `captureFrame` awaits when the internal
 * queue is full, which paces playback to realtime. Auto-reconnects with
 * exponential backoff. Name/metadata are embedded in the join token.
 */
export async function startRtcPlayer(opts: RtcPlayerOptions): Promise<RtcPlayerHandle> {
  let stopped = false;
  let ffmpeg: ChildProcess | null = null;

  const rtc = await import('@livekit/rtc-node');
  const room = new rtc.Room();
  const source = new rtc.AudioSource(SAMPLE_RATE, CHANNELS);
  const track = rtc.LocalAudioTrack.createAudioTrack('radio-stream', source);

  await room.connect(env.LIVEKIT_URL, opts.token, { autoSubscribe: false, dynacast: false });
  const local = room.localParticipant;
  if (!local) throw new Error('rtc-node: no local participant after connect');
  await local.publishTrack(track, new rtc.TrackPublishOptions({}));

  logger.info({ room: opts.room, identity: opts.identity }, 'rtc radio connected');

  let framesPushed = 0;
  let retries = 0;

  async function pushFrames(buf: Buffer): Promise<{ rest: Buffer; pushed: number }> {
    let rest = buf;
    let pushed = 0;
    while (rest.length >= FRAME_BYTES && !stopped) {
      const frameBuf = Buffer.from(rest.subarray(0, FRAME_BYTES));
      rest = rest.subarray(FRAME_BYTES);
      const samples = new Int16Array(frameBuf.buffer, frameBuf.byteOffset, SAMPLES_PER_FRAME * CHANNELS);
      await source.captureFrame(new rtc.AudioFrame(samples, SAMPLE_RATE, CHANNELS, SAMPLES_PER_FRAME));
      framesPushed++;
      pushed++;
    }
    return { rest, pushed };
  }

  function scheduleRetry(): void {
    retries += 1;
    if (retries >= MAX_RETRIES) {
      opts.onFatal(new Error(`stream failed ${MAX_RETRIES} consecutive times`));
      return;
    }
    const delay = Math.min(1000 * 2 ** retries, 30_000);
    logger.warn({ retries, delayMs: delay }, 'radio stream retry scheduled');
    setTimeout(() => spawnFfmpeg(), delay).unref();
  }

  function spawnFfmpeg(): void {
    if (stopped) return;
    const bin = ffmpegPath || 'ffmpeg';
    ffmpeg = spawn(
      bin,
      [
        '-loglevel', 'error',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '10',
        '-i', opts.url,
        '-map', '0:a:0',
        '-ac', String(CHANNELS),
        '-ar', String(SAMPLE_RATE),
        '-f', 's16le',
        '-thread_queue_size', '1024',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let acc: Buffer = Buffer.alloc(0);
    let draining = false;

    ffmpeg.stdout!.on('data', (chunk: Buffer) => {
      if (stopped || draining) return;
      acc = Buffer.concat([acc, chunk]);
      if (acc.length > MAX_BUFFER) acc = Buffer.from(acc.subarray(acc.length - FRAME_BYTES));
      draining = true;
      void pushFrames(acc)
        .then(({ rest }) => {
          acc = Buffer.from(rest);
        })
        .catch((err) => logger.error({ err }, 'audio frame push failed'))
        .finally(() => {
          draining = false;
        });
    });

    ffmpeg.stderr!.on('data', (d: Buffer) => {
      logger.debug({ radio: opts.identity, stderr: d.toString().slice(0, 300) }, 'ffmpeg');
    });

    ffmpeg.on('error', (err) => {
      logger.error({ err }, 'ffmpeg spawn failed');
      if (!stopped) scheduleRetry();
    });

    ffmpeg.on('exit', (code, signal) => {
      if (stopped || signal === 'SIGKILL') return;
      logger.warn({ code, signal }, 'ffmpeg exited');
      if (!stopped) scheduleRetry();
    });
  }

  spawnFfmpeg();

  return {
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      try {
        ffmpeg?.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      try {
        await track.close(true);
      } catch {
        /* ignore */
      }
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
      logger.info({ room: opts.room }, 'rtc radio stopped');
    },
  };
}
