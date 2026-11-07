import { useChat } from '@/stores/chat';
import { useT } from '@/i18n';

export function TypingIndicator({ channelId }: { channelId: string | null }): JSX.Element {
  const t = useT();
  const list = useChat((s) => (channelId ? s.typing[channelId] : [])) ?? [];
  if (list.length === 0 || !channelId) return <div className="h-5" />;
  const names = list.map((x) => x.displayName).join('، ');
  return (
    <div className="h-5 px-4 text-[11px] text-subtle" aria-live="polite">
      <span className="eq me-1.5 inline-flex align-middle"><span className="eq-bar" /><span className="eq-bar" style={{ animationDelay: '120ms' }} /><span className="eq-bar" style={{ animationDelay: '240ms' }} /></span>
      {names} {t('typing')}
    </div>
  );
}
