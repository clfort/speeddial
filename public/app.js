// SpeedDial front end: plain JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { settings: {}, pages: [] };
let pageId = null;

// ---------- API ----------
async function api(method, url, body, raw) {
  const opt = { method, headers: {} };
  if (raw) { opt.body = raw; opt.headers['content-type'] = raw.type || 'application/octet-stream'; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['content-type'] = 'application/json'; }
  const res = await fetch(url, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
}

const page = () => state.pages.find((p) => p.id === pageId) || state.pages[0];

// ---------- icons ----------
const I = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};
const W = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  partly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v1M3.5 5.5l.7.7M2 10h1M12.5 5.5l-.7.7"/><path d="M5.3 12.3A4 4 0 1 1 12 8.6"/><path d="M8 20h9a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.6A3.2 3.2 0 0 0 8 20z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19h10a5 5 0 0 0 .5-10A6.5 6.5 0 0 0 5 10.5 4.3 4.3 0 0 0 7 19z"/></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 14a4.5 4.5 0 0 1 1-8.8A6 6 0 0 1 18 8a4 4 0 0 1 1 6"/><path d="M4 17h16M6 21h12"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4.5 4.5 0 0 0 .5-9A6 6 0 0 0 6 7.5 3.8 3.8 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14h10a4.5 4.5 0 0 0 .5-9A6 6 0 0 0 6 6.5 3.8 3.8 0 0 0 7 14z"/><path d="M8 18h.01M12 18h.01M16 18h.01M10 21h.01M14 21h.01"/></svg>',
  storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4.5 4.5 0 0 0 .5-9A6 6 0 0 0 6 7.5 3.8 3.8 0 0 0 7 15z"/><path d="M13 13l-3 4h4l-3 4"/></svg>',
};
// WMO weather codes used by Open-Meteo.
function wmo(code, isDay = true) {
  if (code === 0) return [isDay ? W.sun : W.moon, 'Clear'];
  if (code === 1) return [isDay ? W.sun : W.moon, 'Mainly clear'];
  if (code === 2) return [W.partly, 'Partly cloudy'];
  if (code === 3) return [W.cloud, 'Overcast'];
  if (code === 45 || code === 48) return [W.fog, 'Fog'];
  if (code >= 51 && code <= 57) return [W.rain, 'Drizzle'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return [W.rain, code >= 80 ? 'Showers' : 'Rain'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return [W.snow, 'Snow'];
  if (code >= 95) return [W.storm, 'Thunderstorm'];
  return [W.cloud, ''];
}

const COLORS = ['#e57373', '#f06292', '#ba68c8', '#7986cb', '#4fc3f7', '#4db6ac', '#81c784', '#ffb74d', '#ff8a65', '#a1887f', '#90a4ae'];
const colorFor = (s) => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const letterIcon = (name) => `letter:${(String(name).trim()[0] || '?').toUpperCase()}`;

function iconHtml(icon, name, cls = 'ic') {
  if (!icon || icon.startsWith('letter:')) {
    const l = icon ? icon.slice(7) : (String(name).trim()[0] || '?').toUpperCase();
    return `<div class="${cls} letter" style="background:${colorFor(name || l)}">${esc(l)}</div>`;
  }
  return `<div class="${cls}"><img src="${esc(icon)}" alt="" loading="lazy" draggable="false"></div>`;
}

// ---------- render ----------
function applySettings() {
  const s = state.settings;
  document.documentElement.style.setProperty('--tile', `${s.tileSize || 72}px`);
  $('#dim').style.opacity = (s.dim ?? 25) / 100;
  const bg = page()?.background || s.background;
  $('#bg').style.backgroundImage = bg ? `url("${bg.replace(/"/g, '%22')}")` : '';
  $('#search').hidden = !s.showSearch;
  renderClock();
  renderGreeting();
}

function greetingText() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
  const name = (state.settings.userName || '').trim();
  return name ? `${part}, ${name}` : part;
}
// "1. “Text” — Author" -> { text, author }
function parseQuotes(raw) {
  return String(raw || '').split('\n').map((l) => l.trim().replace(/^\d+[.)]\s*/, '')).filter((l) => l.length > 3).map((l) => {
    const m = l.match(/^(.*?)\s+[—–-]{1,2}\s+([^"“”]+)$/);
    const text = (m ? m[1] : l).trim().replace(/^["“”']+|["“”']+$/g, '').trim();
    return { text, author: m ? m[2].trim() : '' };
  }).filter((q) => q.text);
}
let quote = null;
function nextQuote() {
  const list = parseQuotes(state.settings.quotes);
  if (!list.length) { quote = null; return; }
  let q; do { q = list[Math.floor(Math.random() * list.length)]; } while (list.length > 1 && quote && q.text === quote.text);
  quote = q;
}
function renderGreeting() {
  const s = state.settings;
  const custom = (page()?.title || '').trim();
  const mode = custom ? 'title' : (s.titleMode || 'greeting');
  if (mode === 'quote' && (!quote || !parseQuotes(s.quotes).some((q) => q.text === quote.text))) nextQuote();
  const el = $('#greeting');
  const show = mode === 'title' || mode === 'greeting' || (mode === 'quote' && quote);
  el.hidden = !show;
  el.classList.toggle('quote', mode === 'quote');
  el.title = mode === 'quote' ? 'Click for another quote' : '';
  if (!show) return;
  const date = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const text = mode === 'title' ? custom : mode === 'quote' ? `“${quote.text}”` : greetingText();
  const sub = mode === 'quote' ? (quote.author ? `— ${quote.author}` : '') : date;
  if ($('h1', el).textContent !== text) $('h1', el).textContent = text;
  if ($('.date', el).textContent !== sub) $('.date', el).textContent = sub;
}
$('#greeting').addEventListener('click', () => { if ($('#greeting').classList.contains('quote')) { nextQuote(); renderGreeting(); } });
setInterval(() => state.pages.length && renderGreeting(), 30000);

function renderPages() {
  const nav = $('#pages');
  nav.innerHTML = state.pages.map((p, i) =>
    `<button class="tab${p.id === pageId ? ' active' : ''}" data-id="${esc(p.id)}" title="${i < 9 ? `Press ${i + 1}` : ''}">${esc(p.name)}</button>`).join('') +
    '<button class="tab add" title="Add page" id="addPage">+</button>';
}

const isFolder = (t) => t && t.type === 'folder';
let openFolderId = null; // folder shown in the overlay
const newId = () => 'f' + Math.random().toString(16).slice(2, 12).padEnd(10, '0');

function linkHtml(t) {
  const target = state.settings.newTab ? ' target="_blank" rel="noopener"' : '';
  return `
    <a class="tile" href="${esc(t.url)}"${target} data-id="${esc(t.id)}" draggable="true" title="${esc(t.url)}">
      ${iconHtml(t.icon, t.name)}
      <span class="nm">${esc(t.name)}</span>
      <button class="more" type="button" title="Edit" aria-label="Edit ${esc(t.name)}">${I.dots}</button>
    </a>`;
}
function miniHtml(t) {
  if (!t.icon || t.icon.startsWith('letter:')) {
    const l = t.icon ? t.icon.slice(7) : (String(t.name).trim()[0] || '?').toUpperCase();
    return `<span class="mini letter" style="background:${colorFor(t.name || l)}">${esc(l)}</span>`;
  }
  return `<span class="mini"><img src="${esc(t.icon)}" alt="" loading="lazy" draggable="false"></span>`;
}
function folderHtml(f) {
  const bg = f.color ? ` style="background:${esc(f.color)}cc"` : '';
  return `
    <a class="tile folder" href="#" data-id="${esc(f.id)}" data-folder="1" draggable="true" title="${esc(f.name)} (${f.tiles.length})">
      <div class="ic folder"${bg}>${f.tiles.slice(0, 9).map(miniHtml).join('')}</div>
      <span class="nm">${esc(f.name)}</span>
      <button class="more" type="button" title="Folder options" aria-label="Options for ${esc(f.name)}">${I.dots}</button>
    </a>`;
}
const addHtml = (id) => `<a class="tile add" href="#" id="${id}" draggable="false" title="Add shortcut (right-click for New folder)"><div class="ic">${I.plus}</div><span class="nm">Add</span></a>`;

function renderGrid() {
  $('#grid').innerHTML = page().tiles.map((t) => (isFolder(t) ? folderHtml(t) : linkHtml(t))).join('') + addHtml('addTile');
  renderFolder();
}

// ---------- folders ----------
const folderById = (id) => page().tiles.find((t) => isFolder(t) && t.id === id);
// Where an item lives on the current page: { list, index, folder }.
function locate(id) {
  const tiles = page().tiles;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].id === id) return { list: tiles, index: i, folder: null, item: tiles[i] };
    if (isFolder(tiles[i])) {
      const j = tiles[i].tiles.findIndex((x) => x.id === id);
      if (j >= 0) return { list: tiles[i].tiles, index: j, folder: tiles[i], item: tiles[i].tiles[j] };
    }
  }
  return null;
}
const itemById = (id) => locate(id)?.item;

function renderFolder() {
  const view = $('#folderView');
  const f = openFolderId && folderById(openFolderId);
  if (!f) { view.hidden = true; openFolderId = null; return; }
  view.hidden = false;
  const name = $('#folderName');
  if (document.activeElement !== name) name.value = f.name;
  $('#folderGrid').innerHTML = f.tiles.map(linkHtml).join('') + addHtml('addInFolder');
}
function openFolder(id, rename = false) {
  openFolderId = id;
  $('#folderView').classList.remove('peek');
  renderFolder();
  if (rename) { const n = $('#folderName'); n.focus(); n.select(); }
}
function closeFolder() {
  openFolderId = null;
  $('#folderView').classList.remove('peek');
  $('#folderView').hidden = true;
}

let layoutTimer;
function saveLayout(now = false) {
  const p = page();
  const body = { tiles: p.tiles.map((t) => (isFolder(t) ? { type: 'folder', id: t.id, name: t.name, color: t.color || '', tiles: t.tiles.map((x) => x.id) } : { id: t.id })) };
  clearTimeout(layoutTimer);
  const send = () => api('PUT', `/api/pages/${p.id}/layout`, body).catch((err) => toast(err.message));
  if (now) return send();
  layoutTimer = setTimeout(send, 250);
}

// Moves a shortcut (or a folder) to a new spot. where: 'before' | 'after' | 'end' | 'into'.
function moveItem(id, { folderId = null, refId = null, where = 'end' }) {
  const from = locate(id);
  if (!from || id === refId) return;
  const item = from.item;
  if (isFolder(item) && folderId) return; // no folders inside folders
  from.list.splice(from.index, 1);
  const leftFolder = from.folder && from.folder.id !== folderId ? from.folder : null;
  const tiles = page().tiles;
  if (where === 'into') {
    const ref = tiles.find((t) => t.id === refId);
    if (isFolder(ref)) ref.tiles.push(item);
    else if (ref) {
      // Shortcut dropped on a shortcut: make a folder from the two, like on the iPhone.
      const f = { type: 'folder', id: newId(), name: 'Folder', color: '', tiles: [ref, item] };
      tiles.splice(tiles.indexOf(ref), 1, f);
      if (leftFolder && !leftFolder.tiles.length) tiles.splice(tiles.indexOf(leftFolder), 1);
      render(); saveLayout(true);
      openFolder(f.id, true);
      return;
    }
  } else {
    const list = folderId ? folderById(folderId)?.tiles || tiles : tiles;
    let i = refId ? list.findIndex((t) => t.id === refId) : -1;
    if (i < 0) i = list.length; else if (where === 'after') i++;
    list.splice(i, 0, item);
  }
  // A folder emptied by dragging its last shortcut out goes away.
  if (leftFolder && !leftFolder.tiles.length) tiles.splice(tiles.indexOf(leftFolder), 1);
  renderGrid();
  saveLayout();
}

async function newFolderWith(id) {
  const name = prompt('Folder name', 'Folder');
  if (name === null) return;
  const from = locate(id);
  const tiles = page().tiles;
  const f = { type: 'folder', id: newId(), name: name.trim() || 'Folder', color: '', tiles: [] };
  if (from) {
    from.list.splice(from.index, 1);
    tiles.splice(from.folder ? tiles.indexOf(from.folder) + 1 : from.index, 0, f);
    f.tiles.push(from.item);
    if (from.folder && !from.folder.tiles.length) tiles.splice(tiles.indexOf(from.folder), 1);
  } else tiles.push(f);
  renderGrid();
  await saveLayout(true);
  toast(`Folder "${f.name}" created`);
}

function renameFolder(f) {
  const name = prompt('Rename folder', f.name);
  if (!name?.trim()) return;
  f.name = name.trim(); renderGrid(); saveLayout();
}
function ungroupFolder(f) {
  const tiles = page().tiles;
  tiles.splice(tiles.indexOf(f), 1, ...f.tiles);
  if (openFolderId === f.id) closeFolder();
  renderGrid(); saveLayout();
}
async function deleteFolder(f) {
  if (!confirm(`Delete folder "${f.name}" and its ${f.tiles.length} shortcut(s)?`)) return;
  const tiles = page().tiles;
  tiles.splice(tiles.indexOf(f), 1);
  if (openFolderId === f.id) closeFolder();
  renderGrid();
  for (const t of f.tiles) await api('DELETE', `/api/pages/${pageId}/tiles/${t.id}`);
  saveLayout();
}
async function moveFolderToPage(f, toPage) {
  await api('POST', `/api/pages/${pageId}/folders/${f.id}/move`, { pageId: toPage });
  const tiles = page().tiles;
  tiles.splice(tiles.indexOf(f), 1);
  state.pages.find((p) => p.id === toPage).tiles.push(f);
  if (openFolderId === f.id) closeFolder();
  renderGrid();
  toast(`Moved to ${state.pages.find((p) => p.id === toPage).name}`);
}
const FOLDER_COLORS = [['Glass', ''], ['Blue', '#3b82f6'], ['Green', '#22c55e'], ['Purple', '#a855f7'], ['Pink', '#ec4899'], ['Orange', '#f97316'], ['Gray', '#64748b']];

function render() {
  if (!state.pages.some((p) => p.id === pageId)) pageId = state.pages[0].id;
  renderPages();
  renderGrid();
  applySettings();
}

function switchPage(id) {
  if (!state.pages.some((p) => p.id === id)) return;
  pageId = id;
  closeFolder();
  try { localStorage.setItem('sd.page', id); } catch { /* private mode */ }
  history.replaceState(null, '', `#${id}`);
  render();
}

// ---------- clock & weather ----------
function renderClock() {
  const s = state.settings;
  const opts = { hour: '2-digit', minute: '2-digit', hour12: !s.clock24 };
  if (s.showSeconds) opts.second = '2-digit';
  $('#clock .time').textContent = new Date().toLocaleTimeString([], opts);
}
setInterval(renderClock, 1000);

let weather = null;
async function loadWeather() {
  try {
    weather = await api('GET', '/api/weather');
    const [svg, desc] = wmo(weather.current.code, weather.current.isDay);
    $('#weather .wicon').innerHTML = svg;
    $('#weather .temp').textContent = `${Math.round(weather.current.temp)}°`;
    $('#weather .city').textContent = weather.city;
    $('#weather').title = desc;
  } catch {
    $('#weather .temp').textContent = '--';
    $('#weather .city').textContent = state.settings.city || '';
  }
}
setInterval(loadWeather, 15 * 60 * 1000);

function showForecast() {
  const box = $('#forecast');
  if (!box.hidden) { box.hidden = true; return; }
  if (!weather) { toast('Weather is not available right now'); return; }
  const u = weather.units === 'fahrenheit' ? '°F' : '°C';
  const c = weather.current;
  const [svg, desc] = wmo(c.code, c.isDay);
  const day = (d) => new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short' });
  box.innerHTML = `
    <div class="now">${svg}<div><div class="big">${Math.round(c.temp)}${u}</div><div class="desc">${desc} · feels ${Math.round(c.feels)}° · wind ${Math.round(c.wind)} km/h · ${c.humidity}%</div></div></div>
    <div class="desc">${esc(weather.city)} · today ${Math.round(weather.daily[0].max)}° / ${Math.round(weather.daily[0].min)}°</div>
    <div class="days">${weather.daily.slice(1, 6).map((d) => `<div><div>${day(d.date)}</div>${wmo(d.code)[0]}<div>${Math.round(d.max)}°</div><div class="lo">${Math.round(d.min)}°</div></div>`).join('')}</div>
    <div class="src">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></div>`;
  const r = $('#weather').getBoundingClientRect();
  box.hidden = false;
  box.style.top = `${r.bottom + 10}px`;
  box.style.left = `${Math.max(10, Math.min(window.innerWidth - box.offsetWidth - 10, r.right - box.offsetWidth))}px`;
}

// ---------- context menu ----------
function openMenu(x, y, items) {
  const m = $('#menu');
  m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { m.appendChild(document.createElement('hr')); continue; }
    if (it.label && !it.run) { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = it.label; m.appendChild(d); continue; }
    const b = document.createElement('button');
    b.textContent = it.text; if (it.danger) b.className = 'danger';
    b.onclick = () => { closeMenu(); it.run(); };
    m.appendChild(b);
  }
  m.hidden = false;
  m.style.left = `${Math.min(x, window.innerWidth - m.offsetWidth - 8)}px`;
  m.style.top = `${Math.min(y, window.innerHeight - m.offsetHeight - 8)}px`;
}
const closeMenu = () => { $('#menu').hidden = true; };

function tileMenu(tile, x, y) {
  const loc = locate(tile.id);
  const otherPages = state.pages.filter((p) => p.id !== pageId);
  const folders = page().tiles.filter((t) => isFolder(t) && t.id !== loc?.folder?.id);
  openMenu(x, y, [
    { text: 'Edit', run: () => openTileDialog(tile) },
    { text: 'Open in new tab', run: () => window.open(tile.url, '_blank', 'noopener') },
    '-',
    { label: 'Move to folder' },
    ...folders.map((f) => ({ text: `📁 ${f.name}`, run: () => moveItem(tile.id, { folderId: f.id }) })),
    { text: 'New folder…', run: () => newFolderWith(tile.id) },
    ...(loc?.folder ? [{ text: 'Move out of folder', run: () => moveItem(tile.id, { refId: loc.folder.id, where: 'after' }) }] : []),
    ...(otherPages.length ? ['-', { label: 'Move to page' }, ...otherPages.map((p) => ({ text: p.name, run: () => moveTile(tile, p.id) }))] : []),
    '-',
    { text: 'Delete', danger: true, run: () => deleteTile(tile) },
  ]);
}

function folderMenu(f, x, y) {
  const otherPages = state.pages.filter((p) => p.id !== pageId);
  openMenu(x, y, [
    { text: 'Open', run: () => openFolder(f.id) },
    { text: 'Rename', run: () => renameFolder(f) },
    { label: 'Color' },
    ...FOLDER_COLORS.map(([n, c]) => ({ text: `${(f.color || '') === c ? '● ' : ''}${n}`, run: () => { f.color = c; renderGrid(); saveLayout(); } })),
    ...(otherPages.length ? ['-', { label: 'Move to page' }, ...otherPages.map((p) => ({ text: p.name, run: () => moveFolderToPage(f, p.id) }))] : []),
    '-',
    { text: 'Remove folder (keep shortcuts)', run: () => ungroupFolder(f) },
    { text: 'Delete folder and shortcuts', danger: true, run: () => deleteFolder(f) },
  ]);
}

function itemMenu(id, x, y) {
  const item = itemById(id);
  if (!item) return;
  if (isFolder(item)) folderMenu(item, x, y); else tileMenu(item, x, y);
}

function pageMenu(p, x, y) {
  openMenu(x, y, [
    { text: 'Rename', run: () => renamePage(p) },
    { text: 'Move left', run: () => movePage(p, -1) },
    { text: 'Move right', run: () => movePage(p, 1) },
    '-',
    { text: 'Delete page', danger: true, run: () => deletePage(p) },
  ]);
}

// ---------- tiles ----------
async function deleteTile(tile) {
  if (!confirm(`Delete "${tile.name}"?`)) return;
  await api('DELETE', `/api/pages/${pageId}/tiles/${tile.id}`);
  const loc = locate(tile.id);
  if (loc) loc.list.splice(loc.index, 1);
  renderGrid();
}

async function moveTile(tile, toPage) {
  await api('PUT', `/api/pages/${pageId}/tiles/${tile.id}`, { pageId: toPage, folderId: '' });
  const loc = locate(tile.id);
  if (loc) loc.list.splice(loc.index, 1);
  state.pages.find((p) => p.id === toPage).tiles.push(tile);
  renderGrid();
  toast(`Moved to ${state.pages.find((p) => p.id === toPage).name}`);
}

// Drag and drop. On the page: drop on the middle of a shortcut to make a folder, on a folder to put
// it inside, near the edges to reorder. Inside a folder: reorder, or drag outside the box to take it out.
// Drop on a page tab to move it to that page.
let drag = null; // { id, isFolder, fromFolder }
let dropAt = null;
function clearDropMarks() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-into,.drag-over').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into', 'drag-over'));
}
function dropTarget(e, container) {
  const inFolder = container.id === 'folderGrid';
  const over = e.target.closest('.tile');
  if (!over || over.classList.contains('add')) return { folderId: inFolder ? openFolderId : null, where: 'end' };
  if (over.dataset.id === drag.id) return null;
  const r = over.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const canInto = !inFolder && !drag.isFolder;
  if (canInto && x > 0.22 && x < 0.78) return { refId: over.dataset.id, where: 'into', el: over };
  return { folderId: inFolder ? openFolderId : null, refId: over.dataset.id, where: x < 0.5 ? 'before' : 'after', el: over };
}
function endDrag() {
  drag = null; dropAt = null;
  clearDropMarks();
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  if ($('#folderView').classList.contains('peek')) closeFolder();
}
function setupDrag() {
  for (const container of [$('#grid'), $('#folderGrid')]) {
    container.addEventListener('dragstart', (e) => {
      const t = e.target.closest('.tile:not(.add)');
      if (!t) return;
      drag = { id: t.dataset.id, isFolder: !!t.dataset.folder, fromFolder: container.id === 'folderGrid' };
      t.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.id);
    });
    container.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault(); e.stopPropagation();
      clearDropMarks();
      dropAt = dropTarget(e, container);
      if (dropAt?.el) dropAt.el.classList.add(`drop-${dropAt.where}`);
    });
    container.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault(); e.stopPropagation();
      const target = dropTarget(e, container);
      const id = drag.id;
      endDrag();
      if (target) moveItem(id, target);
    });
  }
  // Drops re-render the grid, so the dragged element is often gone before "dragend": clean up here too.
  document.addEventListener('dragend', endDrag);
  // Dragging a shortcut out of an open folder: the folder fades away so you can drop it on the page.
  $('#folderView').addEventListener('dragover', (e) => {
    if (!drag || e.target.closest('.fv-panel')) return;
    e.preventDefault();
    $('#folderView').classList.add('peek');
  });
  // Dropping on empty page space puts it at the end of the page.
  document.body.addEventListener('dragover', (e) => { if (drag && !e.target.closest('#grid,#pages,.fv-panel')) e.preventDefault(); });
  document.body.addEventListener('drop', (e) => {
    if (!drag || e.target.closest('#grid,#pages,.fv-panel')) return;
    e.preventDefault();
    const { id, fromFolder } = drag;
    endDrag();
    if (fromFolder) moveItem(id, { where: 'end' });
  });
  const nav = $('#pages');
  nav.addEventListener('dragover', (e) => {
    const tab = e.target.closest('.tab[data-id]');
    if (!drag || !tab || tab.dataset.id === pageId) return;
    e.preventDefault(); tab.classList.add('drag-over');
  });
  nav.addEventListener('dragleave', (e) => e.target.closest('.tab')?.classList.remove('drag-over'));
  nav.addEventListener('drop', async (e) => {
    const tab = e.target.closest('.tab[data-id]');
    if (!drag || !tab || tab.dataset.id === pageId) return;
    e.preventDefault();
    const item = itemById(drag.id);
    endDrag();
    if (isFolder(item)) await moveFolderToPage(item, tab.dataset.id);
    else if (item) await moveTile(item, tab.dataset.id);
  });
}

