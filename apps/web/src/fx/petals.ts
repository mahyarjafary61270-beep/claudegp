/** Floating sakura petals + sparkles canvas. Capped at ~30 particles, paused when hidden. */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  sparkle: boolean;
  hue: number;
  alpha: number;
  phase: number;
}

const MAX = 30;
const COLORS = ['rgba(255,158,205,', 'rgba(255,77,141,', 'rgba(167,139,250,', 'rgba(34,211,238,'];

export function startPetals(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;

  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);
  let raf = 0;
  let running = true;

  const particles: Particle[] = [];
  for (let i = 0; i < MAX; i++) {
    particles.push(spawn(true));
  }

  function spawn(initial: boolean): Particle {
    const sparkle = Math.random() < 0.3;
    return {
      x: Math.random() * w,
      y: initial ? Math.random() * h : -20,
      vx: (Math.random() - 0.5) * 0.35,
      vy: 0.25 + Math.random() * 0.65,
      size: sparkle ? 1.2 + Math.random() * 1.8 : 4 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.02,
      sparkle,
      hue: Math.floor(Math.random() * COLORS.length),
      alpha: 0.25 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function onResize(): void {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', onResize);

  function onVisibility(): void {
    running = !document.hidden;
    if (running) raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', onVisibility);

  function drawParticle(p: Particle, time: number): void {
    const color = COLORS[p.hue] ?? 'rgba(255,255,255,';
    if (p.sparkle) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time / 700 + p.phase));
      ctx!.fillStyle = `${color}${(p.alpha * tw).toFixed(3)})`;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx!.fill();
    } else {
      // petal: soft ellipse
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot + Math.sin(time / 900 + p.phase) * 0.4);
      ctx!.fillStyle = `${color}${p.alpha.toFixed(3)})`;
      ctx!.beginPath();
      ctx!.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }
  }

  function frame(time: number): void {
    if (!running) return;
    ctx!.clearRect(0, 0, w, h);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      p.x += p.vx + Math.sin(time / 1400 + p.phase) * 0.18;
      p.y += p.vy;
      p.rot += p.vrot;
      if (p.y > h + 24 || p.x < -24 || p.x > w + 24) {
        particles[i] = spawn(false);
        continue;
      }
      drawParticle(p, time);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
