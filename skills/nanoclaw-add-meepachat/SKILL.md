---
name: add-meepachat
description: Add MeepaChat as a channel. Can run alongside WhatsApp or other channels. Connects to MeepaChat Bot Gateway via WebSocket for real-time messaging.
---

# Add MeepaChat Channel

This skill adds MeepaChat support to NanoClaw using the skills engine for deterministic code changes, then walks through interactive setup.

## What is MeepaChat?

MeepaChat is a self-hosted team communication platform similar to Slack/Discord. This integration uses the MeepaChat Bot Gateway (WebSocket API) to enable nano to respond to messages in MeepaChat channels and DMs.

## Known Issues

- **readEnvFile vs process.env** - This skill uses `readEnvFile()` from NanoClaw's config module instead of `process.env`. Under launchd (macOS), `process.env` is empty so credentials won't be found. Make sure your NanoClaw version exports `readEnvFile` from `src/config.ts`.
- **Bot message filtering** - The channel ignores messages from other bots (`message.user.bot === true`) to prevent bot spam loops in group chats.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `meepachat` is in `applied_skills`, skip to Phase 3 (Setup). The code changes are already in place.

### Ask the user

Use `AskUserQuestion` to collect configuration:

**Question 1:** Do you have a MeepaChat bot token, or do you need to create one?
- **I have a token** - Collect it now
- **Create new bot** - Guide them through bot creation

**Question 2:** What is your MeepaChat instance URL?
- Default: `https://chat.meepachat.ai`
- Custom: User provides their self-hosted instance URL

**Question 3:** Should the bot require a trigger (e.g. @nano) to respond, or respond to all messages?
- **Require trigger** - Bot only responds when @mentioned or when the message matches the trigger pattern
- **No trigger** (recommended) - Bot responds to every message in registered channels

If the user chooses "Require trigger", set `requireTrigger: true` in the channel config. Otherwise default to `requireTrigger: false`.

**Question 4:** Should the bot auto-subscribe to all channels it has access to?
- **Yes** (recommended) - Automatically register all channels the bot is a member of in `data/registered_groups.json`
- **No** - Only respond in manually registered channels

If the user chooses "Yes", after the bot connects and receives the `ready` event, iterate through all discovered channels and add any missing ones to `data/registered_groups.json` with the `mc:` prefix.

## Phase 2: Apply Code Changes

Run the skills engine to apply this skill's code package.

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-meepachat
```

This deterministically:
- Adds `src/channels/meepachat.ts` (MeepaChatChannel class implementing Channel interface)
- Adds `src/channels/meepachat.test.ts` (unit tests)
- Modifies `src/index.ts` to initialize MeepaChatChannel
- Modifies `src/config.ts` to add MEEPACHAT_BOT_TOKEN and MEEPACHAT_BASE_URL
- Updates routing tests

## Phase 3: Setup & Configuration

### Create a Bot (if needed)

Guide the user to create a bot in their MeepaChat instance:

1. Go to Server Settings → Bots → Create Bot
2. Name the bot (e.g., "nano")
3. Copy the bot token (format: `<bot_id>.<secret>`)
4. **Important:** Save the token immediately - it only shows once!
5. Add the bot to the desired server

Alternatively, via API:
```bash
curl -X POST https://your-instance.meepachat.ai/api/bots \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "nano"}'
```

### Configure Environment

**IMPORTANT: Never commit your bot token to version control!**

Add your bot token to `.env` (this file should be in `.gitignore`):

```bash
MEEPACHAT_BOT_TOKEN=your_bot_token_here
MEEPACHAT_BASE_URL=https://your-instance.meepachat.ai  # Or use cloud at https://chat.meepachat.ai
```

The bot token format is `<bot_id>.<secret>` and is shown only once when you create the bot. Store it securely:
- Add `.env` to `.gitignore` if not already present
- Consider using a secrets manager for production deployments
- Never share your token in public repositories or documentation

### Register Channels

Unlike WhatsApp/Telegram which use JIDs, MeepaChat uses channel IDs. The bot automatically discovers channels when it connects, but you need to register which ones nano should respond in.

The bot will see:
- All channels in servers where it's a member
- All DM channels opened with the bot

To register a channel for nano to respond in, you'll need the channel ID. Get it by:
1. Having the bot connect (it logs all discovered channels)
2. Or via API: `GET /api/servers/{serverID}/channels`

Then register in `data/registered_groups.json`:

```json
{
  "mc:6f9aef90-fe88-4521-9c35-92cc8b65b019": {
    "name": "MeepaChat #general",
    "folder": "meepachat-general",
    "trigger": "@nano",
    "platform": "meepachat",
    "added_at": "2026-03-07T00:00:00.000Z"
  }
}
```

Note: Channel JIDs are prefixed with `mc:` to distinguish from WhatsApp/Telegram.

## Phase 4: Test

### Start the bot

```bash
npm run dev
```

The bot should:
1. Connect to MeepaChat Bot Gateway
2. Log all discovered servers and channels
3. Listen for messages in registered channels
4. Respond when @mentioned or triggered

### Test messages

In MeepaChat:
1. Send a message with `@nano` in a registered channel
2. Send a DM to the bot
3. Verify nano responds with full intelligence

## Architecture

### Channel Interface

MeepaChat implements the standard `Channel` interface:

```typescript
interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, message: string): Promise<void>;
  disconnect(): Promise<void>;
}
```

### Message Flow

1. User sends message in MeepaChat
2. MeepaChat Bot Gateway sends `message.created` event via WebSocket
3. MeepaChatChannel receives event, checks if message is in registered channel
4. If triggered (contains @nano), forwards to routing system
5. Routing system processes with Claude API
6. Response sent back via MeepaChat REST API

### WebSocket Connection

- Endpoint: `GET /api/bot-gateway`
- Auth: `Authorization: Bot <token>` header
- Heartbeat: Ping every 30 seconds
- Reconnection: Exponential backoff (1-30 seconds)

### REST API

- Send messages: `POST /api/servers/{serverID}/channels/{channelID}/messages`
- Auth: Same bot token
- Rate limit: 240 requests/minute

## Troubleshooting

**Bot not receiving messages:**
- Check bot is member of the channel
- Verify bot token is valid
- Check WebSocket connection is established

**Bot responds twice:**
- Message deduplication is implemented via message ID tracking
- If still seeing duplicates, check logs for duplicate `message.created` events

**401 Unauthorized:**
- Bot token expired or invalid
- Regenerate token via `POST /api/bots/{botID}/regenerate-token`

## Next Steps

After successful setup:
1. Consider adding more channels
2. Configure channel-specific behavior in `groups/{folder}/CLAUDE.md`
3. Set up monitoring for bot uptime
