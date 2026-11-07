# SpeedDial

A tiny self-hosted start page: big icons for the web apps you use every day,
your own background, the local time and the weather. Nothing else.

- **Add a shortcut in one step:** click **+** (or press `N`), paste the address.
  The name and icon fill in automatically; pick another icon, upload one,
  paste an image from the clipboard, use an image URL, or use a letter.
- **Edit / delete / move:** hover a shortcut and click **⋯**, or right-click it
  (long-press on a phone). Drag icons to reorder them, or drop one on a page tab
  to move it there.
- **Pages:** *Personal* and *Office* to start. Click a tab (or press `1`, `2`…)
  to switch, **+** to add one, right-click a tab to rename, reorder or delete it.
  Each page has its own address (`/#personal`, `/#office`) so you can set either
  as your browser's home page.
- **Background:** settings button (bottom right) → upload an image or paste a URL,
  for all pages or just the current one, with a "darken" slider.
- **Weather:** [Open-Meteo](https://open-meteo.com/), no API key. Winnipeg by
  default; change the city in settings. Click the temperature for a 5-day forecast.
- **Backup:** settings → *Download backup* / *Restore backup* (one JSON file).

Icons are looked up from the
[dashboard-icons](https://github.com/homarr-labs/dashboard-icons) set (great for
Proxmox, AdGuard, Jellyfin…), the site's own icons, and a favicon service, then
saved locally so the page keeps working offline. Self-signed HTTPS (Proxmox,
routers, NAS) is fine.

Everything is stored in `./data` (`speeddial.json` plus `uploads/`).

## Run it with Docker (Ubuntu, plain HTTP)

```bash
sudo git clone https://github.com/clfort/speeddial.git /opt/speeddial
cd /opt/speeddial
sudo docker compose up -d --build
```

Open `http://<server-ip>:8090`.

To use another port, create `.env` from `.env.example` and set
`SPEEDDIAL_PORT=8095`, then `sudo docker compose up -d`.

**Update:** `cd /opt/speeddial && sudo git pull && sudo docker compose up -d --build`
**Logs:** `sudo docker compose logs -f`
**Backup:** copy `/opt/speeddial/data`.

## Oracle Cloud VPS

Same commands as above, plus:

1. Set a password, since the VPS is on the internet: in `/opt/speeddial/.env` put
   `BASIC_AUTH=carlos:<a long password>`, then `sudo docker compose up -d`.
2. Open the port in **two** places: the VCN Security List (or NSG) ingress rule
   for TCP 8090, and the instance firewall. Oracle's Ubuntu images block ports
   with iptables by default:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8090 -j ACCEPT
   sudo netfilter-persistent save
   ```
3. Better: don't open 8090 publicly; put it behind your existing reverse proxy
   (Nginx Proxy Manager) with HTTPS, or reach it over Tailscale/VPN only.

Basic auth over plain HTTP sends the password unencrypted, so on a VPS use it
with HTTPS from the reverse proxy.

## Install with Claude Code

Paste this into Claude Code on the machine that will host it:

> Install SpeedDial from https://github.com/clfort/speeddial into /opt/speeddial
> (the folder may already exist and be empty; if so clone into it with
> `git clone https://github.com/clfort/speeddial.git .`). Make sure Docker and the
> Docker Compose plugin are installed. Check that port 8090 is free (`ss -ltnp`);
> if it is taken, pick the next free port and set `SPEEDDIAL_PORT` in
> /opt/speeddial/.env (copy .env.example). Run `docker compose up -d --build`,
> wait until `docker ps` shows the container healthy, confirm
> `curl http://localhost:<port>/api/health` returns `{"ok":true}`, and tell me the
> URL to open from another computer on my network. Do not touch other
> containers.

For the Oracle VPS, add:

> This is a public Oracle Cloud VPS. Generate a strong password and set
> `BASIC_AUTH=carlos:<password>` in /opt/speeddial/.env before starting, and
> show me the password. If Nginx Proxy Manager or another reverse proxy is
> running here, tell me how to add a proxy host for SpeedDial instead of
> opening the port; otherwise open TCP <port> in iptables (persisted with
> netfilter-persistent) and remind me to add the ingress rule in the Oracle VCN
> Security List.

## Develop without Docker

```bash
npm install
npm run dev          # http://localhost:8090, data in ./data
```

Node 20+. Settings via env: `PORT`, `DATA_DIR`, `BASIC_AUTH`.

Keyboard: `1`–`9` switch pages, `N` adds a shortcut, `/` focuses search, `Esc` closes menus.
