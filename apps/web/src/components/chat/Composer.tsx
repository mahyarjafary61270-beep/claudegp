import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDTO } from '@mg/shared';
import { mutations } from '@/api/queries';
import { post, del, get } from '@/api/client';
import { socket } from '@/ws/socket';
import { useT } from '@/i18n';
import { useUI } from '@/stores/ui';
import { Send, Smile, Image as ImageIcon, X, Radio as RadioIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { StationCard } from './StationCard';

const EmojiPicker = lazy(() => import('./EmojiPicker'));

interface Props {
  channelId: string;
}

export function Composer({ channelId }: Props): JSX.Element {
  const t = useT();
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const setCommandPalette = useUI((s) => s.setCommandPalette);
  const commandOpen = useUI((s) => s.commandPalette.open);
  const command = useUI((s) => s.commandPalette.command);

  const send = useMutation(mutations.sendMessage(channelId));

  useEffect(() => {
    setValue('');
    setAttachments([]);
    setReplyToId(null);
    setError(null);
  }, [channelId]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  // /mp typed in the box opens the station picker
  useEffect(() => {
    if (value.trim() === '/mp') {
      setCommandPalette(true, 'mp');
      setValue('');
    } else if (value.trim() === '/stop') {
      void handleStop();
      setValue('');
    } else if (value.trim() === '/radios') {
      setCommandPalette(true, 'radios');
      setValue('');
    } else if (value.trim() === '/np') {
      setCommandPalette(true, 'np');
      setValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const submit = async (): Promise<void> => {
    const content = value.trim();
    if (!content && attachments.length === 0) return;
    setValue('');
    const atts = attachments;
    setAttachments([]);
    const rt = replyToId;
    setReplyToId(null);
    try {
      await send.mutateAsync({ content, attachmentIds: atts.map((a) => a.id), replyToId: rt });
    } catch (err) {
      setError((err as Error).message);
      setValue(content);
      setAttachments(atts);
      setReplyToId(rt);
    }
  };

  const uploadFile = useCallback(async (file: File): Promise<void> => {
    if (file.size > 8 * 1024 * 1024) {
      setError('حداکثر حجم فایل ۸ مگابایت است');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await post<{ attachment: AttachmentDTO }>('/uploads', form);
      setAttachments((prev) => [...prev, res.attachment].slice(0, 4));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, []);

  const onPaste = (e: React.ClipboardEvent): void => {
    const items = [...e.clipboardData.items];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          void uploadFile(f);
        }
      }
    }
  };

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
    for (const f of [...e.dataTransfer.files].slice(0, 4)) {
      void uploadFile(f);
    }
  };

  const onEmoji = (emoji: string): void => {
    setValue((v) => v + emoji);
    setEmojiOpen(false);
    taRef.current?.focus();
  };

  const sendTyping = (): void => {
    socket.send({ t: 'typing', channelId });
  };

  const handleStop = async (): Promise<void> => {
    try {
      await del(`/channels/${channelId}/radio`);
      void queryClient.invalidateQueries({ queryKey: ['radio', channelId] });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="px-3 pb-2 pt-1" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      {replyToId !== null && (
        <div className="glass mb-1 flex items-center gap-2 rounded-t-xl px-3 py-1.5 text-xs text-subtle">
          <RadioIcon size={12} /> {t('reply')} فعال
          <button className="ms-auto btn-ghost !p-0.5" onClick={() => setReplyToId(null)}>
            <X size={12} />
          </button>
        </div>
      )}
      {dragOver && (
        <div className="mb-1 rounded-xl border-2 border-dashed p-4 text-center text-xs font-bold" style={{ borderColor: 'var(--accent)' }}>
          {t('dropFiles')} 📥
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-2 px-1">
          {attachments.map((a) => (
            <div key={a.id} className="glass relative rounded-lg p-1.5">
              <img src={a.url} alt={a.name} className="h-16 w-16 rounded object-cover" />
              <button className="absolute -end-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mb-1 px-1 text-xs text-red-400" role="alert">
          {error}
        </div>
      )}
      {commandOpen && command === 'mp' && <StationCard channelId={channelId} onClose={() => setCommandPalette(false)} />}
      {commandOpen && command === 'radios' && <StationCard channelId={channelId} listMode onClose={() => setCommandPalette(false)} />}
      {commandOpen && command === 'np' && <NowPlayingCard channelId={channelId} />}

      <div className="glass flex items-end gap-1.5 rounded-2xl px-2 py-1.5">
        <button className="btn-ghost !p-2" title={t('uploadImage')} onClick={() => fileRef.current?.click()}>
          {uploading ? <Spinner size={16} /> : <ImageIcon size={17} />}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = '';
          }}
        />
        <textarea
          ref={taRef}
          rows={1}
          className="max-h-[180px] min-h-[38px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-subtle"
          placeholder={t('messagePlaceholder')}
          value={value}
          dir="auto"
          onChange={(e) => {
            setValue(e.target.value);
            sendTyping();
          }}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              void submit();
            }
          }}
          aria-label={t('send')}
        />
        <div className="relative">
          <button className="btn-ghost !p-2" title="emoji" onClick={() => setEmojiOpen((v) => !v)} aria-expanded={emojiOpen}>
            <Smile size={17} />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-11 end-0 z-30">
              <Suspense fallback={<div className="glass rounded-xl p-3"><Spinner size={16} /></div>}>
                <EmojiPicker onPick={onEmoji} onClose={() => setEmojiOpen(false)} />
              </Suspense>
            </div>
          )}
        </div>
        <button className="btn-primary !p-2" onClick={() => void submit()} disabled={!value.trim() && attachments.length === 0} aria-label={t('send')}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function NowPlayingCard({ channelId }: { channelId: string }): JSX.Element {
  const t = useT();
  const [data, setData] = useState<{ radio: unknown; nowPlaying: { title: string; artist: string | null } | null } | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await get<{ radio: unknown; nowPlaying: { title: string; artist: string | null } | null }>(`/channels/${channelId}/radio`);
        setData(res);
      } catch {
        /* ignore */
      }
      useUI.getState().setCommandPalette(false);
    })();
  }, [channelId]);
  return (
    <div className="glass float-in mb-2 rounded-xl p-4 text-sm" role="status">
      {data?.nowPlaying ? (
        <div>
          <div className="text-[10px] font-bold uppercase text-subtle">{t('nowPlaying')} 📻</div>
          <div className="mt-1 font-bold">{data.nowPlaying.title}</div>
          {data.nowPlaying.artist && <div className="text-subtle">{data.nowPlaying.artist}</div>}
        </div>
      ) : (
        <div className="text-subtle">— /np</div>
      )}
    </div>
  );
}
