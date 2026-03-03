import type { OpenClawConfig, ChannelPlugin } from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  deleteAccountFromConfigSection,
} from "openclaw/plugin-sdk";
import { MeepaChatGateway } from "./gateway";
import { MeepaChatHttpClient } from "./http-client";
import { handleMeepaChatInbound } from "./inbound";
import { shouldProcessMessage, type ChannelLookup } from "./filters";
import { isMeepaChatConfigured, type MeepaChatConfig, type MeepaChatMessage } from "./types";
import { getMeepchatRuntime } from "./runtime";
import { MeepaChatConfigJsonSchema } from "./config-schema";
import { meepachatOnboardingAdapter } from "./onboarding";

function dmDisplayName(msg: MeepaChatMessage): string {
  return `DM with ${msg.user?.displayName || msg.user?.username || "user"}`;
}

// Track active connections per account
const connections = new Map<
  string,
  {
    gateway: MeepaChatGateway;
    httpClient: MeepaChatHttpClient;
  }
>();

function listAccountIds(cfg: OpenClawConfig): string[] {
  const meepachatCfg = cfg.channels?.meepachat as MeepaChatConfig | undefined;
  if (meepachatCfg?.token) return [DEFAULT_ACCOUNT_ID ?? "default"];
  return [];
}

function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): any {
  const meepachatCfg = cfg.channels?.meepachat as MeepaChatConfig | undefined;
  if (!meepachatCfg)
    throw new Error("Missing channels.meepachat configuration");
  if (!meepachatCfg.url) throw new Error("channels.meepachat.url is required");
  if (!meepachatCfg.token)
    throw new Error("channels.meepachat.token is required");

  const resolvedId = accountId ?? DEFAULT_ACCOUNT_ID ?? "default";

  return {
    accountId: resolvedId,
    enabled: meepachatCfg.enabled !== false,
    config: {
      ...meepachatCfg,
      url: meepachatCfg.url.replace(/\/+$/, ""),
      tlsVerify: meepachatCfg.tlsVerify ?? true,
      retry: meepachatCfg.retry ?? {
        attempts: 5,
        minDelayMs: 1000,
        maxDelayMs: 30000,
      },
    },
    // Expose top-level fields the gateway adapter expects
    url: meepachatCfg.url.replace(/\/+$/, ""),
    token: meepachatCfg.token,
  };
}

function parseTarget(
  to: string,
  gateway: MeepaChatGateway
): { serverId: string; channelId: string; threadId?: string } {
  const target = to.replace(/^meepachat:/, "");
  const parts = target.split(":");

  if (parts.length >= 4 && parts[2] === "thread") {
    return { serverId: parts[0], channelId: parts[1], threadId: parts[3] };
  }

  if (parts.length >= 2) {
    return { serverId: parts[0], channelId: parts[1] };
  }

  const channelId = parts[0];
  if (channelId.startsWith("dm-")) {
    return { serverId: "", channelId };
  }

  const info = gateway.getChannelInfo(channelId);
  if (!info) {
    throw new Error(`Unknown channel: ${channelId}`);
  }
  return { serverId: info.serverId, channelId };
}

