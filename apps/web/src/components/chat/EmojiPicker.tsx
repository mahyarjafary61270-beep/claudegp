import { useEffect, useRef, useState } from 'react';
import { EMOJI_CATEGORIES } from '@/lib/emoji-data';

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }): JSX.Element {
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0]!.id);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const current = EMOJI_CATEGORIES.find((c) => c.id === cat) ?? EMOJI_CATEGORIES[0]!;
  const emojis = q
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((_, i) => i < 240)
    : current.emojis;

  return (
    <div ref={ref} className="glass float-in w-72 rounded-2xl p-3 shadow-2xl" role="dialog" aria-label="emoji picker">
      <input
        className="input mb-2 !py-1.5 text-xs"
        placeholder="🔍"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mb-2 flex gap-1">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setCat(c.id);
              setQ('');
            }}
            className={`rounded-lg p-1.5 text-base transition-all ${cat === c.id && !q ? 'bg-panel scale-110' : 'opacity-60 hover:opacity-100'}`}
            title={c.name}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="scroll-thin grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
        {emojis.map((e, i) => (
          <button key={`${e}-${i}`} className="rounded-lg p-1 text-lg transition-transform hover:scale-125" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
