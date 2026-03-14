import WebSocket from 'ws';
import https from 'https';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';
import { registerChannel, ChannelOpts } from './registry.js';
import { readEnvFile } from '../config.js';

export interface MeepaChatChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class MeepaChatChannel implements Channel {
  name = 'meepachat';

  private ws: WebSocket | null = null;
  private opts: MeepaChatChannelOpts;
  private botToken: string;
  private baseUrl: string;
  private botUser: any = null;
  private servers: any[] = [];
  private channels = new Map<string, any>();
  private processedMessages = new Set<string>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(botToken: string, baseUrl: string, opts: MeepaChatChannelOpts) {
    this.botToken = botToken;
    this.baseUrl = baseUrl;
    this.opts = opts;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('mc:');
  }

  async connect(): Promise<void> {
    const wsUrl = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/bot-gateway';

    logger.info({ wsUrl }, 'Connecting to MeepaChat Bot Gateway');

    this.ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bot ${this.botToken}`
      }
    });

    this.ws.on('open', () => {
      logger.info('✓ Connected to MeepaChat Bot Gateway');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleEvent(event);
      } catch (error) {
        logger.error({ error }, 'Error parsing MeepaChat message');
      }
    });

    this.ws.on('close', () => {
      logger.warn('MeepaChat connection closed');
      this.stopHeartbeat();
      this.reconnect();
    });

    this.ws.on('error', (error) => {
      logger.error({ error }, 'MeepaChat WebSocket error');
    });
  }

  private startHeartbeat() {
    // Send ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private reconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;

    logger.info({ delay, attempt: this.reconnectAttempts }, 'Reconnecting to MeepaChat');
    setTimeout(() => this.connect(), delay);
  }

  private handleEvent(event: any) {
    switch (event.type) {
      case 'ready':
        this.handleReady(event.data);
        break;

      case 'pong':
        break;

      case 'message.created':
        this.handleMessage(event.data);
        break;

      case 'message.updated':
        this.handleMessageUpdated(event.data);
        break;

      case 'message.deleted':
        this.handleMessageDeleted(event.data);
        break;

      case 'reaction.sync':
        logger.debug({ channelId: event.data?.channelId, messageId: event.data?.messageId }, 'MeepaChat reaction sync');
        break;

      case 'channel.created':
      case 'channel.updated':
        this.updateChannel(event.data);
        break;

      case 'server.added':
        logger.info({ server: event.data }, 'Bot added to new MeepaChat server');
        break;

      default:
        logger.debug({ type: event.type }, 'Unhandled MeepaChat event');
    }
  }

  private handleReady(data: any) {
    this.botUser = data.user;
    this.servers = data.servers || [];

    logger.info({
      username: this.botUser.username,
      id: this.botUser.id,
      servers: this.servers.length
    }, '✓ MeepaChat bot ready');

    // Map all channels
    this.servers.forEach(server => {
      if (server.channels) {
        server.channels.forEach((channel: any) => {
          const jid = `mc:${channel.id}`;
          this.channels.set(channel.id, {
            ...channel,
            serverId: server.id,
            serverName: server.name,
            jid
          });
          logger.info({
            channel: channel.name,
            id: channel.id,
            server: server.name
          }, 'MeepaChat channel discovered');
        });
      }
    });

    // Handle DM channels
    if (data.dmChannels && data.dmChannels.length > 0) {
      data.dmChannels.forEach((channel: any) => {
        const jid = `mc:${channel.id}`;
        this.channels.set(channel.id, {
          ...channel,
          isDM: true,
          jid
        });
        logger.info({ channelId: channel.id }, 'MeepaChat DM channel discovered');
      });
    }
  }

  private handleMessageUpdated(message: any) {
    const channelId = message.channelId || message.channel_id;
    const channel = this.channels.get(channelId);
    if (!channel) return;

    logger.debug(
      { messageId: message.id, channelId },
      'MeepaChat message updated',
    );
  }

  private handleMessageDeleted(data: any) {
    const messageId = data.messageId || data.message_id || data.id;
    const channelId = data.channelId || data.channel_id;

    // Remove from processed set so edits/re-sends aren't blocked
    if (messageId) {
      this.processedMessages.delete(messageId);
    }

    logger.debug(
      { messageId, channelId },
      'MeepaChat message deleted',
    );
  }

  private updateChannel(channel: any) {
    const jid = `mc:${channel.id}`;
    this.channels.set(channel.id, { ...channel, jid });
  }

  private async handleMessage(message: any) {
    // Check if we've already processed this message
    if (this.processedMessages.has(message.id)) {
      return;
    }

    // Mark message as processed
    this.processedMessages.add(message.id);

    // Clean up old processed messages (keep last 100)
    if (this.processedMessages.size > 100) {
      const first = this.processedMessages.values().next().value!;
      this.processedMessages.delete(first);
    }

    // Handle both camelCase and snake_case field names
    const userId = message.userId || message.user_id;
    const channelId = message.channelId || message.channel_id;
    const user = message.user || message.author;

    // Ignore our own messages and other bots
    if (userId === this.botUser.id) {
      return;
    }
    if (user?.bot) {
      return;
    }

    const channel = this.channels.get(channelId);
    if (!channel) {
      logger.debug({ channelId }, 'Message from unknown MeepaChat channel');
      return;
    }

    const chatJid = channel.jid;
    let content = message.content;
    const timestamp = message.createdAt;
    const senderName = user ? (user.displayName || user.username) : 'Unknown';
    const sender = userId;

    // Determine chat name
    const chatName = channel.isDM
      ? senderName
      : `${channel.serverName} #${channel.name || channel.displayName}`;

    // Translate MeepaChat @bot mentions into TRIGGER_PATTERN format
    // Check if bot is mentioned in the message
    const mentions = message.mentions || [];
    const isBotMentioned = mentions.some((mention: any) => mention.id === this.botUser.id);

    if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
      content = `@${ASSISTANT_NAME} ${content}`;
    }

