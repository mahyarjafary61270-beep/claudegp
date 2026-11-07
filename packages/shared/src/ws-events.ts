import type { ChannelDTO, MessageDTO, UserDTO, VoiceMemberDTO, RadioStateDTO, NowPlayingDTO } from './types';

/** Frames the client sends to the server over /ws */
export type ClientEvent =
  | { t: 'auth'; token: string }
  | { t: 'heartbeat'; active: boolean }
  | { t: 'typing'; channelId: string }
  | { t: 'voice_flags'; muted?: boolean; deafened?: boolean }
  | { t: 'sync' };

/** Frames the server pushes to clients over /ws */
export type ServerEvent =
  | { t: 'ready'; user: UserDTO }
  | { t: 'hello' }
  | { t: 'error'; code: string; message: string; channelId?: string }
  | { t: 'presence'; userId: string; presence: 'online' | 'idle' | 'offline' }
  | { t: 'message_new'; message: MessageDTO }
  | { t: 'message_edit'; message: MessageDTO }
  | { t: 'message_delete'; channelId: string; messageId: string }
  | { t: 'reaction'; channelId: string; messageId: string; emoji: string; userId: string; added: boolean }
  | { t: 'pin'; channelId: string; messageId: string; pinned: boolean }
  | { t: 'typing'; channelId: string; userId: string; displayName: string }
  | { t: 'channel_new'; channel: ChannelDTO }
  | { t: 'channel_update'; channel: ChannelDTO }
  | { t: 'channel_delete'; serverId: string | null; channelId: string }
  | { t: 'server_update'; serverId: string; name: string }
  | { t: 'member_update'; serverId: string; userId: string; role: string }
  | { t: 'member_left'; serverId: string; userId: string; kicked: boolean; banned: boolean }
  | { t: 'member_joined'; serverId: string; user: UserDTO }
  | { t: 'dm_new'; channel: ChannelDTO; user: UserDTO }
  | { t: 'voice_room'; channelId: string; members: VoiceMemberDTO[] }
  | { t: 'radio_state'; channelId: string; radio: RadioStateDTO | null }
  | { t: 'now_playing'; channelId: string; nowPlaying: NowPlayingDTO | null }
  | { t: 'unread_reset'; channelId: string }
  | { t: 'force_logout'; reason: string };

export const WS_EVENTS = {
  CLIENT: {
    AUTH: 'auth',
    HEARTBEAT: 'heartbeat',
    TYPING: 'typing',
    SYNC: 'sync',
  },
  SERVER: {
    READY: 'ready',
    HELLO: 'hello',
    ERROR: 'error',
    PRESENCE: 'presence',
    MESSAGE_NEW: 'message_new',
    MESSAGE_EDIT: 'message_edit',
    MESSAGE_DELETE: 'message_delete',
    REACTION: 'reaction',
    PIN: 'pin',
    TYPING: 'typing',
    CHANNEL_NEW: 'channel_new',
    CHANNEL_UPDATE: 'channel_update',
    CHANNEL_DELETE: 'channel_delete',
    SERVER_UPDATE: 'server_update',
    MEMBER_UPDATE: 'member_update',
    MEMBER_LEFT: 'member_left',
    MEMBER_JOINED: 'member_joined',
    DM_NEW: 'dm_new',
    VOICE_ROOM: 'voice_room',
    RADIO_STATE: 'radio_state',
    NOW_PLAYING: 'now_playing',
    UNREAD_RESET: 'unread_reset',
    FORCE_LOGOUT: 'force_logout',
  },
} as const;