// ---------- add / edit dialog ----------
const dlg = $('#tileDlg');
const form = $('#tileForm');
let editing = null;      // tile being edited, or null when adding
let chosenIcon = '';
let nameTouched = false;
let lookupSeq = 0;

function setIconOptions(options, selected) {
  const picker = $('#iconPicker');
  const name = form.name.value || form.url.value;
  const all = [...new Set(options.filter(Boolean))];
  if (!all.some((o) => o.startsWith('letter:'))) all.push(letterIcon(name || '?'));
  picker.innerHTML = all.map((o) => o.startsWith('letter:')
    ? `<button type="button" class="opt letter${o === selected ? ' sel' : ''}" data-icon="${esc(o)}" style="background:${colorFor(name || o)}" title="Letter">${esc(o.slice(7))}</button>`
    : `<button type="button" class="opt${o === selected ? ' sel' : ''}" data-icon="${esc(o)}" title="${esc(o)}"><img src="${esc(o)}" alt=""></button>`).join('');
  chosenIcon = selected || '';
}

function selectIcon(icon) {
  chosenIcon = icon;
  $('#iconPicker').querySelectorAll('.opt').forEach((b) => b.classList.toggle('sel', b.dataset.icon === icon));
}

async function lookup() {
  const url = form.url.value.trim();
  if (!url || !/[.:]|localhost/.test(url)) return;
  const seq = ++lookupSeq;
  const keep = chosenIcon && !chosenIcon.startsWith('letter:') && !chosenIcon.startsWith('http') ? [chosenIcon] : [];
  $('#iconHint').innerHTML = '<span class="spinner" style="display:inline-block;width:12px;height:12px;vertical-align:middle"></span> finding icons…';
  try {
    const q = new URLSearchParams({ url, name: form.name.value, title: nameTouched || form.name.value ? '0' : '1' });
    const r = await api('GET', `/api/lookup?${q}`);
    if (seq !== lookupSeq) return;
    if (!nameTouched && !form.name.value && r.title) form.name.value = cleanTitle(r.title);
    const opts = [...keep, ...r.icons.map((i) => i.url)];
    if (editing && chosenIcon && !opts.includes(chosenIcon)) opts.unshift(chosenIcon);
    const sel = editing && chosenIcon ? chosenIcon : (opts[0] || letterIcon(form.name.value || url));
    setIconOptions(opts, sel);
    $('#iconHint').textContent = r.icons.length ? 'click one to choose (or paste an image)' : 'no site icon found, try Search free icons';
  } catch {
    if (seq === lookupSeq) $('#iconHint').textContent = '';
  }
}

