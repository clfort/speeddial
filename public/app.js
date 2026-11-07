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
}

function renderPages() {
  const nav = $('#pages');
  nav.innerHTML = state.pages.map((p, i) =>
    `<button class="tab${p.id === pageId ? ' active' : ''}" data-id="${esc(p.id)}" title="${i < 9 ? `Press ${i + 1}` : ''}">${esc(p.name)}</button>`).join('') +
    '<button class="tab add" title="Add page" id="addPage">+</button>';
}

function renderGrid() {
  const p = page();
  const target = state.settings.newTab ? ' target="_blank" rel="noopener"' : '';
  $('#grid').innerHTML = p.tiles.map((t) => `
    <a class="tile" href="${esc(t.url)}"${target} data-id="${esc(t.id)}" draggable="true" title="${esc(t.url)}">
      ${iconHtml(t.icon, t.name)}
      <span class="nm">${esc(t.name)}</span>
      <button class="more" type="button" title="Edit" aria-label="Edit ${esc(t.name)}">${I.dots}</button>
    </a>`).join('') + `
    <a class="tile add" href="#" id="addTile" draggable="false"><div class="ic">${I.plus}</div><span class="nm">Add</span></a>`;
}

function render() {
  if (!state.pages.some((p) => p.id === pageId)) pageId = state.pages[0].id;
  renderPages();
  renderGrid();
  applySettings();
}

function switchPage(id) {
  if (!state.pages.some((p) => p.id === id)) return;
  pageId = id;
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
  const others = state.pages.filter((p) => p.id !== pageId);
  openMenu(x, y, [
    { text: 'Edit', run: () => openTileDialog(tile) },
    { text: 'Open in new tab', run: () => window.open(tile.url, '_blank', 'noopener') },
    ...(others.length ? ['-', { label: 'Move to' }, ...others.map((p) => ({ text: p.name, run: () => moveTile(tile, p.id) }))] : []),
    '-',
    { text: 'Delete', danger: true, run: () => deleteTile(tile) },
  ]);
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
  page().tiles = page().tiles.filter((t) => t.id !== tile.id);
  renderGrid();
}

async function moveTile(tile, toPage) {
  await api('PUT', `/api/pages/${pageId}/tiles/${tile.id}`, { pageId: toPage });
  page().tiles = page().tiles.filter((t) => t.id !== tile.id);
  state.pages.find((p) => p.id === toPage).tiles.push(tile);
  renderGrid();
  toast(`Moved to ${state.pages.find((p) => p.id === toPage).name}`);
}

// Drag and drop: tiles reorder within the grid, or drop on a page tab to move.
let dragId = null;
function setupDrag() {
  const grid = $('#grid');
  grid.addEventListener('dragstart', (e) => {
    const t = e.target.closest('.tile:not(.add)');
    if (!t) return;
    dragId = t.dataset.id; t.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  grid.addEventListener('dragend', () => {
    dragId = null;
    document.querySelectorAll('.dragging,.drop-before,.drag-over').forEach((el) => el.classList.remove('dragging', 'drop-before', 'drag-over'));
  });
  grid.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const over = e.target.closest('.tile');
    grid.querySelectorAll('.drop-before').forEach((el) => el.classList.remove('drop-before'));
    if (over && over.dataset.id !== dragId) over.classList.add('drop-before');
  });
  grid.addEventListener('drop', async (e) => {
    if (!dragId) return;
    e.preventDefault();
    const over = e.target.closest('.tile');
    const tiles = page().tiles;
    const from = tiles.findIndex((t) => t.id === dragId);
    const [moved] = tiles.splice(from, 1);
    let to = over && !over.classList.contains('add') ? tiles.findIndex((t) => t.id === over.dataset.id) : tiles.length;
    if (to < 0) to = tiles.length;
    tiles.splice(to, 0, moved);
    renderGrid();
    await api('PUT', `/api/pages/${pageId}/order`, { ids: tiles.map((t) => t.id) });
  });
  const nav = $('#pages');
  nav.addEventListener('dragover', (e) => {
    const tab = e.target.closest('.tab[data-id]');
    if (!dragId || !tab || tab.dataset.id === pageId) return;
    e.preventDefault(); tab.classList.add('drag-over');
  });
  nav.addEventListener('dragleave', (e) => e.target.closest('.tab')?.classList.remove('drag-over'));
  nav.addEventListener('drop', async (e) => {
    const tab = e.target.closest('.tab[data-id]');
    if (!dragId || !tab) return;
    e.preventDefault();
    const tile = page().tiles.find((t) => t.id === dragId);
    if (tile) await moveTile(tile, tab.dataset.id);
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
    $('#iconHint').textContent = r.icons.length ? 'click one to choose (or paste an image)' : 'no icon found, upload one or use a letter';
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
  const sel = form.pageId;
  sel.innerHTML = state.pages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = pageId;
  $('#moveRow').hidden = state.pages.length < 2;
  $('#iconHint').textContent = tile ? '' : 'paste a web address to find icons';
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
  const body = { url: form.url.value.trim(), name: form.name.value.trim(), icon: chosenIcon, pageId: form.pageId.value };
  const btn = $('#tileSave'); btn.disabled = true;
  try {
    if (editing) {
      await api('PUT', `/api/pages/${pageId}/tiles/${editing.id}`, body);
    } else {
      await api('POST', `/api/pages/${body.pageId || pageId}/tiles`, body);
    }
    state = await api('GET', '/api/state');
    if (body.pageId && body.pageId !== pageId) toast(`Saved to ${state.pages.find((p) => p.id === body.pageId)?.name}`);
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
  if (!confirm(`Delete page "${p.name}" and its ${p.tiles.length} shortcut(s)?`)) return;
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
  refreshBgPreview();
  sdlg.showModal();
}
sform.addEventListener('input', (e) => {
  const el = e.target; if (!el.name) return;
  if (el.name === 'dim' || el.name === 'tileSize') saveSettings({ [el.name]: Number(el.value) });
});
sform.addEventListener('change', (e) => {
  const el = e.target; if (!el.name) return;
  if (el.type === 'checkbox') saveSettings({ [el.name]: el.checked });
  else if (el.name === 'units') saveSettings({ units: el.value }).then(loadWeather);
  else if (el.name === 'searchEngine') saveSettings({ searchEngine: el.value });
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

$('#grid').addEventListener('click', (e) => {
  if (e.target.closest('#addTile')) { e.preventDefault(); openTileDialog(); return; }
  const more = e.target.closest('.more');
  if (more) {
    e.preventDefault(); e.stopPropagation();
    const tile = page().tiles.find((t) => t.id === more.closest('.tile').dataset.id);
    const r = more.getBoundingClientRect();
    tileMenu(tile, r.left, r.bottom + 4);
  }
});
$('#grid').addEventListener('contextmenu', (e) => {
  const el = e.target.closest('.tile:not(.add)'); if (!el) return;
  e.preventDefault();
  tileMenu(page().tiles.find((t) => t.id === el.dataset.id), e.clientX, e.clientY);
});
// Long press on touch screens opens the same menu.
let pressTimer;
$('#grid').addEventListener('touchstart', (e) => {
  const el = e.target.closest('.tile:not(.add)'); if (!el) return;
  const { clientX: x, clientY: y } = e.touches[0];
  pressTimer = setTimeout(() => tileMenu(page().tiles.find((t) => t.id === el.dataset.id), x, y), 550);
}, { passive: true });
['touchend', 'touchmove'].forEach((ev) => $('#grid').addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));

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
  if (e.key === 'Escape') { closeMenu(); $('#forecast').hidden = true; }
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
