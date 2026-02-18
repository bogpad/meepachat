# MeepaChat

Self-hosted team chat. Go + React + Zitadel auth.

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

`meepachat init` pulls Docker images, bootstraps authentication (Zitadel), and writes config to `~/.config/meepa/config.yaml`. Requires Docker.

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
  --type cx22 --image ubuntu-24.04 \
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
Environment=MEEPA_CONFIG_PATH=/root/.config/meepa/config.yaml
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

## Uninstall

```bash
meepachat deps reset
sudo rm /usr/local/bin/meepachat
```

## Links

- [Documentation](https://github.com/bogpad/meepa/blob/main/meepachat/README.md)
- [Homebrew Tap](https://github.com/bogpad/homebrew-tap)
