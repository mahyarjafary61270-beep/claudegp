export type Presence = 'online' | 'idle' | 'offline';
export type ServerRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ChannelType = 'TEXT' | 'VOICE' | 'DM';
export type RadioMode = 'ingress' | 'rtc';

export interface UserDTO {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string | null;
  accentColor: string | null;
  isGlobalAdmin: boolean;
  createdAt: string;
}

export interface ServerDTO {
  id: string;
  name: string;
  iconColor: string;
  ownerId: string;
  createdAt: string;
}

export interface ChannelDTO {
  id: string;
  serverId: string | null;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  createdAt: string;
  /** Only for DM channels: the other participant */
  peer?: Pick<UserDTO, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'accentColor' | 'statusText'> | null;
}

export interface MemberDTO {
  userId: string;
  role: ServerRole;
  joinedAt: string;
  user: UserDTO;
}

export interface AttachmentDTO {
  id: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  name: string;
  url: string;
}

export interface MessageDTO {
  id: string;
  channelId: string;
  kind: 'text' | 'system';
  content: string;
  author: Pick<UserDTO, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'accentColor'> | null;
  attachments: AttachmentDTO[];
  reactions: { emoji: string; count: number; me: boolean }[];
  mentions: string[];
  replyTo: {
    id: string;
    content: string;
    author: { id: string; displayName: string; avatarUrl: string | null; accentColor: string | null } | null;
  } | null;
  editedAt: string | null;
  createdAt: string;
  pinned: boolean;
}

export interface VoiceMemberDTO {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string | null;
  isBot: boolean;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  stationId?: string;
}

export interface RadioStateDTO {
  channelId: string;
  stationId: string;
  mode: RadioMode;
  startedById: string | null;
  startedAt: string;
  listeners: number;
}

export interface NowPlayingDTO {
  stationId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  listeners: number | null;
}

export interface UnreadDTO {
  channelId: string;
  count: number;
  mentionCount: number;
  lastMessageAt: string | null;
}

export interface InviteDTO {
  id: string;
  code: string;
  serverId: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface VoiceTokenDTO {
  token: string;
  url: string;
  room: string;
  identity: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