// "Inbox (3) - Gmail" -> "Gmail"; "Proxmox Virtual Environment" stays.
function cleanTitle(t) {
  const parts = t.split(/\s+[-|–—·:]\s+/).map((s) => s.trim()).filter(Boolean);
  const best = parts.length > 1 ? parts[parts.length - 1] : t;
  return best.length > 30 ? best.slice(0, 30).trim() : best;
}

function openTileDialog(tile = null) {
  editing = tile;
  nameTouched = !!tile;
  form.reset();
  $('#tileTitle').textContent = tile ? 'Edit shortcut' : 'Add shortcut';
  $('#tileDelete').hidden = !tile;
  form.url.value = tile?.url || '';
  form.name.value = tile?.name || '';
  // "Page" doubles as "Folder": Personal, Personal › Proxmox, Office...
  const sel = form.pageId;
  sel.innerHTML = state.pages.map((p) => `<option value="${esc(p.id)}|">${esc(p.name)}</option>` +
    p.tiles.filter(isFolder).map((f) => `<option value="${esc(p.id)}|${esc(f.id)}">${esc(p.name)} › ${esc(f.name)}</option>`).join('')).join('');
  const inFolder = tile ? locate(tile.id)?.folder?.id : openFolderId;
  sel.value = `${pageId}|${inFolder || ''}`;
  $('#moveRow').hidden = sel.options.length < 2;
  $('#iconHint').textContent = tile ? '' : 'paste a web address to find icons';
  $('#iconSearch').hidden = true; $('#iconQuery').value = ''; $('#iconResults').innerHTML = ''; iconHits = [];
  setIconOptions(tile ? [tile.icon] : [], tile ? tile.icon || letterIcon(tile.name) : '');
  dlg.showModal();
  (tile ? form.name : form.url).focus();
  if (tile) lookup(); // offer other icons too
}

