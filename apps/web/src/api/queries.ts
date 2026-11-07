import { infiniteQueryOptions, keepPreviousData, mutationOptions, queryOptions } from '@tanstack/react-query';
import type { ChannelDTO, MemberDTO, MessageDTO, NowPlayingDTO, Paginated, RadioStateDTO, ServerDTO, UnreadDTO, UserDTO } from '@mg/shared';
import { get, post, patch, del, upload } from './client';

export const qk = {
  servers: ['servers'] as const,
  server: (id: string) => ['server', id] as const,
  dms: ['dms'] as const,
  messages: (channelId: string) => ['messages', channelId] as const,
  unread: ['unread'] as const,
  pins: (channelId: string) => ['pins', channelId] as const,
  search: (serverId: string, q: string) => ['search', serverId, q] as const,
  radio: (channelId: string) => ['radio', channelId] as const,
};

export interface ServerSummary extends ServerDTO {
  role: string;
}

export const serverQueries = {
  list: () =>
    queryOptions({
      queryKey: qk.servers,
      queryFn: () => get<{ items: ServerSummary[] }>('/servers'),
      select: (d) => d.items,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: qk.server(id),
      queryFn: () => get<{ server: ServerDTO; channels: ChannelDTO[]; members: (MemberDTO & { presence: string })[] }>(`/servers/${id}`),
      enabled: !!id,
    }),
};

export const dmQueries = {
  list: () =>
    queryOptions({
      queryKey: qk.dms,
      queryFn: () => get<{ items: ChannelDTO[] }>('/dms'),
      select: (d) => d.items,
    }),
};

export const messageQueries = {
  list: (channelId: string) =>
    infiniteQueryOptions({
      queryKey: qk.messages(channelId),
      queryFn: ({ pageParam }) => {
        const qs = pageParam ? `?cursor=${encodeURIComponent(String(pageParam))}` : '';
        return get<Paginated<MessageDTO>>(`/channels/${channelId}/messages${qs}`);
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: () => undefined as string | undefined,
      getPreviousPageParam: (firstPage) => (firstPage.hasMore ? firstPage.nextCursor : undefined),
      enabled: !!channelId,
    }),
};

export const unreadQuery = {
  list: () =>
    queryOptions({
      queryKey: qk.unread,
      queryFn: () => get<{ items: UnreadDTO[] }>('/unread'),
      select: (d) => d.items,
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: true,
    }),
};

export const pinQueries = {
  list: (channelId: string) =>
    queryOptions({
      queryKey: qk.pins(channelId),
      queryFn: () => get<{ items: MessageDTO[] }>(`/channels/${channelId}/pins`),
      enabled: !!channelId,
    }),
};

export function searchQuery(serverId: string, q: string) {
  return queryOptions({
    queryKey: qk.search(serverId, q),
    queryFn: () =>
      get<{ items: { id: string; channelId: string; content: string; createdAt: string; author: { displayName: string } | null }[] }>(
        `/servers/${serverId}/search?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
}

export const radioQueries = {
  status: (channelId: string) =>
    queryOptions({
      queryKey: qk.radio(channelId),
      queryFn: () => get<{ radio: RadioStateDTO | null; nowPlaying: NowPlayingDTO | null }>(`/channels/${channelId}/radio`),
      enabled: !!channelId,
    }),
};

export const mutations = {
  sendMessage: (channelId: string) =>
    mutationOptions({
      mutationFn: (input: { content: string; attachmentIds?: string[]; replyToId?: string | null }) =>
        post<{ message: MessageDTO }>(`/channels/${channelId}/messages`, input),
    }),
  editMessage: (channelId: string, messageId: string) =>
    mutationOptions({
      mutationFn: (content: string) => patch<{ message: MessageDTO }>(`/channels/${channelId}/messages/${messageId}`, { content }),
    }),
  deleteMessage: (channelId: string, messageId: string) =>
    mutationOptions({ mutationFn: () => del(`/channels/${channelId}/messages/${messageId}`) }),
  toggleReaction: (channelId: string, messageId: string) =>
    mutationOptions({ mutationFn: (emoji: string) => post(`/channels/${channelId}/messages/${messageId}/reactions`, { emoji }) }),
  markRead: (channelId: string) =>
    mutationOptions({ mutationFn: (messageId?: string) => post(`/channels/${channelId}/read`, { messageId }) }),
  togglePin: (channelId: string, messageId: string) =>
    mutationOptions({ mutationFn: () => post(`/channels/${channelId}/messages/${messageId}/pin`) }),
  uploadImage: mutationOptions({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return upload<{ attachment: { id: string; url: string; mime: string; width: number | null; height: number | null } }>('/uploads', form);
    },
  }),
  startRadio: (channelId: string) =>
    mutationOptions({ mutationFn: (stationId: string) => post<{ radio: RadioStateDTO }>(`/channels/${channelId}/radio`, { stationId }) }),
  stopRadio: (channelId: string) => mutationOptions({ mutationFn: () => del(`/channels/${channelId}/radio`) }),
  createDm: mutationOptions({ mutationFn: (userId: string) => post<{ channel: ChannelDTO }>('/dms', { userId }) }),
  updateProfile: mutationOptions({
    mutationFn: (input: { displayName?: string; statusText?: string | null; accentColor?: string | null }) => patch<{ user: UserDTO }>('/users/me', input),
  }),
  uploadAvatar: mutationOptions({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return upload<{ user: UserDTO }>('/users/me/avatar', form);
    },
  }),
  joinInvite: mutationOptions({ mutationFn: (code: string) => post<{ serverId: string; joined: boolean }>(`/invites/${code}/join`) }),
};