export const meepachatChannelPlugin: ChannelPlugin = {
  id: "meepachat",
  meta: {
    id: "meepachat",
    label: "MeepaChat",
    selectionLabel: "MeepaChat",
    docsPath: "/channels/meepachat",
    docsLabel: "meepachat",
    blurb: "Connect to MeepaChat via bot tokens.",
    aliases: ["meep", "chat"],
    order: 70,
  },
  capabilities: {
    chatTypes: ["channel", "thread"] as const,
  },
  reload: { configPrefixes: ["channels.meepachat"] },
  configSchema: {
    safeParse: (data: unknown) => ({ success: true as const, data }),
    jsonSchema: MeepaChatConfigJsonSchema,
  },
  onboarding: meepachatOnboardingAdapter,
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID ?? "default",
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "meepachat",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "meepachat",
        accountId,
        clearBaseFields: ["token", "url"],
      }),
    isConfigured: (account: any) =>
      isMeepaChatConfigured(account.token, account.url),
    describeAccount: (account: any) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: isMeepaChatConfigured(account.token, account.url),
      url: account.url,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    validateInput: ({ input }) => {
      const token = input.token ?? input.botToken;
      const url = input.url ?? input.httpUrl;
      if (!token && !url) {
        return "MeepaChat requires --token and --url.";
      }
      if (!token) {
        return "MeepaChat requires --token (bot token from MeepaChat bot management).";
      }
      if (!url) {
        return "MeepaChat requires --url (your MeepaChat server URL).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, input }) => {
      const token = (input.token ?? input.botToken)?.trim();
      const url = (input.url ?? input.httpUrl)?.trim()?.replace(/\/+$/, "");

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          meepachat: {
            ...cfg.channels?.meepachat,
            enabled: true,
            ...(token ? { token } : {}),
            ...(url ? { url } : {}),
          },
        },
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID ?? "default",
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    probeAccount: async ({
      account,
    }: {
      account: any;
      timeoutMs: number;
      cfg: any;
    }) => {
      const token = account.token?.trim();
      const url = account.url?.trim();
      if (!token || !url) {
        return { ok: false, error: "token or url missing" };
      }
      try {
        const httpClient = new MeepaChatHttpClient(url, token, {
          tlsVerify: account.config?.tlsVerify,
        });
        const servers = await httpClient.listServers();
        return { ok: true, serverCount: servers.length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
    buildAccountSnapshot: ({
      account,
      runtime,
      probe,
    }: {
      account: any;
      runtime?: any;
      probe?: any;
      cfg: any;
    }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: isMeepaChatConfigured(account.token, account.url),
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastDisconnect: runtime?.lastDisconnect ?? null,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
    }),
    buildChannelSummary: ({ snapshot }: { snapshot: any }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
  },
  messaging: {
    targetResolver: {
      looksLikeId: (raw: string) =>
        /^meepachat:[0-9a-f-]+:[0-9a-f-]+(?::thread:[0-9a-f-]+)?$/i.test(raw),
      hint: "Use a channel name or meepachat:<serverId>:<channelId>",
    },
  },
  outbound: {
    deliveryMode: "direct" as const,
    textChunkLimit: 4000,
    sendText: async (ctx) => {
      const accountId = ctx.accountId ?? DEFAULT_ACCOUNT_ID ?? "default";
      const conn = connections.get(accountId);
      if (!conn) {
        throw new Error("Not connected to MeepaChat");
      }

      const { serverId, channelId, threadId } = parseTarget(
        ctx.to,
        conn.gateway
      );

      const message = await conn.httpClient.sendMessage(
        serverId,
        channelId,
        ctx.text,
        threadId
      );

      return {
        channel: "meepachat" as const,
        messageId: message.id,
        channelId: message.channelId,
        timestamp: new Date(message.createdAt).getTime(),
      };
    },
    sendMedia: async (ctx) => {
      const accountId = ctx.accountId ?? DEFAULT_ACCOUNT_ID ?? "default";
      const conn = connections.get(accountId);
      if (!conn) {
        throw new Error("Not connected to MeepaChat");
      }

      const { serverId, channelId, threadId } = parseTarget(
        ctx.to,
        conn.gateway
      );

      // Collect media URLs
      const urls: string[] = [];
      if (ctx.mediaUrl) urls.push(ctx.mediaUrl);
      if (ctx.mediaUrls) urls.push(...ctx.mediaUrls);

      // Upload all media in parallel (failed uploads don't block text)
      const results = await Promise.allSettled(
        urls.map((url) => conn.httpClient.uploadMediaFromUrl(url))
      );
      for (const r of results) {
        if (r.status === "rejected") {
          console.warn(`[meepachat] media upload failed: ${r.reason}`);
        }
      }
      const uploadIds = results
        .filter(
          (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
        )
        .map((r) => r.value);

      const message = await conn.httpClient.sendMessage(
        serverId,
        channelId,
        ctx.text ?? "",
        threadId,
        uploadIds.length > 0 ? uploadIds : undefined
      );

      return {
        channel: "meepachat" as const,
        messageId: message.id,
        channelId: message.channelId,
        timestamp: new Date(message.createdAt).getTime(),
      };
    },
  },
  directory: {
    listGroups: async (params) => {
      const accountId = params.accountId ?? DEFAULT_ACCOUNT_ID ?? "default";
      const conn = connections.get(accountId);
      if (!conn) {
        return [];
      }

      if (!conn.gateway.bot) {
        return [];
      }

      const entries: Array<{
        id: string;
        kind: "group";
        name: string;
        label: string;
        note: string;
      }> = [];

      const servers = await conn.httpClient.listServers();

      for (const server of servers) {
        const channels = await conn.httpClient.listChannels(server.id);

        for (const channel of channels) {
          const channelName = channel.displayName || channel.name;

          if (params.query) {
            const query = params.query.toLowerCase();
            const matchesName = channelName.toLowerCase().includes(query);
            const matchesServer = server.name.toLowerCase().includes(query);
            if (!matchesName && !matchesServer) {
              continue;
            }
          }

          entries.push({
            id: `meepachat:${server.id}:${channel.id}`,
            kind: "group" as const,
            name: channelName,
            label: `#${channelName}`,
            note: server.name,
          });

          if (params.limit && entries.length >= params.limit) {
            return entries;
          }
        }
      }

      return entries;
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const config = account.config as MeepaChatConfig;
      const accountId =
        ctx.accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID ?? "default";

      ctx.log?.info(`[${accountId}] starting channel`);
      ctx.setStatus({
        accountId,
        running: true,
        lastStartAt: Date.now(),
      });

      const httpClient = new MeepaChatHttpClient(config.url, config.token, {
        tlsVerify: config.tlsVerify,
      });

      const gateway = new MeepaChatGateway(
        config.url,
        config.token,
        config.retry ?? { attempts: 5, minDelayMs: 1000, maxDelayMs: 30000 },
        config.tlsVerify ?? true
      );

      gateway.on("ready", (data) => {
        const serverCount = data.servers.length;
        const channelCount = data.servers.reduce(
          (sum, s) => sum + s.channels.length,
          0
        );
        ctx.log?.info(
          `Bot "${data.user.displayName}" ready — ` +
            `${serverCount} server(s), ${channelCount} channel(s)`
        );
        ctx.setStatus({
          accountId,
          running: true,
          connected: true,
          lastConnectedAt: Date.now(),
        });
      });

      gateway.on("message", async (msg: MeepaChatMessage) => {
        const bot = gateway.bot;
        if (!bot) return;

        const info = gateway.getChannelInfo(msg.channelId);

        // Unknown channel — treat as DM (server channels are always in the ready payload)
        if (!info) {
          const dmLookup: ChannelLookup = {
            serverId: "",
            serverName: "",
            channel: {
              id: msg.channelId,
              name: msg.channelId,
              displayName: dmDisplayName(msg),
              isDm: true,
              isPrivate: false,
              serverId: null,
              topic: null,
            },
          };

          if (!shouldProcessMessage(msg, bot, dmLookup, config)) {
            return;
          }

          try {
            await handleMeepaChatInbound({
              message: msg,
              serverId: "",
              serverName: "",
              channelId: msg.channelId,
              channelName: dmDisplayName(msg),
              config,
              fullConfig: ctx.cfg,
              accountId,
              httpClient,
              botUserId: bot.id,
              sendTyping: (chId) => gateway.sendTyping(chId),
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            ctx.log?.warn(`inbound DM handler error: ${errMsg}`);
          }
          return;
        }

        // Detect DM from channel info (when DM channels are in the ready payload)
        const isDM = info.channel.isDm || !info.serverId;

        // Handle all messages (server channels and DMs)
        const lookup: ChannelLookup = {
          serverId: isDM ? "" : info.serverId,
          serverName: isDM ? "" : info.serverName,
          channel: info.channel,
        };

        if (!shouldProcessMessage(msg, bot, lookup, config)) {
          return;
        }

        const channelName = isDM
          ? dmDisplayName(msg)
          : info.channel.displayName || info.channel.name;

        try {
          await handleMeepaChatInbound({
            message: msg,
            serverId: isDM ? "" : info.serverId,
            serverName: isDM ? "" : info.serverName,
            channelId: msg.channelId,
            channelName,
            config,
            fullConfig: ctx.cfg,
            accountId,
            httpClient,
            botUserId: bot.id,
            sendTyping: (chId) => gateway.sendTyping(chId),
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          ctx.log?.warn(`inbound handler error: ${errMsg}`);
        }
      });

      gateway.on("error", (err) => {
        ctx.log?.warn(`gateway error: ${err.message}`);
        ctx.setStatus({ accountId, lastError: err.message });
      });

      gateway.on("connected", () => {
        ctx.log?.info(`connected to ${config.url}`);
      });

      gateway.on("disconnected", () => {
        ctx.log?.info("disconnected, will attempt reconnect...");
        ctx.setStatus({
          accountId,
          running: true,
          connected: false,
          lastDisconnect: Date.now(),
        });
      });

      connections.set(accountId, { gateway, httpClient });

      // Handle abort signal for clean shutdown
      ctx.abortSignal?.addEventListener(
        "abort",
        () => {
          gateway.disconnect();
          connections.delete(accountId);
          ctx.setStatus({
            accountId,
            running: false,
            connected: false,
            lastStopAt: Date.now(),
          });
          ctx.log?.info("deactivated");
        },
        { once: true }
      );

      gateway.connect();
    },
  },
};