let lookupTimer;
form.url.addEventListener('input', () => { clearTimeout(lookupTimer); lookupTimer = setTimeout(lookup, 600); });
form.url.addEventListener('paste', () => { clearTimeout(lookupTimer); lookupTimer = setTimeout(lookup, 50); });
form.name.addEventListener('input', () => {
  nameTouched = true;
  const letter = $('#iconPicker .opt.letter');
  if (letter) {
    const l = letterIcon(form.name.value || '?');
    const wasSel = letter.classList.contains('sel');
    letter.dataset.icon = l; letter.textContent = l.slice(7); letter.style.background = colorFor(form.name.value || l);
    if (wasSel) chosenIcon = l;
  }
});
$('#iconPicker').addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (b) selectIcon(b.dataset.icon); });
$('#iconPicker').addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.closest('.opt').remove(); }, true);
$('#iconUpload').onclick = () => $('#iconFile').click();
$('#iconFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { const r = await api('POST', '/api/upload', undefined, f); addAndSelect(r.url); } catch (err) { toast(err.message); }
};
$('#iconFromUrl').onclick = async () => {
  const u = prompt('Image URL (PNG, SVG, JPG…)');
  if (!u) return;
  try { const r = await api('POST', '/api/fetch-image', { url: u.trim() }); addAndSelect(r.url); } catch (err) { toast(err.message); }
};
// ---------- free icon search (Iconify) ----------
const ICON_COLORS = ['#1f2937', '#2563eb', '#16a34a', '#dc2626', '#ea580c', '#9333ea', '#0891b2', '#db2777'];
let iconColor = ICON_COLORS[0];
let iconHits = [], iconSeq = 0, iconTimer;
try { iconColor = localStorage.getItem('sd.iconColor') || iconColor; } catch { /* ignore */ }
$('#iconColors').innerHTML = ICON_COLORS.map((c) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('');
const markColor = () => $('#iconColors').querySelectorAll('.sw').forEach((b) => b.classList.toggle('sel', b.dataset.c === iconColor));
markColor();
const iconUrl = (h) => `/api/icon/${h.prefix}/${h.name}.svg${h.color ? '' : `?color=${iconColor.slice(1)}`}`;
function renderIconHits() {
  $('#iconResults').innerHTML = iconHits.map((h, i) => `<button type="button" data-i="${i}" title="${esc(h.id)}"><img src="${esc(iconUrl(h))}" alt="" loading="lazy"></button>`).join('');
}
async function searchIcons() {
  const q = $('#iconQuery').value.trim();
  const seq = ++iconSeq;
  if (q.length < 2) { iconHits = []; renderIconHits(); return; }
  $('#iconResults').innerHTML = '<span class="spinner"></span>';
  try {
    const r = await api('GET', `/api/icon-search?q=${encodeURIComponent(q)}`);
    if (seq !== iconSeq) return;
    iconHits = r.icons;
    renderIconHits();
    if (!iconHits.length) $('#iconResults').innerHTML = '<span class="hint">No icons found, try another word</span>';
  } catch (err) { if (seq === iconSeq) $('#iconResults').innerHTML = `<span class="hint">${esc(err.message)}</span>`; }
}
function openIconSearch(q) {
  $('#iconSearch').hidden = false;
  const input = $('#iconQuery');
  if (q !== undefined && !input.value) input.value = q;
  input.focus();
  searchIcons();
}
$('#iconSearchToggle').onclick = () => {
  if (!$('#iconSearch').hidden) { $('#iconSearch').hidden = true; return; }
  openIconSearch(form.name.value.trim());
};
$('#iconQuery').addEventListener('input', () => { clearTimeout(iconTimer); iconTimer = setTimeout(searchIcons, 350); });
$('#iconQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(iconTimer); searchIcons(); } });
$('#iconColors').addEventListener('click', (e) => {
  const b = e.target.closest('.sw'); if (!b) return;
  iconColor = b.dataset.c; markColor(); renderIconHits();
  try { localStorage.setItem('sd.iconColor', iconColor); } catch { /* ignore */ }
});
$('#iconResults').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  const h = iconHits[b.dataset.i];
  api('POST', '/api/icon-save', { prefix: h.prefix, name: h.name, color: h.color ? '' : iconColor })
    .then((r) => addAndSelect(r.url)).catch((err) => toast(err.message));
});

