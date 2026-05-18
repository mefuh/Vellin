# Deploy Vellin to a production server

Target: Ubuntu 24.04 LTS+ VPS with public IPv4, a domain you control (e.g. `vellin.ru`), and root access.

## 1. DNS

Point both records at the VPS public IP. TTL ≤ 5 minutes while you test.

```
vellin.ru.        A     <SERVER_IP>
www.vellin.ru.    A     <SERVER_IP>
```

Verify propagation before continuing — Let's Encrypt will fail otherwise:

```bash
dig +short vellin.ru
dig +short www.vellin.ru
```

## 2. First login & hardening

```bash
ssh root@<SERVER_IP>

# Create a dedicated non-root user (recommended; the rest of the guide also
# works as root, just drop the `sudo`s).
adduser --gecos '' vellin
usermod -aG sudo vellin

# Copy your SSH key for the new user so password auth can be disabled.
mkdir -p /home/vellin/.ssh
cp ~/.ssh/authorized_keys /home/vellin/.ssh/
chown -R vellin:vellin /home/vellin/.ssh
chmod 700 /home/vellin/.ssh && chmod 600 /home/vellin/.ssh/authorized_keys

# Disable root password login (only key auth from now on).
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```

Open a *new* terminal and confirm you can still log in (as `vellin` with key) — only then close the original root session.

## 3. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp   # HTTP/3 (QUIC)
sudo ufw --force enable
sudo ufw status
```

## 4. Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Let the vellin user run docker without sudo.
sudo usermod -aG docker vellin
newgrp docker   # apply group membership in current shell
docker run --rm hello-world   # smoke test
```

## 5. Clone the repo

```bash
cd /opt
sudo mkdir vellin && sudo chown vellin:vellin vellin
cd vellin
git clone https://github.com/mefuh/Vellin.git .
git checkout main
```

For a private repo: either configure an SSH deploy key (`ssh-keygen -t ed25519 -C 'vellin-deploy'`, add public half to GitHub → repo Settings → Deploy keys) or use a fine-grained PAT.

## 6. Production env

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in:

| Var | Value |
|---|---|
| `DOMAIN` | `vellin.ru` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `DB_PASSWORD` | `openssl rand -base64 24` |

The file is in `.gitignore` and will never get committed.

## 7. Bring the stack up

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

What this does:
- Builds the server image (Node 20 + yt-dlp + ffmpeg + Prisma client).
- Builds the Caddy image (multi-stage: builds the SPA, copies it into the Caddy container).
- Starts Postgres on an internal network (no published port).
- Server entrypoint runs `prisma migrate deploy` then starts the API.
- Caddy listens on 80/443 and provisions Let's Encrypt certificates on first request to `vellin.ru` (this is why DNS must be live before step 7).

First boot takes 1–3 minutes for builds and another 10–30 seconds for cert issuance. Watch logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## 8. Smoke-test

```bash
curl -I https://vellin.ru/                    # 200, Caddy serves SPA
curl -I https://vellin.ru/api/rooms           # 401 (no auth) — endpoint reachable
curl -I https://www.vellin.ru/                # 301 → https://vellin.ru/
```

Open https://vellin.ru in a browser, register a user, create a room, try a YouTube link in two tabs.

## 9. Updates

```bash
cd /opt/vellin
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker image prune -f
```

Migrations apply on container start (Prisma `migrate deploy` is idempotent). Database survives because of the `pgdata` named volume.

## 10. Backups

Postgres lives in the `pgdata` volume. Daily dump:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U vellin vellin | gzip > /opt/vellin/backups/vellin-$(date +%F).sql.gz
```

Stick that in a cron job and ship the directory to off-server storage (B2/S3/restic) on whatever cadence you need.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `caddy` log: `no IP addresses found for ...` | DNS not propagated. Re-check `dig`. |
| `caddy` log: `acme: authorization failed` | Ports 80/443 firewalled or another process is on them. `sudo ss -tlnp \| grep -E ':80\|:443'`. |
| `server` log: `Failed to load environment` | Missing variable in `.env.production`. |
| `server` log: `yt-dlp spawn failed` | Image rebuild needed — `docker compose ... build server`. |
| 502 on `/api/*` | Server crashed; `docker compose ... logs server`. |
