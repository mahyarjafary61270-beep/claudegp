import { useQuery } from '@tanstack/react-query';
import { pinQueries } from '@/api/queries';
import { renderMarkdown } from '@mg/shared';
import { useT } from '@/i18n';
import { X, Pin } from '@/components/ui/icons';
import { formatFull } from '@/lib/time';
import { useMemo } from 'react';

export function PinPanel({ channelId }: { channelId: string }): JSX.Element {
  const t = useT();
  const { data } = useQuery(pinQueries.list(channelId));
  const items = data?.items ?? [];
  void useMemo;

  return (
    <aside className="glass float-in w-72 shrink-0 border-y-0 border-e p-3" aria-label={t('pinned')}>
      <div className="mb-2 flex items-center gap-2">
        <Pin size={14} style={{ color: 'var(--accent)' }} />
        <h3 className="text-xs font-bold">{t('pinned')}</h3>
        <button className="btn-ghost ms-auto !p-1" onClick={() => import('@/stores/chat').then((m) => m.useChat.getState().setPinnedOpen(false))}>
          <X size={14} />
        </button>
      </div>
      <div className="scroll-thin max-h-[70vh] space-y-2 overflow-y-auto">
        {items.length === 0 && <p className="text-xs text-subtle">—</p>}
        {items.map((m) => (
          <div key={m.id} className="rounded-xl border border-line p-2.5 text-xs">
            <div className="mb-0.5 flex items-center gap-1.5 font-bold" style={{ color: m.author?.accentColor ?? 'var(--accent-2)' }}>
              {m.author?.displayName ?? '—'}
              <span className="text-[9px] font-normal text-subtle">{formatFull(m.createdAt, true)}</span>
            </div>
            <div className="md line-clamp-4 opacity-90" dir="auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
          </div>
        ))}
      </div>
    </aside>
  );
}
