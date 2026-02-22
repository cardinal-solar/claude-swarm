# EC2 Deployment Guide

Deploy claude-swarm on Amazon Linux 2 with Cloudflare Tunnel.

## Architecture

```
Browser -> swarm.tuodominio.com     -> Cloudflare Zero Trust (auth) -> tunnel -> EC2:3030
Vercel  -> api-swarm.tuodominio.com -> Cloudflare (bypass auth)     -> tunnel -> EC2:3030
```

## Prerequisites

- EC2 instance running Amazon Linux 2
- Docker image pushed: `npm run docker:release` (from local machine)
- Domain on Cloudflare

---

## 1. Install Docker

```bash
sudo yum update -y
sudo amazon-linux-extras install docker -y
sudo systemctl start docker && sudo systemctl enable docker
sudo usermod -aG docker ec2-user
exit  # re-login to apply group
```

## 2. Install docker-compose

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## 3. Start claude-swarm

```bash
docker login -u alfercom

mkdir -p ~/claude-swarm && cd ~/claude-swarm
```

Create `docker-compose.yml`:

```yaml
services:
  claude-swarm:
    image: alfercom/claude-swarm:latest
    ports:
      - "3030:3030"
    volumes:
      - swarm-data:/app/data
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3030/api/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3

volumes:
  swarm-data:
    driver: local
```

Create `.env`:

```bash
PORT=3030
HOST=0.0.0.0
LOG_LEVEL=info
MAX_CONCURRENCY=3
DEFAULT_TIMEOUT=1800000
DEFAULT_MODE=sdk
DATA_DIR=/app/data
```

Start:

```bash
docker-compose up -d
curl http://localhost:3030/api/health
```

---

## 4. Install cloudflared

```bash
curl -L --output cloudflared.rpm https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
sudo yum localinstall -y cloudflared.rpm
cloudflared --version
```

## 5. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

Opens a URL - open it in browser, select your domain. Certificate saved to `~/.cloudflared/cert.pem`.

## 6. Create the tunnel

```bash
cloudflared tunnel create claude-swarm
```

Note the **Tunnel ID** printed (e.g. `a1b2c3d4-...`). Credentials file saved to `~/.cloudflared/<TUNNEL_ID>.json`.

## 7. Configure DNS (two subdomains)

```bash
# Dashboard (protected by Zero Trust)
cloudflared tunnel route dns claude-swarm swarm.cardinal.solar

# API (bypass Zero Trust, callable from Vercel)
cloudflared tunnel route dns claude-swarm api-swarm.cardinal.solar
```

Replace `tuodominio.com` with your actual domain.

## 8. Create tunnel config

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Content:

```yaml
tunnel: 7d5105d3-2be8-4c27-a46a-c5676f380ef3
credentials-file: /home/ec2-user/.cloudflared/7d5105d3-2be8-4c27-a46a-c5676f380ef3.json

ingress:
  - hostname: swarm.cardinal.solar
    service: http://localhost:3030
  - hostname: api-swarm.cardinal.solar
    service: http://localhost:3030
  - service: http_status:404
```

Replace `<TUNNEL_ID>` with the ID from step 6.

## 9. Test the tunnel

```bash
cloudflared tunnel run claude-swarm
```

From another terminal:

```bash
curl https://swarm.cardinal.solar/api/health
curl https://api-swarm.cardinal.solar/api/health
```

If both respond, `Ctrl+C` to stop and proceed.

## 10. Install as systemd service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
sudo systemctl status cloudflared
```

## 11. Configure Zero Trust

Go to **https://one.dash.cloudflare.com** -> Access -> Applications:

**App 1 - Dashboard (protected):**
- Add an application -> Self-hosted
- Application domain: `swarm.cardinal.solar`
- Policy: configure your preferred auth method (email OTP, Google, etc.)

**App 2 - API (bypass):**
- Add an application -> Self-hosted
- Application domain: `api-swarm.cardinal.solar`
- Policy: Action = **Bypass**, Include = **Everyone**

---

## Calling the API from Vercel

```
https://api-swarm.tuodominio.com/api/tasks
https://api-swarm.tuodominio.com/api/health
```

Recommended: protect API calls with an `Authorization: Bearer <token>` header verified in Hono middleware.

---

## Updates

From local machine:

```bash
npm run docker:release
```

On EC2:

```bash
cd ~/claude-swarm
docker-compose pull && docker-compose up -d
```