    // Store chat metadata for discovery
    const isGroup = !channel.isDM;
    this.opts.onChatMetadata(chatJid, timestamp, chatName, 'meepachat', isGroup);

    // Only deliver full message for registered groups
    const group = this.opts.registeredGroups()[chatJid];
    if (!group) {
      logger.debug(
        { chatJid, chatName },
        'Message from unregistered MeepaChat channel',
      );
      return;
    }

    // Deliver message — startMessageLoop() will pick it up
    this.opts.onMessage(chatJid, {
      id: message.id,
      chat_jid: chatJid,
      sender,
      sender_name: senderName,
      content,
      timestamp,
      is_from_me: false,
    });

    logger.info(
      { chatJid, chatName, sender: senderName },
      'MeepaChat message stored',
    );
  }

  async sendMessage(jid: string, message: string): Promise<void> {
    // Extract channel ID from JID (format: mc:channelId)
    const channelId = jid.replace('mc:', '');
    const channel = this.channels.get(channelId);

    if (!channel) {
      logger.error({ jid }, 'Cannot send message: channel not found');
      throw new Error(`Channel not found: ${jid}`);
    }

    // DMs use /api/dms/{channelID}/messages, server channels use /api/servers/{serverID}/channels/{channelID}/messages
    let apiPath: string;
    if (channel.isDM) {
      apiPath = `/api/dms/${channelId}/messages`;
    } else {
      const serverId = channel.serverId || this.servers[0]?.id;
      if (!serverId) {
        logger.error({ jid }, 'Cannot send message: server ID not found');
        throw new Error(`Server ID not found for channel: ${jid}`);
      }
      apiPath = `/api/servers/${serverId}/channels/${channelId}/messages`;
    }

    // Split long messages into chunks (API limit: 4000 chars)
    const chunks = [];
    for (let i = 0; i < message.length; i += 4000) {
      chunks.push(message.slice(i, i + 4000));
    }

    for (const chunk of chunks) {
      await this.postMessage(apiPath, chunk);
    }
  }

  private postMessage(apiPath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ content });
      const dataBuffer = Buffer.from(data, 'utf8');

      const url = new URL(this.baseUrl);
      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': dataBuffer.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk: string) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            logger.info({ path: apiPath }, 'MeepaChat message sent');
            resolve();
          } else {
            logger.error({ statusCode: res.statusCode, body }, 'Failed to send MeepaChat message');
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        logger.error({ error }, 'MeepaChat message request error');
        reject(error);
      });

      req.write(dataBuffer);
      req.end();
    });
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!isTyping || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const channelId = jid.replace('mc:', '');
    this.ws.send(JSON.stringify({ type: 'typing', data: { channelId } }));
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    logger.info('MeepaChat disconnected');
  }
}

// Self-register with NanoClaw channel system
// Uses readEnvFile() instead of process.env because process.env is empty under launchd
registerChannel('meepachat', (opts: ChannelOpts) => {
  const env = readEnvFile();
  const token = env.MEEPACHAT_BOT_TOKEN;
  const baseUrl = env.MEEPACHAT_BASE_URL;
  if (!token || !baseUrl) return null;
  return new MeepaChatChannel(token, baseUrl, opts);
});