$('#iconLetter').onclick = () => {
  const l = $('#iconPicker .opt.letter');
  if (l) selectIcon(l.dataset.icon);
};
function addAndSelect(icon) {
  const current = [...$('#iconPicker').querySelectorAll('.opt')].map((b) => b.dataset.icon);
  setIconOptions([icon, ...current], icon);
}
// Pasting an image anywhere in the dialog uploads it as the icon.
dlg.addEventListener('paste', async (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  try { const r = await api('POST', '/api/upload', undefined, item.getAsFile()); addAndSelect(r.url); toast('Icon pasted'); } catch (err) { toast(err.message); }
});

$('#tileCancel').onclick = () => dlg.close();
$('#tileDelete').onclick = async () => { const t = editing; dlg.close(); await deleteTile(t); };
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const [destPage, destFolder] = form.pageId.value.split('|');
  const body = { url: form.url.value.trim(), name: form.name.value.trim(), icon: chosenIcon, pageId: destPage || pageId, folderId: destFolder || '' };
  const btn = $('#tileSave'); btn.disabled = true;
  try {
    if (editing) {
      await api('PUT', `/api/pages/${pageId}/tiles/${editing.id}`, body);
    } else {
      await api('POST', `/api/pages/${body.pageId || pageId}/tiles`, body);
    }
    state = await api('GET', '/api/state');
    if (body.pageId !== pageId) toast(`Saved to ${state.pages.find((p) => p.id === body.pageId)?.name}`);
    dlg.close();
    render();
  } catch (err) { toast(err.message); } finally { btn.disabled = false; }
});

