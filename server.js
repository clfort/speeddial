// SpeedDial: a tiny self-hosted start page.
// One Express server, one JSON file and an uploads folder under DATA_DIR.
import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Agent } from 'undici';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8090);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOADS = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'speeddial.json');
const BASIC_AUTH = process.env.BASIC_AUTH || ''; // "user:password", optional
const ICONIFY_API = (process.env.ICONIFY_API || 'https://api.iconify.design').replace(/\/$/, '');

fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- storage ----------
const uid = () => crypto.randomBytes(6).toString('hex');

function defaultState() {
  return {
    settings: {
      city: 'Winnipeg',
      lat: 49.8954,
      lon: -97.1385,
      timezone: 'America/Winnipeg',
      units: 'celsius',     // or 'fahrenheit'
      clock24: false,
      showSeconds: false,
      showSearch: true,
      searchEngine: 'https://www.google.com/search?q=',
      background: '',       // '' = built-in gradient; '/uploads/x.jpg' or https://...
      dim: 25,              // 0-80, darkens the background for readable text
      tileSize: 72,
      newTab: false,
      userName: '',         // shown in the greeting: "Good evening, Carlos"
      showGreeting: true,
    },
    pages: [
      { id: 'personal', name: 'Personal', background: '', tiles: [] },
      { id: 'office', name: 'Office', background: '', tiles: [] },
    ],
  };
}

let state;
try {
  state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  state.settings = { ...defaultState().settings, ...state.settings };
  if (!Array.isArray(state.pages) || !state.pages.length) state.pages = defaultState().pages;
} catch {
  state = defaultState();
}

let saving = Promise.resolve();
function save() {
  // Serialize writes and write atomically so a crash never leaves half a file.
  saving = saving.then(async () => {
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
    await fsp.rename(tmp, DB_FILE);
  }).catch((e) => console.error('save failed', e));
  return saving;
}
if (!fs.existsSync(DB_FILE)) save();

const findPage = (id) => state.pages.find((p) => p.id === id);

// ---------- helpers ----------
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false }, headersTimeout: 8000, bodyTimeout: 8000 });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 SpeedDial';

// LAN apps (Proxmox, routers...) often use self-signed certs, so icon fetching ignores TLS errors.
async function get(url, { insecure = true, timeout = 8000 } = {}) {
  return fetch(url, {
    headers: { 'user-agent': UA, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
    ...(insecure ? { dispatcher: insecureAgent } : {}),
  });
}

const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/avif': 'avif' };

function sniffType(buf, declared) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  const head = buf.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  if (declared && declared.startsWith('image/') && IMG_EXT[declared]) return declared;
  return null;
}

async function fetchImage(url, opts) {
  const res = await get(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 50 || buf.length > 8 * 1024 * 1024) throw new Error('bad size');
  const type = sniffType(buf, (res.headers.get('content-type') || '').split(';')[0].trim());
  if (!type) throw new Error('not an image');
  return { buf, type };
}

async function storeImage(buf, type) {
  const name = `${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)}.${IMG_EXT[type] || 'img'}`;
  const file = path.join(UPLOADS, name);
  if (!fs.existsSync(file)) await fsp.writeFile(file, buf);
  return `/uploads/${name}`;
}

