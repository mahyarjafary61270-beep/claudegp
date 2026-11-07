import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serverQueries, dmQueries } from '@/api/queries';
import { useView } from '@/stores/rooms';
import { useUI } from '@/stores/ui';
import { useT } from '@/i18n';
import { Hash } from '@/components/ui/icons';

/** Ctrl+K quick channel/DM switcher. */
export function QuickSwitcher(): JSX.Element {
  const t = useT();
  const open = useUI((s) => s.quickSwitcher);
  const setOpen = useUI((s) => s.setQuickSwitcher);
  const setActive = useView((s) => s.setActive);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: servers } = useQuery(serverQueries.list());
  const { data: dms } = useQuery(dmQueries.list());
  const activeServer = useView((s) => s.activeServer);
  const { data: detail } = useQuery({ ...serverQueries.detail(activeServer ?? ''), enabled: !!activeServer });

  const items = useMemo(() => {
    const out: { key: string; label: string; kind: 'channel' | 'dm' | 'server'; serverId: string | null; channelId: string | null }[] = [];
    for (const s of servers ?? []) out.push({ key: `s-${s.id}`, label: `🏠 ${s.name}`, kind: 'server', serverId: s.id, channelId: null });
    for (const c of detail?.channels ?? []) out.push({ key: `c-${c.id}`, label: `${c.type === 'VOICE' ? '🔊' : '#'} ${c.name}`, kind: 'channel', serverId: c.serverId, channelId: c.id });
    for (const dm of dms ?? []) out.push({ key: `d-${dm.id}`, label: `✉️ ${dm.peer?.displayName ?? 'DM'}`, kind: 'dm', serverId: null, channelId: dm.id });
    return out;
  }, [servers, detail, dms]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 10);
    return items.filter((i) => i.label.toLowerCase().includes(needle)).slice(0, 10);
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return <div className="hidden" />;

  const choose = (i: (typeof filtered)[number] | undefined): void => {
    if (!i) return;
    setActive(i.serverId, i.channelId);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" role="dialog" aria-label={t('quickSwitcher')}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="glass float-in relative w-full max-w-md rounded-2xl p-3 shadow-2xl">
        <input
          ref={inputRef}
          className="input"
          placeholder={`${t('quickSwitcher')}... (Ctrl+K)`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, filtered.length - 1));
            if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0));
            if (e.key === 'Enter') choose(filtered[idx]);
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {filtered.map((i, n) => (
            <button
              key={i.key}
              onClick={() => choose(i)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${n === idx ? 'bg-panel font-bold' : 'hover:bg-panel'}`}
              onMouseEnter={() => setIdx(n)}
            >
              {i.kind === 'channel' && i.channelId ? <Hash size={14} className="opacity-60" /> : <span>{i.label.slice(0, 2)}</span>}
              <span className="truncate">{i.label.replace(/^\S+\s/, '')}</span>
              <span className="ms-auto text-[9px] uppercase text-subtle">{i.kind}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-4 text-center text-sm text-subtle">—</div>}
        </div>
      </div>
    </div>
  );
}
