<p align="center">
    <img src="https://raw.githubusercontent.com/bogpad/meepachat/main/icon-512.png" width="200" alt="MeepaChat" />
    <br><br>
    <b>Self-hosted team chat.</b><br>
    Lightweight. Deploy anywhere. Own your data.
    <br><br>
    <a href="https://github.com/bogpad/meepachat/releases"><img src="https://img.shields.io/github/v/release/bogpad/meepachat?style=flat-square" alt="Latest Release"></a>
    <a href="https://formulae.brew.sh/formula/meepachat"><img src="https://img.shields.io/badge/homebrew-bogpad%2Ftap-orange?style=flat-square" alt="Homebrew"></a>
    <a href="https://github.com/bogpad/meepachat"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform"></a>
</p>

---

## Install

**macOS / Linux:**

```bash
curl -fsSL https://meepachat.bogpad.io/install.sh | sh
```

Or via Homebrew:

```bash
brew install bogpad/tap/meepachat
```

## Quick Start

```bash
meepachat init       # Set up Postgres, Redis, MinIO, Zitadel via Docker
meepachat            # Start server → http://localhost:8091
```

`meepachat init` pulls Docker images, bootstraps authentication (Zitadel), and writes config to `~/.meepachat/config.yaml`. Requires Docker.

## Deploy to a VPS

### DigitalOcean

One command — auto-detects SSH keys, waits for services to start:

```bash
bash <(curl -fsSL https://meepachat.bogpad.io/deploy-do.sh)
```

### Hetzner / Any Provider

Use cloud-init — paste as "User data" when creating a server:

```bash
curl -sfL https://meepachat.bogpad.io/cloud-init.sh
```

After boot (~5 min), open `http://<server-ip>:8091`. The first user to register becomes admin.

## Manage Services

```bash
meepachat status         # Show service status
meepachat stop           # Stop all services
meepachat restart        # Restart the server
meepachat logs           # Show infrastructure logs
meepachat reset          # Reset infrastructure
```

## Integrations

### MeepaGateway

Connect AI agents to MeepaChat using [MeepaGateway](https://github.com/bogpad/meepagateway). Agents can respond in server channels and DMs across MeepaChat, Discord, Slack, Telegram, and WhatsApp — all from a single gateway.

```bash
# Install MeepaGateway
curl -fsSL https://meepagateway.bogpad.io/install.sh | sh
meepagateway
```

On first run, the setup wizard walks you through connecting to MeepaChat:

1. **Create a bot** in MeepaChat: **Server Settings > Bots > Create Bot** and copy the token
2. **Add a MeepaChat connector** to your agent in `meepa.toml`:

```toml
[[agents]]
id = "my-agent"
name = "My Agent"

[[agents.connectors]]
name = "chat"
type = "meepachat"

[agents.connectors.meepachat]
url = "wss://chat.example.com/api/bot-gateway"
bot_token = "BOT_ID.BOT_SECRET"
```

Or configure via the **Captain Dashboard** at `http://localhost:8092`.

See [MeepaGateway docs](https://github.com/bogpad/meepagateway) for full setup, VPS deployment, and multi-platform configuration.

### OpenClaw

Connect [OpenClaw](https://openclaw.com) to MeepaChat so your AI agents can chat in your server channels and DMs.

```bash
# Install the plugin
openclaw plugins install meepachat-openclaw
```

### Setup

1. **Create a bot** in MeepaChat: go to **Server Settings > Bots > Create Bot** and copy the token

2. **Configure OpenClaw** — add to your `config.json5`:

```json5
{
  channels: {
    meepachat: {
      enabled: true,
      url: "https://chat.example.com", // your MeepaChat URL
      token: "bot-uuid.secret-token",  // from step 1
    },
  },
}
```

3. **Start the gateway:**

```bash
openclaw gateway start
```

Your bot will connect via WebSocket and respond to messages in configured channels and DMs.

See the [full plugin docs](https://github.com/bogpad/meepa/tree/main/meepachat/integrations/openclaw) for filtering by server/channel, reconnection settings, and self-hosted TLS configuration.

## Uninstall

```bash
meepachat reset --hard   # Stop services and wipe all data
sudo rm /usr/local/bin/meepachat
```

## Links

- [Documentation](https://github.com/bogpad/meepa/blob/main/meepachat/README.md)
- [Homebrew Tap](https://github.com/bogpad/homebrew-tap)
