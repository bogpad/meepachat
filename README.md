<p align="center">
    <img src="https://raw.githubusercontent.com/bogpad/meepachat/main/icon-512.png" width="200" alt="MeepaChat" />
    <br><br>
    <b>Self-hosted team chat.</b><br>
    Go + React. Deploy anywhere. Own your data.
    <br><br>
    <a href="https://github.com/bogpad/meepachat/releases"><img src="https://img.shields.io/github/v/release/bogpad/meepachat?style=flat-square" alt="Latest Release"></a>
    <a href="https://github.com/bogpad/meepa/actions/workflows/meepachat-release.yml"><img src="https://img.shields.io/github/actions/workflow/status/bogpad/meepa/meepachat-release.yml?style=flat-square&label=build" alt="Build Status"></a>
    <a href="https://github.com/bogpad/meepa/blob/main/LICENSE"><img src="https://img.shields.io/github/license/bogpad/meepa?style=flat-square" alt="License"></a>
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

### Cloud-Init (Recommended)

The fastest way to deploy. Works with **any provider that supports cloud-init** — DigitalOcean, Hetzner, Linode, Vultr, AWS, GCP, Azure, and others.

The cloud-init script installs Docker, downloads MeepaChat, runs `meepachat init --yes` to bootstrap all services (Postgres, Redis, MinIO, Zitadel), and creates a systemd service. Your server is ready when boot completes.

**Script URL:** `https://meepachat.bogpad.io/cloud-init.sh`

<details>
<summary>DigitalOcean</summary>

```bash
doctl compute droplet create meepachat \
  --region nyc1 --size s-2vcpu-4gb --image ubuntu-24-04-x64 \
  --ssh-keys <YOUR_KEY_ID> \
  --user-data "$(curl -sfL https://meepachat.bogpad.io/cloud-init.sh)" \
  --wait
```
</details>

<details>
<summary>Hetzner</summary>

```bash
hcloud server create --name meepachat \
  --type cx23 --image ubuntu-24.04 \
  --ssh-key <YOUR_KEY_NAME> \
  --user-data-from-file <(curl -sfL https://meepachat.bogpad.io/cloud-init.sh)
```
</details>

<details>
<summary>Any provider (manual paste)</summary>

Most providers have a "User data" or "Cloud-init" field in their server creation UI. Paste the contents of the script:

```bash
curl -sfL https://meepachat.bogpad.io/cloud-init.sh
```
</details>

After boot, access MeepaChat at `http://<server-ip>:8091`.

### Manual Install

On a fresh Ubuntu server:

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Install MeepaChat
curl -fsSL https://meepachat.bogpad.io/install.sh | sh

# 3. Set up infrastructure (Postgres, Redis, MinIO, Zitadel)
meepachat init --yes

# 4. Start the server
meepachat
```

To run as a background service:

```bash
cat > /etc/systemd/system/meepachat.service << EOF
[Unit]
Description=MeepaChat Server
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/meepachat
Environment=MEEPA_CONFIG_PATH=/root/.meepachat/config.yaml
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now meepachat
```

Then access at `http://<your-server-ip>:8091`.

## Manage Services

```bash
meepachat deps status    # Show service status
meepachat deps stop      # Stop services
meepachat deps start     # Restart services
meepachat deps reset     # Stop and delete all data
```

## OpenClaw Integration

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
meepachat deps reset
sudo rm /usr/local/bin/meepachat
```

## Links

- [Documentation](https://github.com/bogpad/meepa/blob/main/meepachat/README.md)
- [Homebrew Tap](https://github.com/bogpad/homebrew-tap)
