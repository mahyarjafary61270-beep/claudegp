import { memo, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { renderMarkdown } from '@mg/shared';
import type { MessageDTO } from '@mg/shared';
import { mutations } from '@/api/queries';
import { useT } from '@/i18n';
import { formatTime, formatFull } from '@/lib/time';
import { Avatar } from '@/components/ui/Avatar';
import { QUICK_REACTIONS } from '@/lib/emoji-data';
import { Reply, Pin, Edit, Trash, Smile, MoreH } from '@/components/ui/icons';

interface Props {
  message: MessageDTO;
  grouped: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onReply: () => void;
  meId: string;
  jalali: boolean;
}

export const MessageRow = memo(function MessageRow({
  message: m,
  grouped,
  editing,
  onStartEdit,
  onCancelEdit,
  onReply,
  meId,
  jalali,
}: Props): JSX.Element {
  const t = useT();
  const html = useMemo(() => renderMarkdown(m.content), [m.content]);
  const toggleReaction = useMutation(mutations.toggleReaction(m.channelId, m.id));
  const del = useMutation(mutations.deleteMessage(m.channelId, m.id));
  const togglePin = useMutation(mutations.togglePin(m.channelId, m.id));
  const [menuOpen, setMenuOpen] = useState(false);
  const canModerate = m.author?.id === meId;
  const hasImage = m.attachments.some((a) => a.mime.startsWith('image/'));

  if (m.kind === 'system') {
    return (
      <div className="float-in px-3 py-1 text-center text-xs text-subtle" dir="auto">
        <span className="rounded-full border border-line px-3 py-1">{m.content}</span>
      </div>
    );
  }

  return (
    <div className={`group relative px-3 hover:bg-panel ${grouped ? 'py-0.5' : 'pb-1 pt-2'}`}>
      {m.pinned && (
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--accent)' }}>
          <Pin size={10} /> {t('pinned')}
        </div>
      )}
      {m.replyTo && (
        <div className="mb-1 ms-10 flex items-center gap-1.5 text-xs text-subtle">
          <Reply size={11} />
          <span className="font-semibold" style={{ color: m.replyTo.author?.accentColor ?? 'var(--accent-2)' }}>
            {m.replyTo.author?.displayName ?? '?'}
          </span>
          <span className="min-w-0 flex-1 truncate opacity-80" dir="auto">
            {m.replyTo.content}
          </span>
        </div>
      )}
      <div className="flex items-start gap-3">
        {grouped ? (
          <span className="w-9 shrink-0 pt-1 text-end text-[9px] opacity-0 transition-opacity group-hover:opacity-70">
            {formatTime(m.createdAt, jalali)}
          </span>
        ) : (
          <Avatar src={m.author?.avatarUrl} name={m.author?.displayName ?? '?'} accent={m.author?.accentColor} size={36} />
        )}
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold" style={{ color: m.author?.accentColor ?? 'var(--accent-2)' }}>
                {m.author?.displayName ?? 'System'}
              </span>
              <span className="text-[10px] text-subtle" title={formatFull(m.createdAt, jalali)}>
                {formatTime(m.createdAt, jalali)}
              </span>
              {m.editedAt && <span className="text-[9px] italic text-subtle">({t('edited')})</span>}
            </div>
          )}
          {editing ? (
            <EditBox
              channelId={m.channelId}
              messageId={m.id}
              initial={m.content}
              onDone={(cancelled) => {
                onCancelEdit();
                void cancelled;
              }}
            />
          ) : (
            m.content && <div className="md text-sm" dir="auto" dangerouslySetInnerHTML={{ __html: html }} />
          )}
          {m.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {m.attachments.map((a) => (
                <figure key={a.id} className="m-0">
                  <img src={a.url} alt={a.name} className="msg-img" loading="lazy" />
                </figure>
              ))}
            </div>
          )}
          {m.reactions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {m.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => toggleReaction.mutate(r.emoji)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all ${r.me ? 'border-current font-bold' : 'border-line text-subtle hover:border-current'}`}
                  style={r.me ? { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' } : undefined}
                  aria-label={`${r.emoji} ${r.count}`}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* hover actions */}
      {!editing && (
        <div className="glass absolute -top-3 end-4 hidden items-center gap-0.5 rounded-full px-1 py-0.5 shadow-glow-sm group-hover:flex">
          {QUICK_REACTIONS.slice(0, 3).map((e) => (
            <button key={e} className="rounded-full p-1 text-sm hover:scale-125 transition-transform" onClick={() => toggleReaction.mutate(e)} title={e}>
              {e}
            </button>
          ))}
          <button className="rounded-full p-1 text-subtle hover:text-text" onClick={onReply} title={t('reply')}>
            <Reply size={13} />
          </button>
          <button className="rounded-full p-1 text-subtle hover:text-text" onClick={() => setMenuOpen((v) => !v)} title={t('addReaction')}>
            <Smile size={13} />
          </button>
          <button className="rounded-full p-1 text-subtle hover:text-text" onClick={() => togglePin.mutate()} title={m.pinned ? t('unpin') : t('pin')}>
            <Pin size={13} />
          </button>
          {canModerate && (
            <>
              {!hasImage && (
                <button className="rounded-full p-1 text-subtle hover:text-text" onClick={onStartEdit} title={t('edit')}>
                  <Edit size={13} />
                </button>
              )}
              <button className="rounded-full p-1 text-red-400 hover:text-red-300" onClick={() => del.mutate()} title={t('delete')}>
                <Trash size={13} />
              </button>
            </>
          )}
        </div>
      )}
      {menuOpen && (
        <div className="glass absolute end-4 top-6 z-20 flex gap-1 rounded-xl p-1.5 shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              className="rounded-lg p-1.5 text-base hover:scale-125 transition-transform"
              onClick={() => {
                toggleReaction.mutate(e);
                setMenuOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function EditBox({ channelId, messageId, initial, onDone }: { channelId: string; messageId: string; initial: string; onDone: (cancelled: boolean) => void }): JSX.Element {
  const t = useT();
  const [value, setValue] = useState(initial);
  const edit = useMutation(mutations.editMessage(channelId, messageId));
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="py-1">
      <textarea
        ref={ref}
        autoFocus
        className="input resize-none text-sm"
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) edit.mutate(value.trim());
            onDone(false);
          }
          if (e.key === 'Escape') onDone(true);
        }}
      />
      <div className="mt-1 flex items-center gap-2 text-[10px] text-subtle">
        <button className="btn-ghost !py-0.5 !px-2" onClick={() => onDone(true)}>
          Esc
        </button>
        <MoreH size={10} />
      </div>
    </div>
  );
}
