/** Unlock WebAudio on first user gesture (autoplay policy). */
export function soundTestGesture(): void {
  const unlock = (): void => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        void ctx.resume().then(() => ctx.close()).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
