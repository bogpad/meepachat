// MeepaChat domain types (mirrors Go models and web/src/api/types.ts)

export interface MeepaChatUser {
  id: string;
  username: string;
  displayName: string;
  avatarPath?: string;
  status: string;
  bot: boolean;
  createdAt: string;
}

export interface MeepaChatServer {
  id: string;
  name: string;
  iconPath?: string;
  createdBy: string;
  createdAt: string;
}

export interface MeepaChatChannel {
  id: string;
  serverId: string | null;
  name: string;
  displayName: string;
  topic: string | null;
  isDm: boolean;
  isPrivate: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface MeepaChatMessage {
  id: string;
  channelId: string;
  userId: string;
  threadId?: string;
  content: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  user?: MeepaChatUser;
  replyCount?: number;
  reactions?: MeepaChatReaction[];
  attachments?: MeepaChatAttachment[];
}

export interface MeepaChatReaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface MeepaChatAttachment {
  id: string;
  messageId: string;
  filename: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

// Gateway event types

export interface GatewayEvent {
  type: string;
  data?: unknown;
}

export interface ReadyData {
  user: MeepaChatUser;
  servers: Array<{
    id: string;
    name: string;
    channels: MeepaChatChannel[];
  }>;
  dmChannels?: MeepaChatChannel[];
}

export interface MessageDeletedData {
  id: string;
  channelId: string;
}

export interface ReactionSyncData {
  messageId: string;
  reactions: MeepaChatReaction[];
}

// Plugin configuration

export interface MeepaChatChannelFilter {
  allow: boolean;
  requireMention?: boolean;
}

export interface MeepaChatServerFilter {
  requireMention?: boolean;
  channels?: Record<string, MeepaChatChannelFilter>;
}

export interface RetryConfig {
  attempts: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export interface MeepaChatConfig {
  enabled: boolean;
  url: string;
  token: string;
  tlsVerify?: boolean;
  servers?: Record<string, MeepaChatServerFilter>;
  retry?: RetryConfig;
}

export function isMeepaChatConfigured(token?: string, url?: string): boolean {
  return Boolean(token?.trim() && url?.trim());
}
