# Docker and Cloudflare Tunnel hosting

For a local browser without a public domain, use the [Node or Docker quick start](../README.md#run-locally-with-docker).
Cloudflare Tunnel is optional and only needed for this hosting arrangement.

Create a tunnel in your Cloudflare account, copy
`deploy/cloudflared.example.yml` to `deploy/cloudflared.yml`, and replace its
tunnel ID and example hostname. Set `PUBLIC_ORIGIN=https://your-hostname` in
`.env`, then route your hostname to that tunnel. The actual tunnel config and
Cloudflare credential file are local deployment files and are ignored by Git.

This Compose project is `graal-browser`, separate from other services.
Its client port is bound to loopback only; its own Cloudflare Tunnel reaches it
over the project’s private Docker network. Both containers restart automatically.

## Install

On a Linux host with Docker Compose (the supplied container configuration uses UID/GID 1000):

```sh
git clone https://github.com/Ec1ipseCmd/graal-browser.git
cd graal-browser
mkdir -p browser/.cache/cloudflared
chmod 700 browser/.cache/cloudflared
cp .env.example .env
cp deploy/cloudflared.example.yml deploy/cloudflared.yml
```

Copy your private tunnel credential JSON into
`browser/.cache/cloudflared/tunnel.json` and set its permissions to `600`.
This file must never be committed.

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 client tunnel
```

The hostname is available to anyone who can reach your domain. Only allowlisted
browser resources, aggregate presence, and health endpoints are served. Browser
login storage remains on each user's device.

Use `.env` (copy `.env.example`) to set your public hostname and change the loopback port if needed.
`PUBLIC_ORIGIN` supplies the external HTTPS origin without trusting arbitrary
forwarding headers. Local health checks still use HTTP on loopback. Anonymous
presence cookies are marked Secure for the HTTPS hostname.

## Updates and rollback

```sh
git pull --ff-only
docker compose up -d --build
```

To roll back, check out a previously working commit and run the same Compose
command. Review security fixes before choosing a rollback revision.

## Saved logins and backups

Remembered logins are encrypted locally in each browser's IndexedDB, along with
a non-extractable Web Crypto key. They are not part of deployment backups and
cannot be listed by the site administrator. Clearing browser site data removes
them. Keep the same browser profile and HTTPS domain to retain saved logins,
controls, and volume across a hosting move. Moving from localhost to the public
domain requires entering and saving the login once for that separate origin.

Public game assets in `browser/.cache/public-assets` can be downloaded again;
they are optional in backups. Keep the tunnel credential separately backed up.
Do not run this same named tunnel simultaneously on two different hosts unless
both host the same up-to-date application and shared state.