// ---------- pages ----------
async function addPage() {
  const name = prompt('New page name', '');
  if (!name?.trim()) return;
  const p = await api('POST', '/api/pages', { name });
  state.pages.push(p);
  switchPage(p.id);
}
async function renamePage(p) {
  const name = prompt('Rename page', p.name);
  if (!name?.trim()) return;
  await api('PUT', `/api/pages/${p.id}`, { name });
  p.name = name.trim(); renderPages();
}
async function deletePage(p) {
  if (state.pages.length < 2) return toast('Keep at least one page');
  const n = p.tiles.reduce((a, t) => a + (isFolder(t) ? t.tiles.length : 1), 0);
  if (!confirm(`Delete page "${p.name}" and its ${n} shortcut(s)?`)) return;
  await api('DELETE', `/api/pages/${p.id}`);
  state.pages = state.pages.filter((x) => x.id !== p.id);
  render();
}
async function movePage(p, dir) {
  const i = state.pages.indexOf(p), j = i + dir;
  if (j < 0 || j >= state.pages.length) return;
  [state.pages[i], state.pages[j]] = [state.pages[j], state.pages[i]];
  renderPages();
  await api('PUT', '/api/pages-order', { ids: state.pages.map((x) => x.id) });
}

// ---------- settings ----------
const sdlg = $('#setDlg');
const sform = $('#setForm');
async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  applySettings(); renderGrid();
  await api('PUT', '/api/settings', patch);
}
function bgTarget() { return $('#bgThisPage').checked ? 'page' : 'global'; }
async function setBackground(url) {
  if (bgTarget() === 'page') {
    page().background = url;
    await api('PUT', `/api/pages/${pageId}`, { background: url });
    applySettings();
  } else {
    if (page().background) { page().background = ''; await api('PUT', `/api/pages/${pageId}`, { background: '' }); }
    await saveSettings({ background: url });
  }
  refreshBgPreview();
}
function refreshBgPreview() {
  const bg = page().background || state.settings.background;
  $('#bgPreview').style.backgroundImage = bg ? `url("${bg}")` : 'linear-gradient(160deg,#2b3a55,#3e5c76 45%,#748cab)';
}
function openSettings() {
  const s = state.settings;
  sform.dim.value = s.dim; sform.tileSize.value = s.tileSize;
  sform.clock24.checked = s.clock24; sform.showSeconds.checked = s.showSeconds;
  sform.newTab.checked = s.newTab; sform.showSearch.checked = s.showSearch;
  sform.searchEngine.value = s.searchEngine;
  sform.querySelectorAll('[name=units]').forEach((r) => (r.checked = r.value === s.units));
  $('#cityInput').value = s.city; $('#cityResults').innerHTML = '';
  $('#bgThisPage').checked = !!page().background;
  $('#bgPageName').textContent = page().name;
  sform.userName.value = s.userName || '';
  sform.titleMode.value = s.titleMode || 'greeting';
  sform.quotes.value = s.quotes || '';
  $('#quotesRow').hidden = sform.titleMode.value !== 'quote';
  $('#pageTitle').value = page().title || '';
  sform.querySelectorAll('.pgName').forEach((el) => (el.textContent = page().name));
  refreshBgPreview();
  sdlg.showModal();
}
sform.addEventListener('input', (e) => {
  const el = e.target; if (!el.name) return;
  if (el.name === 'dim' || el.name === 'tileSize') saveSettings({ [el.name]: Number(el.value) });
  if (el.name === 'quotes') { clearTimeout(quotesTimer); state.settings.quotes = el.value; quotesTimer = setTimeout(() => { saveSettings({ quotes: el.value }); }, 600); }
  if (el.name === 'userName') { clearTimeout(nameTimer); state.settings.userName = el.value; renderGreeting(); nameTimer = setTimeout(() => saveSettings({ userName: el.value.trim() }), 500); }
});
let nameTimer, titleTimer, quotesTimer;
$('#pageTitle').addEventListener('input', (e) => {
  const p = page(); p.title = e.target.value; renderGreeting();
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => api('PUT', `/api/pages/${p.id}`, { title: e.target.value }), 500);
});
sform.addEventListener('change', (e) => {
  const el = e.target; if (!el.name) return;
  if (el.type === 'checkbox') saveSettings({ [el.name]: el.checked });
  else if (el.name === 'units') saveSettings({ units: el.value }).then(loadWeather);
  else if (el.name === 'searchEngine') saveSettings({ searchEngine: el.value });
  else if (el.name === 'titleMode') { $('#quotesRow').hidden = el.value !== 'quote'; saveSettings({ titleMode: el.value }); }
});
sform.addEventListener('submit', (e) => { e.preventDefault(); sdlg.close(); });
$('#bgUpload').onclick = () => $('#bgFile').click();
$('#bgFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { toast('Uploading…'); const r = await api('POST', '/api/upload', undefined, f); await setBackground(r.url); toast('Background updated'); } catch (err) { toast(err.message); }
};
$('#bgUrl').onclick = async () => {
  const u = prompt('Background image URL');
  if (!u) return;
  try { const r = await api('POST', '/api/fetch-image', { url: u.trim() }); await setBackground(r.url); } catch (err) { toast(err.message); }
};
$('#bgClear').onclick = () => setBackground('');
$('#bgThisPage').onchange = async (e) => {
  // Turning "only this page" off removes the page's own background.
  if (!e.target.checked && page().background) { page().background = ''; await api('PUT', `/api/pages/${pageId}`, { background: '' }); applySettings(); refreshBgPreview(); }
};