// "192.168.1.5:8006" or "proxmox:8006" or "gmail.com" -> add http://; keep real schemes.
const withScheme = (u) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(mailto|tel|file|data):/i.test(u) ? u : 'http://' + u);

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Icon candidates for a shortcut, best first. Each one is checked so the picker only shows real images.
async function iconCandidates(rawUrl, name) {
  let u;
  try { u = new URL(rawUrl); } catch { return []; }
  const origin = u.origin;
  const list = [];
  const add = (url, label) => { if (url && !list.some((c) => c.url === url)) list.push({ url, label }); };

  // 1. Curated app icons (great for self-hosted apps like Proxmox, AdGuard, Jellyfin).
  const names = new Set();
  for (const n of [name, name && name.replace(/\s*\d+$/, ''), u.hostname.replace(/^www\./, '').split('.')[0]]) {
    const s = slug(n);
    if (s && !/^\d+$/.test(s)) names.add(s);
  }
  for (const s of names) add(`https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${s}.png`, 'App icon');

  // 2. Icons declared by the site itself.
  try {
    const res = await get(u.href, { timeout: 6000 });
    const html = (await res.text()).slice(0, 300000);
    const base = res.url || u.href;
    const links = [];
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i) || [])[1] || '';
      if (!/icon/i.test(rel)) continue;
      const href = (tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
      if (!href) continue;
      const sizes = (tag.match(/\bsizes\s*=\s*["']?([^"'>]+)/i) || [])[1] || '';
      const px = Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0));
      const score = (/apple-touch/i.test(rel) ? 1000 : 0) + (/\.svg/i.test(href) ? 500 : 0) + px;
      try { links.push({ url: new URL(href.replace(/&amp;/g, '&'), base).href, score }); } catch { /* skip */ }
    }
    links.sort((a, b) => b.score - a.score).forEach((l) => add(l.url, 'Site icon'));
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)/i);
    if (og) try { add(new URL(og[1], base).href, 'Site image'); } catch { /* skip */ }
  } catch { /* site unreachable: fall back to guesses */ }

  // 3. Common locations and a public favicon service.
  add(`${origin}/apple-touch-icon.png`, 'Site icon');
  add(`${origin}/favicon.ico`, 'Favicon');
  if (!isPrivateHost(u.hostname)) add(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`, 'Favicon');

  const checked = await Promise.all(list.slice(0, 12).map(async (c) => {
    try { await fetchImage(c.url, { timeout: 5000 }); return c; } catch { return null; }
  }));
  return checked.filter(Boolean);
}

function isPrivateHost(h) {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(h) || !h.includes('.') || /\.(lan|local|home|internal)$/.test(h);
}

async function pageTitle(rawUrl) {
  try {
    const res = await get(rawUrl, { timeout: 5000 });
    const html = (await res.text()).slice(0, 200000);
    const t = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
    return t ? t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  } catch { return ''; }
}

// ---------- weather (Open-Meteo, no API key) ----------
let weatherCache = { key: '', at: 0, data: null };
async function getWeather() {
  const s = state.settings;
  const key = `${s.lat},${s.lon},${s.units}`;
  if (weatherCache.key === key && Date.now() - weatherCache.at < 10 * 60 * 1000) return weatherCache.data;
  const q = new URLSearchParams({
    latitude: s.lat, longitude: s.lon, timezone: 'auto', forecast_days: '6',
    temperature_unit: s.units === 'fahrenheit' ? 'fahrenheit' : 'celsius',
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = await res.json();
  const data = {
    city: s.city,
    units: s.units,
    current: {
      temp: j.current.temperature_2m, feels: j.current.apparent_temperature, code: j.current.weather_code,
      isDay: !!j.current.is_day, wind: j.current.wind_speed_10m, humidity: j.current.relative_humidity_2m,
    },
    daily: j.daily.time.map((d, i) => ({ date: d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i] })),
  };
  weatherCache = { key, at: Date.now(), data };
  return data;
}

// ---------- app ----------
const app = express();
app.disable('x-powered-by');

if (BASIC_AUTH) {
  app.use((req, res, next) => {
    const h = req.headers.authorization || '';
    const given = Buffer.from(h.replace(/^Basic\s+/i, ''), 'base64').toString();
    const a = Buffer.from(given), b = Buffer.from(BASIC_AUTH);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="SpeedDial"').status(401).send('Authentication required');
  });
}

app.use(express.json({ limit: '2mb' }));
// Uploaded SVGs are opened as images only; the sandbox stops any script inside one from running.
app.use('/uploads', (req, res, next) => { res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"); next(); },
  express.static(UPLOADS, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(e.status || 500).json({ error: e.message }));
const fail = (status, message) => Object.assign(new Error(message), { status });

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/state', (req, res) => res.json(state));

app.put('/api/settings', wrap(async (req, res) => {
  const allowed = Object.keys(defaultState().settings);
  for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) state.settings[k] = v;
  weatherCache.key = '';
  await save();
  res.json(state.settings);
}));

// Pages
app.post('/api/pages', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (!name) throw fail(400, 'Name required');
  const page = { id: slug(name) && !findPage(slug(name)) ? slug(name) : uid(), name, background: '', tiles: [] };
  state.pages.push(page);
  await save();
  res.json(page);
}));

app.put('/api/pages/:id', wrap(async (req, res) => {
  const page = findPage(req.params.id);
  if (!page) throw fail(404, 'Page not found');
  if (typeof req.body?.name === 'string' && req.body.name.trim()) page.name = req.body.name.trim().slice(0, 40);
  if (typeof req.body?.background === 'string') page.background = req.body.background;
  if (typeof req.body?.title === 'string') page.title = req.body.title.trim().slice(0, 80);
  await save();
  res.json(page);
}));

app.delete('/api/pages/:id', wrap(async (req, res) => {
  if (state.pages.length <= 1) throw fail(400, 'Keep at least one page');
  state.pages = state.pages.filter((p) => p.id !== req.params.id);
  await save();
  res.json({ ok: true });
}));

app.put('/api/pages-order', wrap(async (req, res) => {
  const ids = req.body?.ids || [];
  state.pages.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  await save();
  res.json({ ok: true });
}));

// Tiles
function cleanTile(body, tile = {}) {
  let url = String(body.url ?? tile.url ?? '').trim();
  if (url) url = withScheme(url);
  try { new URL(url); } catch { throw fail(400, 'Enter a valid web address'); }
  let name = String(body.name ?? tile.name ?? '').trim().slice(0, 40);
  if (!name) name = new URL(url).hostname.replace(/^www\./, '');
  return { id: tile.id || uid(), name, url, icon: String(body.icon ?? tile.icon ?? '') };
}

// Remote icons get downloaded once so the page never depends on the internet or mixed content.
async function localizeIcon(tile) {
  if (/^https?:\/\//i.test(tile.icon)) {
    try { const { buf, type } = await fetchImage(tile.icon); tile.icon = await storeImage(buf, type); } catch { /* keep remote URL */ }
  }
  return tile;
}

app.post('/api/pages/:id/tiles', wrap(async (req, res) => {
  const page = findPage(req.params.id);
  if (!page) throw fail(404, 'Page not found');
  const tile = await localizeIcon(cleanTile(req.body || {}));
  page.tiles.push(tile);
  await save();
  res.json(tile);
}));

app.put('/api/pages/:id/tiles/:tid', wrap(async (req, res) => {
  const page = findPage(req.params.id);
  const i = page ? page.tiles.findIndex((t) => t.id === req.params.tid) : -1;
  if (i < 0) throw fail(404, 'Shortcut not found');
  const tile = await localizeIcon(cleanTile(req.body || {}, page.tiles[i]));
  // Move to another page if asked.
  const target = req.body?.pageId && req.body.pageId !== page.id ? findPage(req.body.pageId) : null;
  if (target) { page.tiles.splice(i, 1); target.tiles.push(tile); } else page.tiles[i] = tile;
  await save();
  res.json(tile);
}));

app.delete('/api/pages/:id/tiles/:tid', wrap(async (req, res) => {
  const page = findPage(req.params.id);
  if (!page) throw fail(404, 'Page not found');
  page.tiles = page.tiles.filter((t) => t.id !== req.params.tid);
  await save();
  res.json({ ok: true });
}));

app.put('/api/pages/:id/order', wrap(async (req, res) => {
  const page = findPage(req.params.id);
  if (!page) throw fail(404, 'Page not found');
  const ids = req.body?.ids || [];
  page.tiles.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  await save();
  res.json({ ok: true });
}));

// Icons, uploads, page info
app.get('/api/lookup', wrap(async (req, res) => {
  const raw = String(req.query.url || '').trim();
  const url = withScheme(raw);
  try { new URL(url); } catch { throw fail(400, 'Bad URL'); }
  const [title, icons] = await Promise.all([req.query.title === '0' ? '' : pageTitle(url), iconCandidates(url, req.query.name)]);
  res.json({ title, icons });
}));

app.post('/api/upload', express.raw({ type: '*/*', limit: '15mb' }), wrap(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail(400, 'Empty upload');
  const type = sniffType(buf, req.headers['content-type']);
  if (!type) throw fail(400, 'That file is not an image');
  res.json({ url: await storeImage(buf, type) });
}));

app.post('/api/fetch-image', wrap(async (req, res) => {
  const { buf, type } = await fetchImage(String(req.body?.url || ''), { timeout: 10000 }).catch((e) => { throw fail(400, `Could not download image (${e.message})`); });
  res.json({ url: await storeImage(buf, type) });
}));

// Free icon search through Iconify (200k+ open-source icons, no API key).
const iconSearchCache = new Map();
app.get('/api/icon-search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json({ icons: [] });
  const key = q.toLowerCase();
  if (!iconSearchCache.has(key)) {
    const r = await fetch(`${ICONIFY_API}/search?${new URLSearchParams({ query: q, limit: '120' })}`, { signal: AbortSignal.timeout(8000) })
      .catch(() => { throw fail(502, 'Icon search is unavailable right now'); });
    if (!r.ok) throw fail(502, 'Icon search is unavailable right now');
    const j = await r.json();
    const names = (j.icons || []).filter((n) => /^[a-z0-9-]+:[a-z0-9-]+$/.test(n));
    // Full-color sets first: they look best on a white tile.
    const COLOR = /^(logos|skill-icons|devicon|vscode-icons|flat-color-icons|fluent-emoji-flat|fluent-color|noto|twemoji|emojione|openmoji|streamline-color|streamline-plump-color|material-icon-theme|catppuccin)$/;
    names.sort((a, b) => COLOR.test(b.split(':')[0]) - COLOR.test(a.split(':')[0]));
    iconSearchCache.set(key, names.map((n) => { const [prefix, name] = n.split(':'); return { id: n, prefix, name, color: COLOR.test(prefix) }; }));
    if (iconSearchCache.size > 300) iconSearchCache.delete(iconSearchCache.keys().next().value);
  }
  res.json({ icons: iconSearchCache.get(key), base: ICONIFY_API });
}));

app.get('/api/weather', wrap(async (req, res) => res.json(await getWeather())));

app.get('/api/geocode', wrap(async (req, res) => {
  const q = new URLSearchParams({ name: String(req.query.q || ''), count: '6', language: 'en', format: 'json' });
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  res.json((j.results || []).map((x) => ({ name: x.name, admin: x.admin1 || '', country: x.country || '', lat: x.latitude, lon: x.longitude, timezone: x.timezone })));
}));

// Backup / restore
app.get('/api/export', (req, res) => {
  res.set('Content-Disposition', `attachment; filename="speeddial-${new Date().toISOString().slice(0, 10)}.json"`).json(state);
});
app.post('/api/import', wrap(async (req, res) => {
  const s = req.body;
  if (!s || !Array.isArray(s.pages) || !s.settings) throw fail(400, 'Not a SpeedDial backup');
  state = { settings: { ...defaultState().settings, ...s.settings }, pages: s.pages };
  await save();
  res.json({ ok: true });
}));

app.listen(PORT, () => console.log(`SpeedDial on http://0.0.0.0:${PORT} (data: ${DATA_DIR})`));
