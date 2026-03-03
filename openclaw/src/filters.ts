import type {
  MeepaChatMessage,
  MeepaChatUser,
  MeepaChatChannel,
  MeepaChatConfig,
} from "./types";

export interface ChannelLookup {
  serverId: string;
  serverName: string;
  channel: MeepaChatChannel;
}

export function shouldProcessMessage(
  message: MeepaChatMessage,
  botUser: MeepaChatUser,
  lookup: ChannelLookup | undefined,
  config: MeepaChatConfig
): boolean {
  // 1. Never process own messages (prevent loops)
  if (message.userId === botUser.id) {
    return false;
  }

  if (!lookup) {
    return false;
  }

  const { serverId, channel } = lookup;

  // 2. Server filter: if servers are defined, only process listed servers
  if (config.servers) {
    const serverFilter = config.servers[serverId];
    if (!serverFilter) {
      return false;
    }

    // 3. Channel filter: if channels are defined for this server, check allowlist
    if (serverFilter.channels) {
      const channelFilter = serverFilter.channels[channel.name];
      if (!channelFilter || !channelFilter.allow) {
        return false;
      }

      // Per-channel requireMention overrides server-level
      const requireMention =
        channelFilter.requireMention ?? serverFilter.requireMention ?? false;
      if (requireMention && !messageContainsMention(message, botUser)) {
        return false;
      }
    } else {
      // No channel filter — check server-level requireMention
      const requireMention = serverFilter.requireMention ?? false;
      if (requireMention && !messageContainsMention(message, botUser)) {
        return false;
      }
    }
  }

  return true;
}

function messageContainsMention(
  message: MeepaChatMessage,
  botUser: MeepaChatUser
): boolean {
  const content = message.content.toLowerCase();
  const username = botUser.username.toLowerCase();
  const displayName = botUser.displayName.toLowerCase();

  return (
    content.includes(`@${username}`) || content.includes(`@${displayName}`)
  );
}
