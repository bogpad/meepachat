import {
  createReplyPrefixOptions,
  createTypingCallbacks,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import { getMeepchatRuntime } from "./runtime";
import { MeepaChatHttpClient } from "./http-client";
import type { MeepaChatMessage, MeepaChatConfig } from "./types";

const CHANNEL_ID = "meepachat" as const;

export interface InboundContext {
  message: MeepaChatMessage;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  config: MeepaChatConfig;
  fullConfig: OpenClawConfig;
  accountId: string;
  httpClient: MeepaChatHttpClient;
  botUserId: string;
  sendTyping?: (channelId: string) => void;
}

export async function handleMeepaChatInbound(
  ctx: InboundContext
): Promise<void> {
  const core = getMeepchatRuntime();
  const {
    message,
    serverId,
    serverName,
    channelId,
    channelName,
    fullConfig,
    accountId,
    httpClient,
    botUserId,
  } = ctx;

  const rawBody = message.content?.trim() ?? "";
  const attachments = message.attachments ?? [];

  // Ignore own messages
  if (message.userId === botUserId) return;

  // Skip messages with no content and no attachments
  if (!rawBody && attachments.length === 0) return;

  // Download attachments and save to OpenClaw media store
  const mediaResults: Array<{ path: string; contentType?: string }> = [];
  for (const att of attachments) {
    try {
      const { data, mimeType } = await httpClient.downloadAttachment(att.storedPath);
      const saved = await core.channel.media.saveMediaBuffer(
        new Uint8Array(data),
        mimeType,
        "inbound",
        25 * 1024 * 1024
      );
      mediaResults.push(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[meepachat] failed to download attachment ${att.filename}: ${msg}`);
    }
  }

  const senderId = message.userId;
  const senderName =
    message.user?.displayName || message.user?.username || senderId;
  const threadId = message.threadId;

  // Detect if this is a DM
  const isDM = !serverId || channelId.startsWith("dm-");

  // Resolve agent routing
  const route = core.channel.routing.resolveAgentRoute({
    cfg: fullConfig,
    channel: CHANNEL_ID,
    accountId,
    peer: {
      kind: isDM ? ("direct" as const) : ("group" as const),
      id: channelId,
    },
  });

  // Build session key (include thread if present)
  const sessionKey = threadId
    ? `${route.sessionKey}:thread:${threadId}`
    : route.sessionKey;

  // Format inbound envelope
  const fromLabel = isDM
    ? `DM from ${senderName}`
    : `#${channelName} (${serverName})`;
  const envelopeOptions =
    core.channel.reply.resolveEnvelopeFormatOptions(fullConfig);
  const storePath = core.channel.session.resolveStorePath(
    fullConfig.session?.store,
    { agentId: route.agentId }
  );
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey,
  });

  // Use the first saved media path for MediaUrl/MediaPath context fields
  const mediaPaths = mediaResults.map((r) => r.path);
  const bodyText = rawBody || (mediaPaths.length > 0 ? "(media)" : "");

  const body = core.channel.reply.formatAgentEnvelope({
    channel: "MeepaChat",
    from: fromLabel,
    timestamp: message.createdAt
      ? new Date(message.createdAt).getTime()
      : Date.now(),
    previousTimestamp,
    envelope: envelopeOptions,
    body: bodyText,
  });

  // Build context payload
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    MediaUrl: mediaPaths[0],
    MediaPath: mediaPaths[0],
    From: `meepachat:channel:${channelId}`,
    To: isDM ? `meepachat:${channelId}` : `meepachat:${serverId}:${channelId}`,
    SessionKey: sessionKey,
    AccountId: accountId,
    ChatType: isDM ? ("direct" as const) : ("group" as const),
    ConversationLabel: fromLabel,
    SenderName: senderName,
    SenderId: senderId,
    GroupSubject: isDM ? undefined : channelName,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    WasMentioned: undefined, // TODO: mention detection
    MessageSid: message.id,
    MessageThreadId: threadId,
    Timestamp: message.createdAt
      ? new Date(message.createdAt).getTime()
      : Date.now(),
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: isDM
      ? `meepachat:${channelId}`
      : `meepachat:${serverId}:${channelId}`,
    CommandAuthorized: true,
  });

  // Record session
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? sessionKey,
    ctx: ctxPayload,
    onRecordError: (err: Error) => {
      console.error(`[meepachat] failed updating session meta: ${err.message}`);
    },
  });

  // Reply prefix options
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: fullConfig,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId,
  });

  // Set up typing indicator
  const typingCallbacks = ctx.sendTyping
    ? createTypingCallbacks({
        start: () => ctx.sendTyping!(channelId),
        onStartError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[meepachat] typing indicator failed: ${msg}`);
        },
      })
    : null;

  if (typingCallbacks) {
    await typingCallbacks.onReplyStart();
  }

  // Dispatch reply
  try {
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: fullConfig,
      dispatcherOptions: {
        ...prefixOptions,
        deliver: async (payload: {
          text?: string;
          mediaUrls?: string[];
          mediaUrl?: string;
        }) => {
          // Collect media URLs
          const urls: string[] = [];
          if (payload.mediaUrl) urls.push(payload.mediaUrl);
          if (payload.mediaUrls) urls.push(...payload.mediaUrls);

          // Upload media in parallel (failed uploads don't block text)
          let attachmentIds: string[] = [];
          if (urls.length > 0) {
            const results = await Promise.allSettled(
              urls.map((url) => httpClient.uploadMediaFromUrl(url))
            );
            attachmentIds = results
              .filter(
                (r): r is PromiseFulfilledResult<string> =>
                  r.status === "fulfilled"
              )
              .map((r) => r.value);
          }

          const text = payload.text ?? "";
          if (!text.trim() && attachmentIds.length === 0) return;

          await httpClient.sendMessage(
            serverId,
            channelId,
            text,
            threadId,
            attachmentIds.length > 0 ? attachmentIds : undefined
          );
        },
        onError: (err: Error, info: { kind: string }) => {
          console.error(`[meepachat] ${info.kind} reply failed: ${err.message}`);
        },
      },
      replyOptions: {
        onModelSelected,
      },
    });
  } finally {
    typingCallbacks?.onCleanup?.();
  }
}