let cityTimer;
$('#cityInput').addEventListener('input', (e) => {
  clearTimeout(cityTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $('#cityResults').innerHTML = ''; return; }
  cityTimer = setTimeout(async () => {
    try {
      const list = await api('GET', `/api/geocode?q=${encodeURIComponent(q)}`);
      $('#cityResults').innerHTML = list.map((c, i) => `<button type="button" data-i="${i}">${esc(c.name)}<span class="hint"> ${esc([c.admin, c.country].filter(Boolean).join(', '))}</span></button>`).join('') || '<span class="hint">No match</span>';
      $('#cityResults').onclick = async (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        const c = list[b.dataset.i];
        $('#cityInput').value = c.name; $('#cityResults').innerHTML = '';
        await saveSettings({ city: c.name, lat: c.lat, lon: c.lon, timezone: c.timezone });
        loadWeather(); toast(`Weather set to ${c.name}`);
      };
    } catch { $('#cityResults').innerHTML = '<span class="hint">City search is unavailable</span>'; }
  }, 350);
});

$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !confirm('Replace all pages and settings with this backup?')) return;
  try { await api('POST', '/api/import', JSON.parse(await f.text())); state = await api('GET', '/api/state'); render(); loadWeather(); toast('Backup restored'); } catch (err) { toast(err.message); }
};

