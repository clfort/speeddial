# SpeedDial

A tiny self-hosted start page: big icons for the web apps you use every day,
your own background, the local time and the weather. Nothing else.

- **Add a shortcut in one step:** click **+** (or press `N`), paste the address.
  The name and icon fill in automatically; pick another icon, upload one,
  paste an image from the clipboard, use an image URL, or use a letter.
- **Free icon search:** in the add/edit dialog click *Search free icons* and
  type a word (e.g. "shipping"). Results come from [Iconify](https://iconify.design/)
  (200k+ open-source icons, no account); one-color icons can be tinted.
- **Top line:** a random quote (click it for another), or "Good evening, Carlos",
  or nothing. Edit the quote list and your name in settings, or give a page its
  own title (e.g. "Work") instead.
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

## Install from the prebuilt image

Every push to `main` publishes the image to GitHub Container Registry
(amd64 and arm64). On any Docker host, save
[`deploy/docker-compose.yml`](deploy/docker-compose.yml) as
`/opt/speeddial/docker-compose.yml`, replace `<github-user>` with the owner of
this repository, and run:

```bash
docker compose up -d
```

Open `http://<server-ip>:8090`. Update with
`docker compose pull && docker compose up -d`.

## Build from source

```bash
git clone https://github.com/<github-user>/speeddial.git /opt/speeddial
cd /opt/speeddial
docker compose up -d --build
```

To use another port, create `.env` from `.env.example` and set
`SPEEDDIAL_PORT=8095`, then `docker compose up -d`.

**Logs:** `docker compose logs -f`
**Backup:** copy the `data` folder next to the compose file.

## Install with Claude Code

Paste this into Claude Code on the machine that will host it (replace
`<github-user>`):

> Install SpeedDial into /opt/speeddial using the image
> `ghcr.io/<github-user>/speeddial:latest`: put the compose file from
> https://github.com/<github-user>/speeddial/blob/main/deploy/docker-compose.yml
> there (with the image name filled in). Make sure Docker and the Docker Compose
> plugin are installed. Check that port 8090 is free (`ss -ltnp`); if it is
> taken, pick the next free port and change the left side of the port mapping.
> Run `docker compose up -d`, wait until the container is healthy, confirm
> `curl http://localhost:<port>/api/health` returns `{"ok":true}`, and tell me
> the URL to open from another computer on my network. Do not touch other
> containers.

## Develop without Docker

```bash
npm install
npm run dev          # http://localhost:8090, data in ./data
```

Node 20+. Settings via env: `PORT`, `DATA_DIR`, `BASIC_AUTH`, `ICONIFY_API` (default `https://api.iconify.design`).

Keyboard: `1`–`9` switch pages, `N` adds a shortcut, `/` focuses search, `Esc` closes menus.
