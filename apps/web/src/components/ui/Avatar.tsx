import { usePresenceStore } from '@/ws/handlers';
import type { Presence } from '@mg/shared';

interface AvatarProps {
  src?: string | null;
  name: string;
  accent?: string | null;
  size?: number;
  userId?: string;
  showPresence?: boolean;
  speaking?: boolean;
  muted?: boolean;
}

const PRESENCE_COLOR: Record<Presence, string> = {
  online: '#34d399',
  idle: '#fbbf24',
  offline: '#6b7280',
};

export function Avatar({ src, name, accent, size = 36, userId, showPresence, speaking, muted }: AvatarProps): JSX.Element {
  const presence = usePresenceStore((s) => (userId ? s.presence[userId] : undefined));
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full font-bold text-white ${speaking ? 'speaking-ring' : ''}`}
        style={{
          background: accent
            ? `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 55%, #000))`
            : 'linear-gradient(135deg, var(--accent-2), var(--accent))',
          width: size,
          height: size,
          fontSize: size * 0.42,
          opacity: muted ? 0.55 : 1,
        }}
      >
        {src ? <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" /> : initial}
      </div>
      {showPresence && presence && (
        <span
          className="absolute -bottom-0.5 -end-0.5 rounded-full border-2"
          style={{
            width: Math.max(10, size * 0.3),
            height: Math.max(10, size * 0.3),
            background: PRESENCE_COLOR[presence],
            borderColor: 'var(--bg-surface)',
          }}
          title={presence}
        />
      )}
    </div>
  );
}
