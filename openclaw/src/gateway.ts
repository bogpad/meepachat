import WebSocket from "ws";
import { EventEmitter } from "node:events";
import type {
  MeepaChatUser,
  MeepaChatChannel,
  MeepaChatConfig,
  MeepaChatMessage,
  GatewayEvent,
  ReadyData,
  MessageDeletedData,
  ReactionSyncData,
  RetryConfig,
} from "./types";

export interface GatewayEvents {
  ready: [ReadyData];
  message: [MeepaChatMessage];
  messageUpdated: [MeepaChatMessage];
  messageDeleted: [MessageDeletedData];
  reactionSync: [ReactionSyncData];
  error: [Error];
  connected: [];
  disconnected: [];
}

interface ChannelInfo {
  serverId: string;
  serverName: string;
  channel: MeepaChatChannel;
}

export class MeepaChatGateway extends EventEmitter<GatewayEvents> {
  private ws: WebSocket | null = null;
  private botUser: MeepaChatUser | null = null;
  private channelMap = new Map<string, ChannelInfo>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(
    private url: string,
    private token: string,
    private retryConfig: RetryConfig,
    private tlsVerify: boolean
  ) {
    super();
  }

  get bot(): MeepaChatUser | null {
    return this.botUser;
  }

  getChannelInfo(channelId: string): ChannelInfo | undefined {
    return this.channelMap.get(channelId);
  }

  connect(): void {
    this.intentionalClose = false;
    const wsUrl = `${this.url.replace(/^http/, "ws")}/api/bot-gateway`;
    const wsOptions: WebSocket.ClientOptions = {
      headers: { Authorization: `Bot ${this.token}` },
    };

    if (!this.tlsVerify) {
      wsOptions.rejectUnauthorized = false;
    }

    this.ws = new WebSocket(wsUrl, wsOptions);

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.emit("connected");
    });

    this.ws.on("message", (raw: WebSocket.Data) => {
      try {
        const event = JSON.parse(raw.toString()) as GatewayEvent;
        this.handleEvent(event);
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.on("close", () => {
      this.emit("disconnected");
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", err);
    });
  }

  sendTyping(channelId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ type: "typing", data: { channelId } })
      );
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleEvent(event: GatewayEvent): void {
    switch (event.type) {
      case "ready":
        this.handleReady(event.data as ReadyData);
        break;
      case "message.created":
        this.emit("message", event.data as MeepaChatMessage);
        break;
      case "message.updated":
        this.emit("messageUpdated", event.data as MeepaChatMessage);
        break;
      case "message.deleted":
        this.emit("messageDeleted", event.data as MessageDeletedData);
        break;
      case "reaction.sync":
        this.emit("reactionSync", event.data as ReactionSyncData);
        break;
      case "pong":
        // App-level pong, no action needed
        break;
    }
  }

  private handleReady(data: ReadyData): void {
    this.botUser = data.user;
    this.channelMap.clear();

    for (const server of data.servers) {
      for (const channel of server.channels) {
        this.channelMap.set(channel.id, {
          serverId: server.id,
          serverName: server.name,
          channel,
        });
      }
    }

    // Map DM channels (no server context)
    if (data.dmChannels) {
      for (const ch of data.dmChannels) {
        this.channelMap.set(ch.id, {
          serverId: "",
          serverName: "",
          channel: { ...ch, isDm: true },
        });
      }
    }

    this.emit("ready", data);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.retryConfig.attempts) {
      this.emit(
        "error",
        new Error(
          `Failed to reconnect after ${this.retryConfig.attempts} attempts`
        )
      );
      return;
    }

    const delay = Math.min(
      this.retryConfig.minDelayMs * Math.pow(2, this.reconnectAttempts),
      this.retryConfig.maxDelayMs
    );

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