// ---------- events ----------
$('#pages').addEventListener('click', (e) => {
  const t = e.target.closest('.tab'); if (!t) return;
  if (t.id === 'addPage') addPage(); else switchPage(t.dataset.id);
});
$('#pages').addEventListener('dblclick', (e) => { const t = e.target.closest('.tab[data-id]'); if (t) renamePage(state.pages.find((p) => p.id === t.dataset.id)); });
$('#pages').addEventListener('contextmenu', (e) => {
  const t = e.target.closest('.tab[data-id]'); if (!t) return;
  e.preventDefault(); pageMenu(state.pages.find((p) => p.id === t.dataset.id), e.clientX, e.clientY);
});

// Shortcut and folder events for both the page grid and the open folder.
for (const container of [$('#grid'), $('#folderGrid')]) {
  container.addEventListener('click', (e) => {
    if (e.target.closest('#addTile, #addInFolder')) { e.preventDefault(); openTileDialog(); return; }
    const more = e.target.closest('.more');
    if (more) {
      e.preventDefault(); e.stopPropagation();
      const r = more.getBoundingClientRect();
      itemMenu(more.closest('.tile').dataset.id, r.left, r.bottom + 4);
      return;
    }
    const folder = e.target.closest('.tile[data-folder]');
    if (folder) { e.preventDefault(); openFolder(folder.dataset.id); }
  });
  container.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.tile');
    if (!el) return;
    e.preventDefault();
    if (el.classList.contains('add')) {
      openMenu(e.clientX, e.clientY, [
        { text: 'Add shortcut', run: () => openTileDialog() },
        ...(container.id === 'grid' ? [{ text: 'New folder…', run: () => newFolderWith(null) }] : []),
      ]);
    } else itemMenu(el.dataset.id, e.clientX, e.clientY);
  });
  // Long press on touch screens opens the same menu.
  let pressTimer;
  container.addEventListener('touchstart', (e) => {
    const el = e.target.closest('.tile:not(.add)'); if (!el) return;
    const { clientX: x, clientY: y } = e.touches[0];
    pressTimer = setTimeout(() => itemMenu(el.dataset.id, x, y), 550);
  }, { passive: true });
  ['touchend', 'touchmove'].forEach((ev) => container.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));
}
$('#folderView').addEventListener('click', (e) => { if (!e.target.closest('.fv-panel')) closeFolder(); });
$('#folderName').addEventListener('input', (e) => {
  const f = folderById(openFolderId); if (!f) return;
  f.name = e.target.value.trim() || 'Folder';
  $('#grid').innerHTML = page().tiles.map((t) => (isFolder(t) ? folderHtml(t) : linkHtml(t))).join('') + addHtml('addTile');
  saveLayout();
});
$('#folderName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

$('#weather').onclick = (e) => { e.stopPropagation(); showForecast(); };
$('#settingsBtn').onclick = openSettings;
$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim(); if (!q) return;
  const url = state.settings.searchEngine + encodeURIComponent(q);
  if (state.settings.newTab) window.open(url, '_blank', 'noopener'); else location.href = url;
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu')) closeMenu();
  if (!e.target.closest('#forecast')) $('#forecast').hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#menu').hidden || !$('#forecast').hidden) { closeMenu(); $('#forecast').hidden = true; } else if (openFolderId && !document.querySelector('dialog[open]')) closeFolder();
  }
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-9]$/.test(e.key) && state.pages[e.key - 1]) switchPage(state.pages[e.key - 1].id);
  else if (e.key === 'n' || e.key === '+') { e.preventDefault(); openTileDialog(); }
  else if (e.key === '/' && state.settings.showSearch) { e.preventDefault(); $('#search input').focus(); }
});
window.addEventListener('hashchange', () => switchPage(decodeURIComponent(location.hash.slice(1))));
window.addEventListener('resize', closeMenu);

// ---------- start ----------
(async function init() {
  state = await api('GET', '/api/state');
  const fromHash = decodeURIComponent(location.hash.slice(1));
  let saved = null; try { saved = localStorage.getItem('sd.page'); } catch { /* ignore */ }
  pageId = [fromHash, saved].find((id) => id && state.pages.some((p) => p.id === id)) || state.pages[0].id;
  render();
  setupDrag();
  loadWeather();
})();
