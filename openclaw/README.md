# meepachat (OpenClaw channel plugin)

OpenClaw channel plugin for [MeepaChat](https://github.com/bogpad/meepachat). Works with [meepachat.ai](https://meepachat.ai) (cloud) or self-hosted instances.

Connects OpenClaw to your MeepaChat instance via the Bot Gateway WebSocket (inbound) and REST API (outbound).

## Install

```bash
openclaw plugins install @meepa/meepachat-openclaw
openclaw doctor --fix
```

## Setup

### 1. Create a bot in MeepaChat

In your MeepaChat instance, go to **Server Settings → Bots → Create Bot**. Copy the bot token.

### 2. Configure OpenClaw

Add to your OpenClaw `config.json5`:

```json5
{
  channels: {
    meepachat: {
      enabled: true,
      url: "https://chat.example.com", // your MeepaChat instance URL
      token: "bot-uuid.secret-token", // or "$MEEPCHAT_BOT_TOKEN"
      tlsVerify: true, // set false for self-signed certs
    },
  },
}
```

### 3. Start the gateway

```bash
openclaw gateway start
```

## How it works

**Inbound**: Connects to MeepaChat's Bot Gateway WebSocket at `/api/bot-gateway`. Receives `message.created`, `message.updated`, `message.deleted`, and `reaction.sync` events in real time from both server channels and DMs.

**Outbound**: Sends messages via MeepaChat's REST API using `Authorization: Bot <token>`. Supports:

- Server channel messages: `POST /api/servers/{serverId}/channels/{channelId}/messages`
- DM messages: `POST /api/dms/{channelId}/messages`
- Thread replies (both server channels and DMs)

**DM Support**: The bot automatically handles direct messages. When a user sends a DM to the bot, OpenClaw treats it as a `direct` chat type and routes it to the configured agent. No special configuration needed.

## Network setup

The plugin needs network access to your MeepaChat instance. Common setups:

| Setup          | URL                        | Notes                   |
| -------------- | -------------------------- | ----------------------- |
| Same machine   | `http://localhost:8091`    | No TLS needed           |
| Local network  | `http://192.168.x.x:8091`  | Use IP or local DNS     |
| Tailscale      | `https://chat.myhost`      | Both hosts on Tailscale |
| Public domain  | `https://chat.example.com` | Valid TLS cert required |
| Docker network | `http://meepachat:8091`      | Same compose stack      |

For self-signed certificates, set `tlsVerify: false` in the config.

## Testing

### Test server channel messages

1. In MeepaChat, navigate to a server channel where the bot is a member
2. Send a message mentioning the bot or just chat normally
3. The bot should respond via OpenClaw

### Test DM messages

1. In MeepaChat, open a DM with the bot user
2. Send any message to the bot
3. The bot should respond as it would in a server channel

OpenClaw logs will show:

```
[meepachat] Bot "MyBot" ready — 1 server(s), 3 channel(s)
[meepachat] connected to http://localhost:8091
```

When you send a DM, you'll see the bot process it and respond.

### Verify gateway connection

Check that the bot is receiving messages:

```bash
# Check OpenClaw gateway logs
openclaw gateway logs
```

You should see the bot connected with the correct number of channels.

## Working openclaw.json config

This is the full `~/.openclaw/openclaw.json` structure that works with this plugin. Replace placeholders with your own values.

```json
{
  "channels": {
    "meepachat": {
      "enabled": true,
      "url": "https://chat.example.com",
      "token": "YOUR_BOT_TOKEN"
      // "tlsVerify": false
    }
  },
  "plugins": {
    "entries": {
      "meepachat-openclaw": {
        "enabled": true
      }
    },
  }
}
```


