/** Tiny synthesized UI sounds — no audio assets needed. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, durationMs: number, type: OscillatorType, gain: number, delayMs = 0): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + delayMs / 1000;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.05);
}

export const sounds = {
  message(): void {
    blip(660, 120, 'sine', 0.05);
    blip(880, 100, 'sine', 0.04, 60);
  },
  mention(): void {
    blip(520, 140, 'triangle', 0.08);
    blip(780, 160, 'triangle', 0.07, 90);
  },
  join(): void {
    blip(440, 120, 'sine', 0.06);
    blip(660, 140, 'sine', 0.05, 80);
    blip(880, 160, 'sine', 0.04, 160);
  },
  leave(): void {
    blip(660, 120, 'sine', 0.05);
    blip(440, 160, 'sine', 0.05, 90);
  },
  radioStart(): void {
    blip(330, 180, 'square', 0.03);
    blip(494, 180, 'square', 0.03, 120);
  },
};
