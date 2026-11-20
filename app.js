/* Impala — runs fully locally, files are never uploaded. */
(() => {
'use strict';

/* The old "All files" overview is still in the code, just hidden.
   Set this to true to bring "All" back to the top of the menu. */
const SHOW_ALL_IN_MENU = false;

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t) => {
  if (!isFinite(t) || t < 0) t = 0;
  t = Math.floor(t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const fmtLong = (t) => { t = Math.round(t / 60); const h = Math.floor(t / 60), m = t % 60; return h ? `${h}h ${m}m` : `${m}m`; };
const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const extOf = (n) => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i + 1).toLowerCase(); };
const baseName = (n) => { const i = n.lastIndexOf('.'); return i <= 0 ? n : n.slice(0, i); };
const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const has = (rx, s) => rx.test(s);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
/* every profile has its own connected folder */
const srcKey = () => 'console-source:' + ((S.user && S.user.id) || '');
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
/* set by the desktop app (preload.js); null in a normal browser */
const DESK = window.desktop || null;
if (DESK) document.documentElement.classList.add('desk');

/* dates are kept as 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' strings */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
const isoDay = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const dateTs = (s) => { const p = String(s).split('-').map(Number); return Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1); };
const dateLabel = (s) => {
  const p = String(s).split('-').map(Number);
  if (!p[1]) return String(p[0]);
  if (!p[2]) return p2(p[1]) + '.' + p[0];
  return p2(p[2]) + '.' + p2(p[1]) + '.' + p[0];
};
const monthYear = (s) => { const p = String(s).split('-').map(Number); return p[1] ? MON[p[1] - 1] + ' ' + p[0] : String(p[0]); };
const dateInput = (s) => { const p = String(s).split('-'); return p[0] + '-' + (p[1] || '01') + '-' + (p[2] || '01'); };
const normDate = (v) => {
  const m = String(v || '').match(/(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  return m ? m[1] + (m[2] ? '-' + m[2] + (m[3] ? '-' + m[3] : '') : '') : '';
};
const parseNum = (v) => { const m = String(v == null ? '' : v).match(/\d+/); return m ? +m[0] : null; };
const numFromName = (n) => { const m = n.match(/^\s*(\d{1,3})\s*[-._)\s]/); return m ? +m[1] : null; };
/* "01 Song (Demo).mp3" and "Song" must give the same key */
const normT = (s) => s.toLowerCase()
  .replace(/[([][^)\]]*[)\]]/g, ' ')
  .replace(/^\s*\d{1,3}\s*[-._)\s]+/, '')
  .replace(/[^\p{L}\p{N}]+/gu, '');
const RX_YEAR = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/;

let toastTimer;
/* messages at the bottom are gone, except errors: those show as a small red note in the colours of the theme */
function toast() { /* success messages are intentionally silent */ }
function warn(msg) {
  const t = $('#toast');
  if (!t || !msg) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ================= storage (IndexedDB) ================= */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('music-vault', 1);
      const to = setTimeout(() => rej(new Error('Browser storage is busy')), 4000);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { clearTimeout(to); this.db = r.result; this.db.onversionchange = () => { this.db.close(); this.db = null; }; res(r.result); };
      r.onerror = () => { clearTimeout(to); rej(r.error); };
      r.onblocked = () => { /* another old tab holds the database: the timeout above lets us go on */ };
    });
  },
  async get(k) {
    try {
      const db = await this.open();
      return await new Promise((res, rej) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    } catch (e) { return undefined; }
  },
  async set(k, v) {
    try {
      const db = await this.open();
      await new Promise((res, rej) => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      });
    } catch (e) { console.warn('storage:', e); }
  }
};

/* ================= constants ================= */
const AUDIO = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'aif', 'aiff']);
const VIDEO = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv']);
const TEXT = new Set(['txt', 'md', 'markdown', 'lrc']);
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);
const SKIP_DIRS = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information']);

const GROUPS = [{ id: 'music', label: 'Music' }, { id: 'novels', label: 'Novels' }];
const SECTIONS = [
  { id: 'home', label: 'Home', icon: 'fa-house' },
  { id: 'all', label: 'All', icon: 'fa-table-cells-large' },
  { id: 'lyrics', group: 'music', label: 'Lyrics', icon: 'fa-feather-pointed' },
  { id: 'demo', group: 'music', label: 'Demos', icon: 'fa-microphone' },
  { id: 'disc', group: 'music', label: 'Discography', icon: 'fa-compact-disc' },
  { id: 'docs', group: 'music', label: 'Docs', icon: 'fa-file' },
  { id: 'video', group: 'music', label: 'Videos', icon: 'fa-film' },
  { id: 'lyricvideo', group: 'music', label: 'Lyric Videos', icon: 'fa-film', hiddenNav: true },
  { id: 'n_notes', group: 'novels', label: 'Notes', icon: 'fa-note-sticky' },
  { id: 'n_bib', group: 'novels', label: 'Bibliography', icon: 'fa-book' },
  { id: 'n_docs', group: 'novels', label: 'Docs', icon: 'fa-file' },
  { id: 'n_video', group: 'novels', label: 'Videos', icon: 'fa-film' },
  { id: 'other', label: 'Other', icon: 'fa-folder-open' }
];
const SEC = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
/* hidden twins of two sections: Demos -> Early Demos (folder "Early Demos" inside Demos),
   Discography -> Unreleased Discography (folder "Unreleased Discography" inside Discography) */
const SECRET = { demo: { label: 'Early Demos', rx: /^early[\s_-]*demos?$/i }, disc: { label: 'Unreleased Discography', rx: /^unreleased(?:[\s_-]*discography)?$/i } };
const secLabel = (s) => (SECRET[s.id] && S.secret[s.id] ? SECRET[s.id].label : s.label);
const groupHidden = (it) => { const g = SEC[it.section] && SEC[it.section].group; return !!g && S.hideGroups.includes(g); };
/* what the whole console shows: no hidden files, no secret folders, no sections switched off in the Engineering menu */
const visibleItem = (i) => !i.hidden && !i.secret && !groupHidden(i);
function secretOf(it) {
  const k = SECRET[it.section];
  if (!k) return '';
  return (it.dir ? it.dir.split('/') : []).some((s) => k.rx.test(s)) ? it.section : '';
}
const GROUPED = new Set(['demo', 'lyrics', 'video', 'lyricvideo']); /* lists split by album folder */
const WIDE_SECS = new Set(['docs', 'n_docs', 'n_notes', 'n_bib']); /* these readers get a fixed-width panel */
/* ===== Details panel widths in px (desktop) — change the numbers here =====
   Everything else (Home, Demos, Discography, Videos...) uses the default 410px,
   which lives in style.css in the .app rule: var(--detail-w,410px). */
const HOME_DETAIL_MIN = 1700; /* the empty details panel is shown on Home only in windows at least this wide (px) */
const DETAIL_W = { lyrics: 499, docs: 929, n_docs: 929, n_notes: 914, n_bib: 939 };

/* folder-name rules (Russian and English names both work) */
const SEP = '(^|[^a-zа-яё0-9])';
const RX = {
  lyricvideo: /лирик|lyric[\s_-]*vid|lyrics?[\s_-]*video/i,
  disc: new RegExp('дискограф|discograph|альбом|album|релиз|release|сингл|single|' + SEP + 'ep($|[^a-z0-9])', 'i'),
  discContainer: /^(дискограф|discograph|releases?|релизы)/i,
  demo: new RegExp('демо|демк|demo|набросок|наброски|sketch|идеи|ideas', 'i'),
  lyrics: /текст|lyrics|слова/i,
  videoDir: /video|видео|клип/i,
  docsRoot: /^(docs?|documents?|документы?)$/i,
  docMusic: /^(music|музыка)$/i,
  docNovels: /^(novels?|романы?|книги?)$/i,
  notes: /^(notes?|заметки)$/i,
  bib: /^(bibliograph\w*|библиограф\w*|references|sources)$/i,
  novels: /^(novels?|романы?)$/i
};

/* ================= state ================= */
const S = {
  vault: false, handle: null, saved: null, desk: null, deskG: null, name: '',
  base: [], items: [], albums: [], byUid: new Map(), byPath: new Map(), uid: 1,
  idx: { byAlbumTitle: new Map(), byTitle: new Map() },
  section: 'home', query: '', sort: 'date',
  secret: {}, hideGroups: [],
  selected: null, now: null, queue: [], videoItem: null,
  meta: { favs: {}, notes: {}, dates: {}, history: [], last: '' },
  theme: lsGet('vault-theme', 'dark'),
  vol: Number(lsGet('vault-vol', '70')),
  muted: false, scanning: false
};

/* ================= classification ================= */
function autoSection(it) {
  const segs = it.dir ? it.dir.split('/') : [];
  const n = it.name;
  if (it.kind !== 'audio' && it.kind !== 'video') {
    const di = segs.findIndex((s) => RX.docsRoot.test(s));
    if (di >= 0) {
      const sub = segs[di + 1] || '';
      if (RX.docMusic.test(sub)) return 'docs';
      if (RX.docNovels.test(sub)) return 'n_docs';
      return 'other';
    }
    if (segs.some((s) => RX.notes.test(s))) return 'n_notes';
    if (segs.some((s) => RX.bib.test(s))) return 'n_bib';
  }
  if (it.kind === 'audio') {
    /* the outermost folder that names a section wins ("Demos/Alpha Album" is a demo, not a release) */
    for (const s of segs) {
      if (has(RX.demo, s)) return 'demo';
      if (has(RX.disc, s)) return 'disc';
    }
    return has(RX.demo, n) ? 'demo' : 'other';
  }
  if (it.kind === 'video') {
    if (segs.some((s) => RX.novels.test(s))) return 'n_video';
    return has(RX.lyricvideo, it.dir + '/' + n) ? 'lyricvideo' : 'video';
  }
  if (it.kind === 'text') return (has(RX.lyrics, it.dir) || has(RX.lyrics, n)) ? 'lyrics' : 'other';
  return 'other';
}

/* "Lyrics / Album name / song.txt": the album is the folder right after the section folder */
function albumNameOf(it) {
  const tries = it.section === 'lyrics' ? [RX.lyrics]
    : it.section === 'demo' ? [RX.demo]
      : it.section === 'video' ? [RX.videoDir]
        : it.section === 'lyricvideo' ? [RX.lyricvideo, RX.videoDir] : [];
  const segs = it.dir ? it.dir.split('/') : [];
  for (const rx of tries) {
    const i = segs.findIndex((s) => rx.test(s));
    if (i >= 0) return i + 1 < segs.length ? segs[i + 1] : '';
  }
  return '';
}

function albumKey(it) {
  const segs = it.dir ? it.dir.split('/') : [];
  const i = segs.findIndex((s) => has(RX.disc, s));
  if (i < 0) return null;
  if (RX.discContainer.test(segs[i])) return segs.length > i + 1 ? segs.slice(0, i + 2).join('/') : null;
  return segs.slice(0, i + 1).join('/');
}

function buildBase(entries) {
  const old = new Map(S.base.map((i) => [i.path, i]));
  S.base = entries.map((e) => {
    const prev = old.get(e.path);
    const same = prev && prev.size === e.file.size && prev.modified === e.file.lastModified;
    const ext = extOf(e.name);
    const kind = AUDIO.has(ext) ? 'audio' : VIDEO.has(ext) ? 'video' : TEXT.has(ext) ? 'text' : IMAGE.has(ext) ? 'image' : ext === 'pdf' ? 'pdf' : 'other';
    return {
      uid: S.uid++, path: e.path, name: e.name, ext, title: baseName(e.name), kind,
      file: e.file, size: e.file.size, modified: e.file.lastModified, dir: dirOf(e.path),
      dur: same ? prev.dur : null, vw: same ? prev.vw : 0, vh: same ? prev.vh : 0,
      text: same ? prev.text : null, thumb: same ? prev.thumb : undefined, peaks: same ? prev.peaks : null, tag: same ? prev.tag : undefined,
      metaState: same && prev.metaState >= 2 ? prev.metaState : 0, big: same ? prev.big : false,
      hidden: false, album: null, section: 'other', albumName: '', order: null, link: null, _hay: null
    };
  });
}

function classifyAll() {
  const albums = new Map();
  const imagesByDir = new Map();
  S.base.forEach((it) => {
    it.hidden = false; it.album = null; it.order = null; it.link = null;
    it.section = autoSection(it);
    it.albumName = albumNameOf(it);
    it.secret = secretOf(it);
    it._hay = null;
    if (it.kind === 'image') {
      it.hidden = true;
      if (!imagesByDir.has(it.dir)) imagesByDir.set(it.dir, []);
      imagesByDir.get(it.dir).push(it);
    }
  });
  S.base.forEach((it) => {
    if (it.kind === 'audio' && it.section === 'disc') {
      const key = albumKey(it);
      if (!key) return;
      let a = albums.get(key);
      if (!a) {
        a = { uid: S.uid++, kind: 'album', path: key, title: key.split('/').pop(), tracks: [], section: 'disc', ext: '', dir: dirOf(key), hidden: false, secret: '', albumName: '', _hay: null };
        albums.set(key, a);
      }
      a.tracks.push(it);
      if (it.secret) a.secret = it.secret;
      it.album = a;
      it.hidden = true;
    }
  });
  albums.forEach((a) => {
    a.size = a.tracks.reduce((s, t) => s + t.size, 0);
    a.modified = Math.max(...a.tracks.map((t) => t.modified));
    const imgs = imagesByDir.get(a.path) || [];
    a.cover = imgs.find((i) => /cover|обложк|folder|front|artwork|(^|[^a-z])art($|[^a-z])/i.test(i.name)) || imgs[0] || null;
  });
  S.albums = [...albums.values()];
  S.items = S.base.filter((i) => i.kind !== 'image').concat(S.albums);
  S.byUid = new Map(); S.byPath = new Map();
  S.items.forEach((i) => { S.byUid.set(i.uid, i); S.byPath.set(i.path, i); });
  applyOrdering();
}

/* ================= track numbers (from file tags) and discography links ================= */
const trackNoOf = (t) => (t.tag && t.tag.track != null ? t.tag.track : numFromName(t.name));

function sortAlbumTracks(a) {
  a.tracks.sort((x, y) => {
    const dx = (x.tag && x.tag.disc) || 1, dy = (y.tag && y.tag.disc) || 1;
    if (dx !== dy) return dx - dy;
    const nx = trackNoOf(x), ny = trackNoOf(y);
    if (nx != null && ny != null && nx !== ny) return nx - ny;
    if (nx != null && ny == null) return -1;
    if (nx == null && ny != null) return 1;
    return natural.compare(x.name, y.name);
  });
}

/* Lyrics, demos and videos get their order (and their album's date) from the Discography,
   matching by song title. */
function applyOrdering() {
  const byAlbumTitle = new Map(), byTitle = new Map();
  S.albums.forEach((a) => {
    sortAlbumTracks(a);
    const an = normT(a.title);
    a.tracks.forEach((t, i) => {
      const rec = { no: i + 1, album: a, track: t };
      const keys = [normT(t.title)];
      if (t.tag && t.tag.title) keys.push(normT(t.tag.title));
      keys.forEach((k) => {
        if (!k) return;
        byAlbumTitle.set(an + '|' + k, rec);
        if (!byTitle.has(k)) byTitle.set(k, rec);
      });
    });
  });
  S.idx = { byAlbumTitle, byTitle };
  S.items.forEach((it) => {
    if (!GROUPED.has(it.section)) return;
    const k = normT(it.title);
    const an = it.albumName ? normT(it.albumName) : '';
    const rec = (an && byAlbumTitle.get(an + '|' + k)) || byTitle.get(k) || null;
    it.link = rec ? rec.album : null;
    it.linkTrack = rec ? rec.track : null;
    it.order = rec ? rec.no : numFromName(it.name);
  });
}

/* ---- minimal tag readers: MP3 (ID3v2/v1), FLAC, M4A/MP4, WAV ---- */
const str = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const syncsafe = (b, o) => ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);
const u8 = async (f, a, b) => new Uint8Array(await f.slice(a, b).arrayBuffer());

function id3Text(b) {
  if (!b.length) return '';
  const enc = b[0];
  let data = b.subarray(1), label = 'iso-8859-1';
  if (enc === 1) {
    if (data[0] === 0xFF && data[1] === 0xFE) { label = 'utf-16le'; data = data.subarray(2); }
    else if (data[0] === 0xFE && data[1] === 0xFF) { label = 'utf-16be'; data = data.subarray(2); }
    else label = 'utf-16le';
  } else if (enc === 2) label = 'utf-16be';
  else if (enc === 3) label = 'utf-8';
  return new TextDecoder(label).decode(data).replace(/\0+$/, '');
}
async function readId3v2(f, head, t) {
  const ver = head[3], flags = head[5];
  const size = syncsafe(head, 6);
  const buf = await u8(f, 10, 10 + Math.min(size, f.url ? 262144 : 16 * 1024 * 1024));
  const dv = new DataView(buf.buffer);
  let p = 0;
  if ((flags & 0x40) && ver >= 3) p = ver === 4 ? syncsafe(buf, 0) : dv.getUint32(0) + 4;
  const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
  let tdrc = '', tyer = '';
  while (p + hdr <= buf.length) {
    const id = str(buf, p, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let fs;
    if (ver === 2) fs = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
    else if (ver === 4) fs = syncsafe(buf, p + 4);
    else fs = dv.getUint32(p + 4);
    const start = p + hdr;
    if (fs <= 0 || start + fs > buf.length) break;
    if (id === 'TRCK' || id === 'TRK') t.track = parseNum(id3Text(buf.subarray(start, start + fs)));
    else if (id === 'TPOS' || id === 'TPA') t.disc = parseNum(id3Text(buf.subarray(start, start + fs)));
    else if (id === 'TIT2' || id === 'TT2') t.title = id3Text(buf.subarray(start, start + fs));
    else if (id === 'TDRC') tdrc = id3Text(buf.subarray(start, start + fs));
    else if (id === 'TYER' || id === 'TYE') tyer = id3Text(buf.subarray(start, start + fs));
    p = start + fs;
  }
  t.date = normDate(tdrc || tyer);
}
async function readId3v1(f, t) {
  if (f.size < 128) return;
  const b = await u8(f, f.size - 128, f.size);
  if (str(b, 0, 3) !== 'TAG') return;
  if (b[125] === 0 && b[126] !== 0) t.track = b[126];
  if (!t.title) t.title = new TextDecoder('iso-8859-1').decode(b.subarray(3, 33)).replace(/[\0\s]+$/, '');
}
async function readFlac(f, t) {
  let pos = 4;
  for (let i = 0; i < 40; i++) {
    const h = await u8(f, pos, pos + 4);
    if (h.length < 4) break;
    const last = h[0] & 0x80, type = h[0] & 0x7f, len = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 4) {
      const b = await u8(f, pos + 4, pos + 4 + Math.min(len, 1 << 20));
      const dv = new DataView(b.buffer);
      let p = 4 + dv.getUint32(0, true);
      const n = dv.getUint32(p, true); p += 4;
      for (let k = 0; k < n && p + 4 <= b.length; k++) {
        const l = dv.getUint32(p, true); p += 4;
        const s = new TextDecoder().decode(b.subarray(p, p + l)); p += l;
        const eq = s.indexOf('=');
        if (eq < 0) continue;
        const key = s.slice(0, eq).toUpperCase(), val = s.slice(eq + 1);
        if (key === 'TRACKNUMBER') t.track = parseNum(val);
        else if (key === 'DISCNUMBER') t.disc = parseNum(val);
        else if (key === 'TITLE') t.title = val;
        else if (key === 'DATE' || key === 'YEAR') t.date = normDate(val);
      }
      break;
    }
    if (last) break;
    pos += 4 + len;
  }
}
async function readRiff(f, t) {
  let pos = 12;
  for (let i = 0; i < 64; i++) {
    const h = await u8(f, pos, pos + 12);
    if (h.length < 8) break;
    const id = str(h, 0, 4), len = u32le(h, 4);
    if (id === 'LIST' && h.length >= 12 && str(h, 8, 4) === 'INFO') {
      const b = await u8(f, pos + 12, pos + 8 + len);
      let p = 0;
      while (p + 8 <= b.length) {
        const sid = str(b, p, 4), sl = u32le(b, p + 4);
        const val = new TextDecoder().decode(b.subarray(p + 8, p + 8 + sl)).replace(/\0+$/, '');
        if (sid === 'ITRK' || sid === 'IPRT') t.track = parseNum(val);
        else if (sid === 'INAM') t.title = val;
        else if (sid === 'ICRD') t.date = normDate(val);
        p += 8 + sl + (sl & 1);
      }
      break;
    }
    pos += 8 + len + (len & 1);
  }
}
function walkMp4(b, s, e, t) {
  let p = s;
  while (p + 8 <= e) {
    const size = u32be(b, p), type = str(b, p + 4, 4);
    if (size < 8 || p + size > e) break;
    if (type === 'udta' || type === 'ilst') walkMp4(b, p + 8, p + size, t);
    else if (type === 'meta') walkMp4(b, p + 12, p + size, t);
    else if (type === 'trkn' || type === 'disk' || type === '©nam' || type === '©day') {
      if (p + 24 <= p + size && str(b, p + 12, 4) === 'data') {
        const pl = p + 24, end = p + size;
        if (type === 'trkn') t.track = (b[pl + 2] << 8) | b[pl + 3];
        else if (type === 'disk') t.disc = (b[pl + 2] << 8) | b[pl + 3];
        else if (type === '©nam') t.title = new TextDecoder().decode(b.subarray(pl, end));
        else t.date = normDate(new TextDecoder().decode(b.subarray(pl, end)));
      }
    }
    p += size;
  }
}
async function readMp4(f, t) {
  let pos = 0;
  for (let i = 0; i < 64; i++) {
    const h = await u8(f, pos, pos + 16);
    if (h.length < 8) break;
    let size = u32be(h, 0), hdr = 8;
    const type = str(h, 4, 4);
    if (size === 1) { size = u32be(h, 12); hdr = 16; }
    if (size === 0) size = f.size - pos;
    if (type === 'moov') {
      const b = await u8(f, pos + hdr, pos + Math.min(size, 16 * 1024 * 1024));
      /* moov -> udta -> meta -> ilst */
      let p = 0;
      while (p + 8 <= b.length) {
        const sz = u32be(b, p), ty = str(b, p + 4, 4);
        if (sz < 8) break;
        if (ty === 'udta') walkMp4(b, p + 8, Math.min(p + sz, b.length), t);
        p += sz;
      }
      break;
    }
    if (size < hdr) break;
    pos += size;
  }
}
async function readTags(it) {
  const t = { track: null, disc: null, title: '', date: '' };
  try {
    const f = it.file;
    const head = await u8(f, 0, 12);
    const s4 = str(head, 0, 4);
    if (s4.startsWith('ID3')) await readId3v2(f, head, t);
    else if (s4 === 'fLaC') await readFlac(f, t);
    else if (s4 === 'RIFF') await readRiff(f, t);
    else if (str(head, 4, 4) === 'ftyp') await readMp4(f, t);
    if (it.ext === 'mp3' && t.track == null) await readId3v1(f, t);
  } catch (e) { /* unreadable tags: fall back to file names */ }
  return t;
}
let tagRun = 0;
async function loadAllTags() {
  const run = ++tagRun;
  const list = S.base.filter((i) => i.kind === 'audio' && i.section === 'disc' && i.tag === undefined);
  if (!list.length) return;
  let idx = 0;
  const worker = async () => {
    while (idx < list.length && run === tagRun) {
      const it = list[idx++], f = it.file;
      const c = f.remote && S.dinfo && S.dinfo.tags[f.id];
      if (c && c.mod === f.lastModified) { it.tag = c.t; continue; }
      it.tag = await readTags(it);
      if (f.remote && S.dinfo) { S.dinfo.tags[f.id] = { mod: f.lastModified, t: it.tag }; dinfoSave(); }
    }
  };
  await Promise.all(Array.from({ length: S.drive ? 10 : 3 }, worker));
  if (run !== tagRun) return;
  applyOrdering();
  if (S.scanning) return; /* the preloader is still up: the final redraw happens when it closes */
  renderList();
  if (S.selected && (S.selected.kind === 'album' || GROUPED.has(S.selected.section))) refreshFacts();
  if (S.selected && S.selected.kind === 'album') renderDetail();
}

/* ================= dates ================= */
function defaultDate(it) {
  if (it.kind === 'album') {
    for (const t of it.tracks) if (t.tag && t.tag.date) return t.tag.date;
    const m = it.title.match(RX_YEAR) || it.path.match(RX_YEAR);
    if (m) return m[1];
  }
  return isoDay(it.modified);
}
/* lyrics, demos and videos take their date from the matching Discography song (own date wins, then the album's) */
function getDate(it) {
  if (S.meta.dates[it.path]) return S.meta.dates[it.path];
  if (it.link) {
    if (S.meta.dates[it.link.path]) return S.meta.dates[it.link.path];
    const t = it.linkTrack;
    if (t && t.tag && t.tag.date) return t.tag.date;
    return defaultDate(it.link);
  }
  return defaultDate(it);
}
const isDateEditable = () => true;

/* ================= list data ================= */
function haystack(it) {
  if (it._hay === null) {
    it._hay = (it.title + ' ' + it.path + ' ' + (it.text || '') + ' ' + (it.tracks ? it.tracks.map((t) => t.title).join(' ') : '')).toLowerCase();
  }
  return it._hay;
}
function filtered() {
  const q = S.query.trim().toLowerCase();
  let list = S.items.filter(visibleItem);
  if (SECRET[S.section] && S.secret[S.section]) list = S.items.filter((i) => !i.hidden && !groupHidden(i) && i.section === S.section && i.secret === S.section);
  if (S.section !== 'home' && S.section !== 'all') {
    list = list.filter((i) => i.section === S.section || (S.section === 'video' && i.section === 'lyricvideo'));
  }
  if (q) list = list.filter((i) => haystack(i).includes(q));
  return list;
}
function sortItems(list) {
  const out = list.slice();
  if (S.sort === 'date') out.sort((a, b) => dateTs(getDate(a)) - dateTs(getDate(b)) || natural.compare(a.title, b.title));
  else out.sort((a, b) => natural.compare(a.title, b.title));
  return out;
}
const trackCmp = (a, b) => {
  const x = a.order, y = b.order;
  if (x != null && y != null && x !== y) return x - y;
  if (x != null && y == null) return -1;
  if (x == null && y != null) return 1;
  return natural.compare(a.title, b.title);
};
/* groups = album folders; songs inside a group follow the discography track numbers */
function groupItems(list) {
  const map = new Map();
  list.forEach((it) => { const k = it.albumName || ''; if (!map.has(k)) map.set(k, []); map.get(k).push(it); });
  const named = [], none = [];
  map.forEach((items, name) => {
    if (!name) { none.push(...items); return; }
    items.sort(trackCmp);
    let ts = null;
    for (const it of items) if (it.link) { ts = dateTs(getDate(it.link)); break; }
    if (ts === null) ts = Math.max(...items.map((it) => dateTs(getDate(it))));
    named.push({ name, items, ts });
  });
  named.sort(S.sort === 'date' ? (a, b) => a.ts - b.ts || natural.compare(a.name, b.name) : (a, b) => natural.compare(a.name, b.name));
  if (none.length) named.push({ name: '', items: sortItems(none) });
  return named;
}
/* Early Demos: one group per year */
function groupByYear(list) {
  const map = new Map();
  list.forEach((it) => { const fy = (it.dir ? it.dir.split('/') : []).find((p) => /^(19|20)\d\d$/.test(p));
    const y = fy || String(getDate(it) || '').slice(0, 4) || 'Unknown'; if (!map.has(y)) map.set(y, []); map.get(y).push(it); });
  return [...map.entries()].sort((a, b) => (S.sort === 'date' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]))).map(([name, items]) => ({ name, items: sortItems(items) }));
}
function layout() {
  const list = filtered();
  if (S.section === 'video') {
    return { cols: [
      { title: 'Videos', groups: groupItems(list.filter((i) => i.section !== 'lyricvideo')) },
      { title: 'Lyric Videos', groups: groupItems(list.filter((i) => i.section === 'lyricvideo')) }
    ] };
  }
  if (S.section === 'demo' && S.secret.demo) return { groups: groupByYear(list) };
  if (GROUPED.has(S.section)) return { groups: groupItems(list) };
  return { groups: [{ name: '', items: sortItems(list) }] };
}
function visible() {
  const L = layout();
  const gs = L.cols ? L.cols.flatMap((c) => c.groups) : L.groups;
  return gs.flatMap((g) => g.items);
}
function kindLabel(it) {
  if (it.kind === 'album') return 'Album';
  if (it.album) return 'Track';
  const audioish = it.kind === 'audio' ? 'Track' : 'File';
  const m = { demo: 'Demo', lyrics: 'Lyrics', disc: audioish, video: 'Video', lyricvideo: 'Lyric Video', docs: 'Document', n_notes: 'Note', n_bib: 'Novel', n_video: 'Video', n_docs: 'Document', other: audioish };
  return m[it.section] || 'File';
}
const iconOf = (it) => (SEC[it.section] || SEC.other).icon;
const isPlayable = (it) => it.kind === 'audio' || it.kind === 'album' || it.kind === 'video';
function bpmOf(it) {
  const m = it.name.match(/(\d{2,3})\s*bpm/i) || it.name.match(/bpm\s*[-_ ]?(\d{2,3})/i);
  return m ? m[1] : '';
}
function albumDur(a) {
  if (a.tracks.some((t) => t.metaState < 2)) return null;
  return a.tracks.reduce((s, t) => s + (t.dur || 0), 0);
}
function durText(it) {
  if (it.kind === 'album') { const d = albumDur(it); return d === null ? '…' : fmt(d); }
  if (it.kind === 'audio' || it.kind === 'video') return it.dur ? fmt(it.dur) : (it.metaState === 3 ? '—' : '…');
  return '';
}

/* ================= persistence ================= */
let saveTimer;
const fileUrl = (f) => (f.url ? f.url() : URL.createObjectURL(f));
const freeUrl = (u) => { if (u && String(u).startsWith('blob:')) URL.revokeObjectURL(u); };
function saveMeta() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => idb.set('meta:' + (S.metaKey || S.name), S.meta), 350);
}

/* ================= folder reading ================= */
async function walk(dir, prefix, out) {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    if (h.kind === 'directory') await walk(h, prefix + name + '/', out);
    else out.push({ path: prefix + name, name, handle: h });
  }
}

/* desktop app: a file of the chosen folder, read through the local server of the app (supports seeking) */
const DESK_MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain', lrc: 'text/plain' };
class DeskFile {
  constructor(base, e) {
    this.base = base; this.rel = e.p;
    this.name = e.p.slice(e.p.lastIndexOf('/') + 1);
    this.size = e.s; this.lastModified = e.m;
    this.type = DESK_MIME[extOf(this.name)] || '';
  }
  url() { return this.base + '/' + this.rel.split('/').map(encodeURIComponent).join('/'); }
  async _get(range) {
    const r = await fetch(this.url(), range ? { headers: { Range: range } } : {});
    if (r.status === 416) return null;
    if (!r.ok && r.status !== 206) throw new Error('Could not read ' + this.name);
    return r;
  }
  async text() { return (await this._get()).text(); }
  async arrayBuffer() { return (await this._get()).arrayBuffer(); }
  slice(a, b) {
    const self = this;
    return { arrayBuffer: async () => { if (a >= self.size || b <= a) return new ArrayBuffer(0); const r = await self._get('bytes=' + a + '-' + (b - 1)); return r ? r.arrayBuffer() : new ArrayBuffer(0); } };
  }
}
async function openDesk(dir) {
  S.handle = null; S.drive = null; S.source = 'local'; S.desk = { path: dir };
  setScanning(true, 'Reading folder…');
  try {
    const info = await DESK.info();
    if (!info || !info.fileBase) throw new Error('The desktop app is not ready');
    const r = await DESK.openFolder(dir);
    if (!r || !r.ok) throw new Error((r && r.message) || 'Could not open the folder');
    const entries = r.entries.map((e) => ({ path: e.p, name: e.p.slice(e.p.lastIndexOf('/') + 1), file: new DeskFile(info.fileBase, e) }));
    lsSet(srcKey(), JSON.stringify({ type: 'desk', path: dir, name: r.name }));
    await loadVault(entries, r.name, 'd:' + dir);
  } catch (e) {
    console.error(e);
    setScanning(false);
    renderList();
    warn(e.message || 'Could not open the folder');
    if (isLocked()) openSourceDialog(true);
    throw e;
  }
}

async function pickLocal() {
  if (DESK) {
    const r = await DESK.pickFolder();
    if (!r || !r.path) return 'cancel';
    try { await openDesk(r.path); return 'ok'; } catch (e) { return 'cancel'; }
  }
  if (window.showDirectoryPicker) {
    try {
      const h = await window.showDirectoryPicker({ mode: 'read' });
      await idb.set('handle', h);
      S.saved = h;
      await openHandle(h);
      return 'ok';
    } catch (e) {
      if (e && e.name !== 'AbortError') { console.error(e); warn('Could not open the folder'); }
      return 'cancel';
    }
  }
  $('#fallback').click();
  return 'pending';
}

async function openHandle(h) {
  S.handle = h; S.desk = null;
  S.source = 'local'; S.drive = null;
  lsSet(srcKey(), '{"type":"local"}');
  setScanning(true, 'Reading folder…');
  try {
    const entries = [];
    await walk(h, '', entries);
    const files = [];
    for (let i = 0; i < entries.length; i += 24) {
      const chunk = entries.slice(i, i + 24);
      await Promise.all(chunk.map(async (e) => {
        try { e.file = await e.handle.getFile(); files.push(e); } catch (err) { /* skip unreadable */ }
      }));
      setScanning(true, 'Reading folder… ' + files.length);
    }
    await loadVault(files, h.name);
  } catch (e) {
    console.error(e);
    warn('Error reading the folder');
    setScanning(false);
    if (isLocked()) openSourceDialog(true);
  }
}

async function loadVault(entries, name, key) {
  entries.sort((a, b) => natural.compare(a.path, b.path));
  const prevSelected = S.selected ? S.selected.path : null;
  const prevNowPath = S.now ? S.now.path : null;
  S.name = name;
  S.metaKey = key || name;
  const stored = await idb.get('meta:' + S.metaKey);
  S.meta = Object.assign({ favs: {}, notes: {}, dates: {}, history: [], last: '' }, stored || {});
  if (!Array.isArray(S.meta.history)) S.meta.history = [];
  if (!S.meta.dates) S.meta.dates = {};
  loadQ.length = 0;
  buildBase(entries);
  classifyAll();
  if (prevNowPath) {
    const again = S.byPath.get(prevNowPath);
    if (again) { S.now = again; S.queue = S.queue.map((q) => S.byPath.get(q.path) || q); }
  }
  S.selected = (prevSelected && S.byPath.get(prevSelected)) || null; /* a fresh start shows an empty details panel */
  setStatus('Sorting your library…');
  S.dinfo = null;
  if (S.source === 'drive') {
    S.dinfo = (await idb.get('dinfo:' + S.metaKey)) || {};
    if (!S.dinfo.tags) S.dinfo.tags = {};
    if (!S.dinfo.meta) S.dinfo.meta = {};
    if (S.dinfo.v !== 2) { S.dinfo.meta = {}; S.dinfo.v = 2; }
    S.base.forEach((it) => {
      const f = it.file, m = f && f.remote && S.dinfo.meta[f.id];
      if (m && m.mod === f.lastModified && (it.kind === 'audio' || it.kind === 'video') && m.dur > 0) {
        it.dur = m.dur; if (m.vw) { it.vw = m.vw; it.vh = m.vh; } if (m.thumb) it.thumb = m.thumb; it.metaState = 2;
      }
    });
  }
  S.vault = true;
  $('#folderName').textContent = name;
  S.base.forEach((it) => { if (it.kind === 'audio' || it.kind === 'video') queueMeta(it); });
  setStatus('Loading covers and track info…');
  /* keep the preloader until covers and tags are in, so the page doesn't redraw after it opens */
  const drv = S.source === 'drive';
  const ready = Promise.all([preloadCovers(), loadAllTags(), drv ? waitMeta(30000) : null]).catch(() => {});
  await Promise.race([ready, new Promise((r) => setTimeout(r, drv ? 32000 : 12000))]);
  renderAll();
  closeDialog();
  document.body.classList.remove('locked');
  setScanning(false);
  loadAllText();
}

const isLocked = () => document.body.classList.contains('locked');
/* ---- preloader: logo, a thin bar and a changing line of text.
   The lines name what the console is preparing (they go in order, no dots, no counters). */
const LD_TEXTS = [
  'Reading your library', 'Loading song metadata', 'Preparing album covers', 'Collecting lyrics', 'Sorting demos',
  'Building the discography', 'Checking track durations', 'Organizing albums by date', 'Gathering videos and docs', 'Setting up search',
  'Preparing the player', 'Arranging your Home page'
];
const LD = { on: false, long: false, p: 0, t0: 0, iv: 0, rot: 0, i: 0, order: [], sticky: '', hideT: 0 };
function ldFill(w, instant) {
  const f = $('#ldFill');
  if (!f) return;
  if (instant) { f.style.transition = 'none'; f.style.width = w + '%'; void f.offsetWidth; f.style.transition = ''; } else f.style.width = w + '%';
}
function ldShowText() {
  const m = $('#loaderMsg');
  if (!m) return;
  m.classList.remove('show');
  setTimeout(() => {
    if (!LD.on) return;
    m.textContent = LD.sticky || LD.order[LD.i++ % LD.order.length];
    m.classList.add('show');
  }, 400);
}
function ldStart(long) {
  if (LD.hideT) LD.on = false; /* it was just finishing: start over */
  clearTimeout(LD.hideT); LD.hideT = 0;
  if (long && !LD.long) {
    LD.long = true;
    LD.order = LD_TEXTS.slice(); LD.i = 0;
    if (LD.on) { clearInterval(LD.rot); ldShowText(); LD.rot = setInterval(ldShowText, 2900); }
  }
  if (LD.on) return;
  LD.on = true; LD.p = 0; LD.t0 = performance.now();
  ldFill(0, true);
  clearInterval(LD.iv);
  LD.iv = setInterval(() => {
    const dt = performance.now() - LD.t0;
    LD.p = Math.max(LD.p, 94 * (1 - Math.exp(-dt / (LD.long ? 7000 : 800))));
    ldFill(LD.p.toFixed(1));
  }, 140);
  if (LD.long) { ldShowText(); clearInterval(LD.rot); LD.rot = setInterval(ldShowText, 2900); }
}
function ldFinish(done) {
  clearInterval(LD.iv); clearInterval(LD.rot);
  ldFill(100);
  LD.hideT = setTimeout(() => {
    LD.hideT = 0; LD.on = false; LD.long = false; LD.sticky = '';
    const m = $('#loaderMsg'); if (m) { m.classList.remove('show'); m.textContent = ''; }
    done();
  }, 420);
}
/* only a message that needs the person (e.g. "finish signing in in the browser") is shown for real */
function setStatus(msg, sticky) {
  if (!sticky) return;
  LD.sticky = msg || '';
  if (LD.on) ldShowText();
}
function setScanning(on, msg) {
  const was = S.scanning;
  S.scanning = on;
  const l = $('#loader');
  if (on) {
    ldStart(!!msg || LD.long);
    if (l) l.classList.add('on');
    return;
  }
  const finish = () => {
    if (l) l.classList.remove('on');
    if (!isLocked() && (was || !S.introShown)) { S.introShown = true; requestAnimationFrame(runIntro); }
  };
  const shown = l && l.classList.contains('on');
  if (shown && !LD.hideT) ldFinish(finish);
  else if (!shown) finish();
}
/* gentle top-to-bottom fade-in: everything on entering the site, only the list area when switching sections */
/* the whole list fades in as one smooth sweep: total spread ~0.22s however many rows there are */
function stagger(nodes) {
  const arr = [...nodes];
  const cap = Math.max(1, Math.min(arr.length - 1, 14));
  arr.forEach((n, i) => n.style.setProperty('--d', (Math.min(i, cap) / cap * 0.22).toFixed(3) + 's'));
}
function runIntro() {
  const app = $('#app');
  if (!app) return;
  stagger($('#nav').children);
  const list = $('#list');
  stagger(list.querySelector(':scope > .home') ? list.querySelector(':scope > .home').children : list.children);
  app.classList.remove('intro'); void app.offsetWidth; app.classList.add('intro');
  clearTimeout(runIntro.t);
  runIntro.t = setTimeout(() => app.classList.remove('intro'), 1800);
}
function runSwap() {
  const list = $('#list');
  if (!list) return;
  const home = list.querySelector(':scope > .home');
  stagger(home ? home.children : list.children);
  list.classList.remove('swap'); void list.offsetWidth; list.classList.add('swap');
  clearTimeout(runSwap.t);
  runSwap.t = setTimeout(() => list.classList.remove('swap'), 800);
}

async function refresh() {
  if (!S.vault) return;
  if (S.source === 'drive' && S.drive) {
    try { await openDrive(S.drive.id, true, false, true); toast('File list refreshed'); } catch (e) { /* already reported */ }
    return;
  }
  if (S.desk && DESK) { try { await openDesk(S.desk.path); toast('File list refreshed'); } catch (e) { /* already reported */ } return; }
  if (S.handle) {
    try {
      const p = await S.handle.requestPermission({ mode: 'read' });
      if (p !== 'granted') { warn('No access to the folder'); return; }
    } catch (e) { /* ignore */ }
    await openHandle(S.handle);
    toast('File list refreshed');
  } else {
    warn('Open the folder again to refresh');
  }
}

/* ================= background metadata ================= */
const loadQ = [];
let loading = 0;
function queueMeta(it) {
  if (it.metaState) return;
  it.metaState = 1;
  loadQ.push(it);
  pumpMeta();
}
/* first visit: wait until durations (and video stills) are read, so playing starts with full info */
function waitMeta(cap) {
  return new Promise((res) => {
    const t0 = Date.now();
    const total = S.base.filter((i) => (i.kind === 'audio' || i.kind === 'video') && i.metaState === 1).length;
    const tick = () => {
      const pend = S.base.filter((i) => (i.kind === 'audio' || i.kind === 'video') && i.metaState === 1).length;
      if (!pend || Date.now() - t0 > cap) { res(); return; }
      setStatus('Reading track info… ' + (total - pend) + ' / ' + total);
      setTimeout(tick, 250);
    };
    tick();
  });
}
/* ---- on-device cache for Drive: durations, video stills, tags ---- */
function dinfoSave() {
  clearTimeout(dinfoSave.t);
  dinfoSave.t = setTimeout(() => { if (S.dinfo && S.source === 'drive') idb.set('dinfo:' + S.metaKey, S.dinfo); }, 1500);
}
function cacheMeta(it) {
  if (!S.dinfo || !it.file || !it.file.remote) return;
  S.dinfo.meta[it.file.id] = { mod: it.file.lastModified, dur: it.dur, vw: it.vw || 0, vh: it.vh || 0, thumb: it.thumb || '' };
  dinfoSave();
}
/* cut off pure-black bars that are part of the video picture, and scale to a small still */
function cropBars(cv, g) {
  const w = cv.width, h = cv.height;
  const d = g.getImageData(0, 0, w, h).data;
  const dark = (x, y) => { const i = (y * w + x) * 4; return d[i] + d[i + 1] + d[i + 2] < 30; };
  const rowDark = (y) => { for (let x = 0; x < w; x += 3) if (!dark(x, y)) return false; return true; };
  const colDark = (x) => { for (let y = 0; y < h; y += 3) if (!dark(x, y)) return false; return true; };
  let t = 0, b = h - 1, l = 0, r = w - 1;
  while (t < b && rowDark(t)) t++;
  while (b > t && rowDark(b)) b--;
  while (l < r && colDark(l)) l++;
  while (r > l && colDark(r)) r--;
  let cw = r - l + 1, ch = b - t + 1;
  if (cw < w * 0.3 || ch < h * 0.3 || (cw > w * 0.97 && ch > h * 0.97)) { l = 0; t = 0; cw = w; ch = h; }
  const out = document.createElement('canvas');
  const k = Math.min(1, 240 / cw);
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  out.getContext('2d').drawImage(cv, l, t, cw, ch, 0, 0, out.width, out.height);
  return out;
}
function pumpMeta() {
  while (loading < (S.source === 'drive' ? 8 : 4) && loadQ.length) {
    const it = loadQ.shift();
    loading++;
    const el = document.createElement(it.kind === 'video' ? 'video' : 'audio');
    el.preload = it.kind === 'video' ? 'auto' : 'metadata';
    const url = fileUrl(it.file);
    let finished = false;
    const done = (ok) => {
      if (finished) return;
      finished = true;
      if (ok) { it.dur = el.duration; if (it.kind === 'video') { it.vw = el.videoWidth; it.vh = el.videoHeight; } it.metaState = 2; cacheMeta(it); }
      else it.metaState = 3;
      freeUrl(url);
      el.removeAttribute('src');
      try { el.load(); } catch (e) { /* release the media resource */ }
      loading--;
      onMeta(it);
      pumpMeta();
    };
    el.onloadedmetadata = () => {
      if (!(isFinite(el.duration) && el.duration > 0)) { done(false); return; }
      if (it.kind === 'video' && !it.thumb) {
        /* grab a still frame for the list preview */
        el.muted = true;
        try { el.currentTime = el.duration * 0.5; } catch (e) { done(true); }
      } else done(true);
    };
    el.onseeked = () => {
      if (finished || it.kind !== 'video') return;
      try {
        const sc = Math.min(1, 480 / (el.videoWidth || 480));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(el.videoWidth * sc)); cv.height = Math.max(1, Math.round(el.videoHeight * sc));
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(el, 0, 0, cv.width, cv.height);
        if (!it._thumbTry) { /* a nearly black frame: try another spot once */
          const px = g.getImageData(0, 0, cv.width, cv.height).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 16) sum += px[i] + px[i + 1] + px[i + 2];
          if (sum / (px.length / 16) / 3 < 14) { it._thumbTry = 1; el.currentTime = el.duration * 0.3; return; }
        }
        it.thumb = cropBars(cv, g).toDataURL('image/jpeg', 0.72);
      } catch (e) { /* no preview */ }
      done(true);
    };
    el.onerror = () => {
      done(false);
    };
    setTimeout(() => done(false), it.kind === 'video' ? 20000 : 10000);
    el.src = url;
  }
}
function onMeta(it) {
  updateDurUI(it);
  updateLead(it);
  if (it.album) updateDurUI(it.album);
  updateBinds();
  scheduleHome();
}
function updateLead(it) {
  if (!it.thumb) return;
  const lead = $(`#list .row[data-uid="${it.uid}"] .lead`);
  const ico = lead && lead.querySelector('.ico');
  if (!ico) return;
  const img = document.createElement('img');
  img.className = 'lead-cover'; img.alt = ''; img.src = it.thumb;
  ico.replaceWith(img);
  lead.classList.add('cv');
}
function updateDurUI(it) {
  if (it.kind === 'album') return;
  const row = $(`#list .row[data-uid="${it.uid}"] .dur`);
  if (row) row.textContent = durText(it);
}

async function ensureText(it) {
  if (it.text !== null) return it.text;
  if (it.size > 3e6) { it.big = true; it.text = ''; return ''; }
  try { it.text = await it.file.text(); } catch (e) { it.text = ''; }
  it._hay = null;
  return it.text;
}
async function loadAllText() {
  const list = S.base.filter((i) => i.kind === 'text' && i.text === null);
  let idx = 0;
  const worker = async () => { while (idx < list.length) { const it = list[idx++]; await ensureText(it); } };
  await Promise.all([worker(), worker(), worker()]);
  if (S.query) renderList(); else scheduleHome();
}

/* ================= rendering: nav / head / list ================= */
function renderNav() {
  const counts = {};
  S.items.forEach((i) => { if (visibleItem(i)) counts[i.section] = (counts[i.section] || 0) + 1; });
  const total = S.items.filter(visibleItem).length;
  Object.keys(SECRET).forEach((k) => { if (S.secret[k]) counts[k] = S.items.filter((i) => !i.hidden && !groupHidden(i) && i.section === k && i.secret === k).length; });
  const num = (id) => (id === 'all' ? total : id === 'video' ? (counts.video || 0) + (counts.lyricvideo || 0) : (counts[id] || 0));
  const btn = (s) => `<button data-sec="${s.id}" class="${S.section === s.id ? 'on' : ''}"><i class="fa-solid ${s.icon}"></i><span>${secLabel(s)}</span><span class="n">${S.vault ? num(s.id) : ''}</span></button>`;
  let html = '';
  if (SHOW_ALL_IN_MENU) html += btn(SEC.all);
  GROUPS.filter((g) => !S.hideGroups.includes(g.id)).forEach((g) => {
    html += `<div class="nav-h">${g.label}</div>`;
    SECTIONS.filter((s) => s.group === g.id && !s.hiddenNav).forEach((s) => { html += btn(s); });
  });
  $('#nav').innerHTML = html;
}

function renderHead() {
  const s = SEC[S.section];
  const searching = S.section === 'home' && !!S.query.trim();
  const home = S.section === 'home' && !searching;
  $('#title').textContent = searching ? 'Search' : secLabel(s);
  $('#sort').hidden = home;
  applyDetailWidth();
  $$('#sort button').forEach((b) => b.classList.toggle('on', b.dataset.sort === S.sort));
}

function welcomeHtml() {
  const savedName = S.source === 'drive' && S.drive ? S.drive.name + ' (Drive)' : (S.saved ? S.saved.name : '');
  const cont = savedName ? `<button class="ghost" data-act="continue"><i class="fa-solid fa-clock-rotate-left"></i>Continue: ${esc(savedName)}</button>` : '';
  return `<div class="welcome">
    <div class="w-ico"><i class="fa-solid fa-folder-open"></i></div>
    <h2>Open Your Folder</h2>
    <p>Open a folder from this computer or from Google Drive. Files are only read, never changed or uploaded.</p>
    <div class="btns"><button class="primary" data-act="open"><i class="fa-solid fa-folder-open"></i>Choose Folder</button>${cont}</div>
    <p class="hint">${savedName ? 'Click anywhere to reopen your last folder. ' : ''}Your files can come from this computer or from Google Drive.</p>
  </div>`;
}

function rowHtml(it) {
  const playable = isPlayable(it);
  const fav = !!S.meta.favs[it.path];
  let sub = (it.kind === 'album' || it.section === 'n_bib') ? monthYear(getDate(it)) : kindLabel(it);
  const bpm = it.kind === 'audio' ? bpmOf(it) : '';
  if (bpm) sub += ' · ' + bpm + ' BPM';
  const cov = it.kind === 'album' && it.cover ? coverUrl(it.cover) : (it.thumb || '');
  const right = it.kind === 'album' ? it.tracks.length + ' Songs' : durText(it);
  return `<div class="row" data-uid="${it.uid}">
    <div class="lead ${cov ? 'cv' : ''}">
      ${cov ? `<img class="lead-cover" alt="" src="${cov}">` : `<span class="ico ${playable ? 'has' : ''}"><i class="fa-solid ${iconOf(it)}"></i></span>`}
      ${playable ? '<button class="rowplay" data-act="play" aria-label="Play"><i class="fa-solid fa-play"></i></button>' : ''}
    </div>
    <button class="main-btn" data-act="select"><span class="t"><b>${esc(it.title)}</b><small>${esc(sub)}</small></span><span class="dur">${esc(right)}</span></button>
    <button class="star ${fav ? 'on' : ''}" data-act="fav" aria-label="Favorite"><i class="${fav ? 'fa-solid' : 'fa-regular'} fa-star"></i></button>
  </div>`;
}
const groupsHtml = (groups) => groups.map((g) => (g.name ? `<div class="grp-h">${esc(g.name)}</div>` : '<div class="grp-none"></div>') + g.items.map(rowHtml).join('')).join('');

/* ---- home screen ---- */
let homeTimer;
function scheduleHome() {
  if (S.section !== 'home' || S.query.trim() || !S.vault) return;
  clearTimeout(homeTimer);
  homeTimer = setTimeout(() => { if (S.section === 'home' && !S.query.trim()) renderList(); }, 400);
}
const HOME_RANK = new Map();
const homeRank = (al) => { const k = al.title; if (!HOME_RANK.has(k)) HOME_RANK.set(k, Math.random()); return HOME_RANK.get(k); };
function homeHtml() {
  const items = S.items.filter(visibleItem);
  /* a random order that is drawn once per page load and then stays, whatever dates arrive later */
  const albums = S.albums.filter(visibleItem).sort((x, y) => homeRank(x) - homeRank(y));
  const coverOf = (al) => (al.cover ? `<img alt="" decoding="sync" src="${coverUrl(al.cover)}">` : '<i class="fa-solid fa-compact-disc"></i>');
  const grid = albums.slice(0, 12).map((al) => `<button class="alb" data-open="${al.uid}"><span class="cv">${coverOf(al)}</span><b>${esc(al.title)}</b><small>${esc(monthYear(getDate(al)))}</small></button>`).join('');
  const recent = items.filter((i) => !(i.kind === 'audio' && i.section === 'disc')).sort((x, y) => y.modified - x.modified).slice(0, 40);
  const KIND_LABEL = { lyrics: 'Lyrics', demo: 'Demo', disc: 'Track', docs: 'Document', n_docs: 'Document', video: 'Video', n_video: 'Video', lyricvideo: 'Lyric Video', n_notes: 'Note', n_bib: 'Novel' };
  const row = (it) => {
    const alb = it.kind === 'album';
    const sub = (SEC[alb ? 'disc' : it.section] || SEC.other).label;
    return `<button class="rrow" data-pick="${it.uid}"><span class="ri"><i class="fa-solid ${alb ? 'fa-compact-disc' : iconOf(it)}"></i></span><span class="rt"><b>${esc(it.title)}</b><small>${esc(sub)}</small></span><span class="rd">${esc(monthYear(getDate(it)))}</span></button>`;
  };
  return `<div class="home">
    <section class="hsec home-main">
      <div class="hsec-h"><span>Discography</span></div>
      ${albums.length ? `<div class="alb-grid">${grid}</div>` : '<div class="hint-line">No albums yet.</div>'}
    </section>
    <aside class="home-side">
      <div class="hsec-h"><span>Recent</span></div>
      <div class="rec">${recent.length ? recent.map(row).join('') : '<div class="hint-line">Nothing here yet.</div>'}</div>
    </aside>
  </div>`;
}

/* logo text stretches from the menu icon edge to the file-count edge */
const BRAND_MAX = 14; /* largest logo font size in px */
function fitBrand() {
  const t = $('.brand-t'), nav = $('#nav');
  if (!t || !nav) return; /* the logo is an icon only now */
  const b = nav.querySelector('button');
  const cs = b ? getComputedStyle(b) : null;
  const target = (nav.clientWidth - (cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 24)) * 0.8; /* a bit narrower than the menu */
  if (target <= 0) return;
  t.style.fontSize = '20px';
  const w = t.getBoundingClientRect().width;
  if (w > 0) t.style.fontSize = Math.min(BRAND_MAX, (20 * target) / w).toFixed(2) + 'px';
}
window.addEventListener('resize', fitBrand);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBrand);

/* Recent: rows of equal height, as many as fit exactly into the height of the three album rows */
const REC_ROW = 68; /* same row pitch as the Discography list: 64px row + 4px gap */
const REC_GAP = 4;
function fitRecent() {
  const rec = $('.rec'), g = $('.alb-grid'), home = $('.home'), list = $('#list');
  /* Home is exactly as tall as the list: the albums and Recent end level with the buttons at the bottom of the menu */
  if (home && list) {
    if (list.clientWidth - 20 >= 760 && list.clientHeight > 0) { home.style.boxSizing = 'border-box'; home.style.height = list.clientHeight + 'px'; home.style.minHeight = '0'; }
    else { home.style.height = ''; home.style.minHeight = ''; }
  }
  if (!rec || !g) return;
  if (!g.offsetHeight) return;
  const h = Math.floor(g.getBoundingClientRect().bottom - rec.getBoundingClientRect().top); /* Recent ends exactly where the albums end */
  if (h < REC_ROW) return;
  rec.style.height = h + 'px';
  const rows = [...rec.children];
  const n = Math.max(1, Math.floor((h + REC_GAP) / REC_ROW));
  /* the gap stays 4px; the rows grow a little (64px and up) so the last one ends exactly at the bottom */
  const rh = rows.length >= n ? (h - (n - 1) * REC_GAP) / n : REC_ROW - REC_GAP;
  rows.forEach((r, i) => { r.style.display = i < n ? '' : 'none'; r.style.flex = 'none'; r.style.height = rh + 'px'; });
}
if (window.ResizeObserver) new ResizeObserver(() => fitRecent()).observe($('#list'));

function renderList() {
  const el = $('#list');
  const st = el.scrollTop;
  if (!S.vault) { el._home = null; el.innerHTML = welcomeHtml(); $('#count').textContent = ''; return; }
  const totalFiles = S.items.filter(visibleItem).length;
  const searching = !!S.query.trim();
  el.classList.toggle('is-home', S.section === 'home' && !searching);
  if (S.section === 'home' && !searching) {
    $('#count').textContent = '';
    const hh = homeHtml();
    if (el._home === hh && el.querySelector(':scope > .home')) { refreshRowStates(); markSelectedRow(); return; } /* nothing changed: no redraw, no flicker */
    el._home = hh;
    el.innerHTML = hh;
    fitRecent();
    el.scrollTop = st;
    refreshRowStates();
    markSelectedRow();
    return;
  }
  el._home = null;
  const L = layout();
  const flat = visible();
  $('#count').textContent = flat.length + '/' + totalFiles;
  if (!flat.length) {
    el.innerHTML = `<div class="empty-list">${searching ? 'Nothing found.' : 'Nothing in this section yet.'}</div>`;
    return;
  }
  if (L.cols) {
    const col = (c, empty) => `<div class="col"><div class="col-h"><span>${c.title}</span><span>${c.groups.reduce((n, g) => n + g.items.length, 0)}</span></div>${c.groups.length ? groupsHtml(c.groups) : `<div class="empty-list sm">${empty}</div>`}</div>`;
    el.innerHTML = `<div class="split">${col(L.cols[0], 'No videos here yet.')}${col(L.cols[1], 'No lyric videos here yet.')}</div>`;
  } else el.innerHTML = groupsHtml(L.groups);
  el.scrollTop = st;
  refreshRowStates();
  markSelectedRow();
}

/* a click on empty space (not on an item, not in the details panel) empties the details panel and clears the active row */
document.addEventListener('click', (e) => {
  if (!S.selected || window.matchMedia('(max-width:1000px)').matches) return;
  const t = e.target;
  if (!t.closest || !t.closest('.main,.side')) return;
  if (t.closest('.player,.top,button,a,input,textarea,label,.row,.alb,.rrow,.mini,[data-pick],[data-open],[data-go],[data-act],.seg,.sortbar,#ctx')) return;
  S.selected = null;
  markSelectedRow();
  renderDetail();
});

function markSelectedRow() {
  $$('#list .row').forEach((r) => r.classList.toggle('sel', !!S.selected && +r.dataset.uid === S.selected.uid));
}

function isPlaying(it) {
  if (it.kind === 'video') return !!(videoEl && S.videoItem === it && !videoEl.paused);
  return !audio.paused;
}
function isNow(it) {
  if (it.kind === 'album') return !!(S.now && S.now.album === it);
  if (it.kind === 'video') return isPlaying(it);
  return S.now === it;
}
function refreshRowStates() {
  $$('#list .row').forEach((r) => {
    const it = S.byUid.get(+r.dataset.uid);
    if (!it) return;
    const now = isNow(it);
    const playing = now && isPlaying(it);
    r.classList.toggle('now', now);
    r.classList.toggle('playing', playing);
    const ic = r.querySelector('.rowplay i');
    if (ic) ic.className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play');
  });
}

function renderAll() {
  renderNav();
  renderHead();
  renderList();
  renderDetail();
  renderPlayer();
}

function go(sec, keepQuery) {
  S.section = sec;
  setMenuOpen(false);
  if (S.selected) { S.selected = null; renderDetail(); }
  if (!keepQuery) { S.query = ''; $('#search').value = ''; }
  renderNav(); renderHead(); renderList();
  $('#list').scrollTop = 0;
  runSwap();
}

/* ================= selection ================= */
function addHistory(it) {
  if (!it) return;
  const h = S.meta.history.filter((p) => p !== it.path);
  h.unshift(it.path);
  S.meta.history = h.slice(0, 20);
  saveMeta();
}
function selectItem(it, opts) {
  S.selected = it;
  addHistory(it);
  markSelectedRow();
  renderDetail(opts || {});
  if (window.matchMedia('(max-width:1000px)').matches) setDetailOpen(true);
}

function rowPlay(it) {
  if (it.kind === 'video') {
    if (S.selected === it && videoEl) toggleVideo();
    else selectItem(it, { autoplay: true });
    return;
  }
  if (it.kind === 'album') {
    if (!it.tracks.length) return;
    if (isNow(it)) toggleAudio();
    else playAudioItem(it.tracks[0], it.tracks);
    return;
  }
  if (S.now === it) toggleAudio();
  else playAudioItem(it, queueFor(it));
}
function queueFor(it) {
  if (it.album) return it.album.tracks;
  const q = visible().filter((x) => x.kind === 'audio');
  return q.includes(it) ? q : [it];
}

/* ================= audio engine ================= */
const audio = new Audio();
audio.preload = 'auto';
let audioUrl = null;
let pendingSeek = null;
let seeking = false;

function applyVolume() {
  audio.volume = S.muted ? 0 : S.vol / 100;
  if (videoEl) videoEl.volume = audio.volume;
}

function playAudioItem(it, queue, startAt) {
  addHistory(it);
  if (videoEl && !videoEl.paused) videoEl.pause();
  S.now = it;
  S.queue = queue && queue.includes(it) ? queue : [it];
  freeUrl(audioUrl);
  audioUrl = fileUrl(it.file);
  pendingSeek = startAt || null;
  audio.src = audioUrl;
  applyVolume();
  audio.play().catch((err) => { if (err && err.name !== 'AbortError') warn('Could not play: ' + it.name); });
  renderPlayer();
  onPlayState();
}
function toggleAudio() {
  if (!S.now) return;
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}
function step(dir, auto) {
  if (!S.now) return;
  if (dir < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
  const i = S.queue.indexOf(S.now);
  const next = S.queue[i + dir];
  if (next) playAudioItem(next, S.queue);
  else if (auto) { audio.pause(); audio.currentTime = 0; updateTimeUI(); }
  else if (dir < 0) audio.currentTime = 0;
}
function onPlayState() {
  const playing = !audio.paused;
  const btn = $('#pplay');
  btn.classList.toggle('playing', playing);
  btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('i', btn).className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play');
  refreshRowStates();
  updateDetailPlayState();
}
audio.addEventListener('play', onPlayState);
audio.addEventListener('pause', onPlayState);
audio.addEventListener('ended', () => step(1, true));
audio.addEventListener('timeupdate', updateTimeUI);
audio.addEventListener('loadedmetadata', () => {
  if (S.now && (!S.now.dur || !isFinite(S.now.dur))) { S.now.dur = audio.duration; S.now.metaState = 2; updateDurUI(S.now); updateBinds(); }
  if (pendingSeek !== null) { audio.currentTime = pendingSeek; pendingSeek = null; }
  updateTimeUI();
});
audio.addEventListener('error', () => { if (S.now && audio.src) warn('Could not play: ' + S.now.name); });

function setFill(r) {
  const max = Number(r.max) || 0;
  r.style.setProperty('--p', (max > 0 ? (Number(r.value) / max) * 100 : 0) + '%');
}

function renderPlayer() {
  const p = $('#player');
  const it = S.now;
  if (!it) { p.hidden = true; return; }
  p.hidden = false;
  $('#ptitle').textContent = it.title;
  $('#psub').textContent = it.album ? it.album.title : kindLabel(it);
  const cov = $('#pcover');
  const cover = it.album && it.album.cover;
  if (cover) cov.innerHTML = `<img alt="" decoding="sync" src="${coverUrl(cover)}">`;
  else cov.innerHTML = `<i class="fa-solid ${it.album ? 'fa-compact-disc' : iconOf(it)}"></i>`;
  updateTimeUI();
  const vol = $('#pvol'); vol.value = S.vol; setFill(vol);
}

function updateTimeUI() {
  const it = S.now;
  if (it) {
    const d = isFinite(audio.duration) && audio.duration ? audio.duration : (it.dur || 0);
    const c = audio.currentTime || 0;
    $('#pcur').textContent = fmt(c);
    $('#ptotal').textContent = fmt(d);
    const seek = $('#pseek');
    seek.max = d || 0;
    if (!seeking) { seek.value = c; }
    setFill(seek);
  }
  updateDetailTime();
  drawWave();
}

/* ================= waveform ================= */
let ac = null;
let peakChain = Promise.resolve();
function fakePeaks(it) {
  let h = 0;
  for (const c of it.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const out = [];
  let env = 0.5;
  for (let i = 0; i < 160; i++) {
    env += (r() - 0.5) * 0.25;
    env = Math.min(0.95, Math.max(0.25, env));
    out.push(Math.min(1, env * (0.6 + r() * 0.5)));
  }
  return out;
}
function ensurePeaks(it) {
  if (it.peaks) return Promise.resolve();
  peakChain = peakChain.then(async () => {
    if (it.peaks) return;
    if (it.size > 70e6) { it.peaks = fakePeaks(it); return; }
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ac.decodeAudioData(await it.file.arrayBuffer());
      const ch = buf.getChannelData(0);
      const N = 200;
      const stepSz = Math.max(1, Math.floor(ch.length / N));
      const pk = [];
      let mx = 0;
      for (let i = 0; i < N; i++) {
        let m = 0;
        const s = i * stepSz;
        const inc = Math.max(1, Math.ceil(stepSz / 256));
        for (let j = s; j < s + stepSz && j < ch.length; j += inc) { const a = Math.abs(ch[j]); if (a > m) m = a; }
        pk.push(m); if (m > mx) mx = m;
      }
      it.peaks = mx > 0 ? pk.map((v) => Math.max(0.04, v / mx)) : fakePeaks(it);
      if (!it.dur) { it.dur = buf.duration; it.metaState = 2; updateDurUI(it); updateBinds(); }
    } catch (e) { it.peaks = fakePeaks(it); }
  }).then(() => { if (S.selected === it) drawWave(); });
  return peakChain;
}
function drawWave() {
  const c = $('#wave');
  const it = S.selected;
  if (!c || !it || it.kind !== 'audio') return;
  const peaks = it.peaks || (it._fake = it._fake || fakePeaks(it));
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (!w) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const bw = 3, gap = 2;
  const n = Math.floor((w + gap) / (bw + gap));
  const dur = isFinite(audio.duration) ? audio.duration : 0;
  const ratio = S.now === it && dur ? audio.currentTime / dur : 0;
  const cs = getComputedStyle(document.documentElement);
  const on = cs.getPropertyValue('--text').trim(), off = cs.getPropertyValue('--baroff').trim();
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
    let m = 0;
    for (let j = a; j < b; j++) m = Math.max(m, peaks[j]);
    const bh = Math.max(3, m * h * 0.92);
    g.fillStyle = i / n < ratio ? on : off;
    const x = i * (bw + gap), y = (h - bh) / 2;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, bw, bh, 1.5); else g.rect(x, y, bw, bh);
    g.fill();
  }
}
function seekWave(e) {
  const c = e.target;
  const it = S.selected;
  const r = c.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  if (S.now === it && isFinite(audio.duration) && audio.duration) { audio.currentTime = ratio * audio.duration; updateTimeUI(); }
  else playAudioItem(it, queueFor(it), it.dur ? ratio * it.dur : null);
}

/* ================= video ================= */
let videoEl = null, videoUrl = null, pdfUrl = null;
function toggleVideo() {
  if (!videoEl) return;
  if (videoEl.paused) videoEl.play().catch(() => {}); else videoEl.pause();
}
function updateVideoState() {
  const box = $('#vbox');
  if (!box || !videoEl) return;
  const playing = !videoEl.paused;
  box.classList.toggle('playing', playing);
  $('.vplay i', box).className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play');
  refreshRowStates();
}
function setupVideo(it, autoplay) {
  videoEl = $('#vid');
  if (!videoEl) return;
  videoUrl = fileUrl(it.file);
  videoEl.src = videoUrl;
  S.videoItem = it;
  applyVolume();
  const seek = $('#vseek');
  const box = $('#vbox');
  const applyAspect = () => {
    if (videoEl.videoWidth) {
      it.vw = videoEl.videoWidth; it.vh = videoEl.videoHeight;
      box.style.aspectRatio = it.vw + ' / ' + it.vh;
      box.classList.toggle('tall', it.vh > it.vw);
    }
    if (isFinite(videoEl.duration) && videoEl.duration) { it.dur = videoEl.duration; it.metaState = 2; updateDurUI(it); }
    updateBinds();
  };
  videoEl.addEventListener('loadedmetadata', applyAspect);
  videoEl.addEventListener('play', () => { if (!audio.paused) audio.pause(); updateVideoState(); });
  videoEl.addEventListener('pause', updateVideoState);
  videoEl.addEventListener('ended', updateVideoState);
  videoEl.addEventListener('timeupdate', () => {
    const d = videoEl.duration || 0;
    if (!seek.dataset.drag) { seek.value = d ? (videoEl.currentTime / d) * 1000 : 0; setFill(seek); }
    $('#vtime').textContent = fmt(videoEl.currentTime) + ' / ' + fmt(d);
  });
  videoEl.addEventListener('error', () => warn('Could not play the video. The browser may not support this format.'));
  videoEl.addEventListener('click', toggleVideo);
  seek.addEventListener('pointerdown', () => { seek.dataset.drag = '1'; });
  seek.addEventListener('pointerup', () => { delete seek.dataset.drag; });
  if (autoplay) { if (!audio.paused) audio.pause(); videoEl.play().catch(() => {}); }
}
function cleanupDetail() {
  if (videoEl) {
    try { videoEl.pause(); } catch (e) { /* ignore */ }
    videoEl.removeAttribute('src');
    try { videoEl.load(); } catch (e) { /* ignore */ }
    videoEl = null;
  }
  if (videoUrl) { freeUrl(videoUrl); videoUrl = null; }
  if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; }
  S.videoItem = null;
}

/* ================= text rendering ================= */
function inlineMd(t) {
  return t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function mdHtml(src) {
  const lines = esc(src).split(/\r?\n/);
  const out = [];
  let list = false, para = [];
  const flushP = () => { if (para.length) { out.push('<p>' + inlineMd(para.join('<br>')) + '</p>'); para = []; } };
  const closeL = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const ln of lines) {
    let m;
    if (/^\s*$/.test(ln)) { flushP(); closeL(); }
    else if ((m = ln.match(/^(#{1,3})\s+(.*)$/))) { flushP(); closeL(); out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`); }
    else if (/^-{3,}\s*$/.test(ln)) { flushP(); closeL(); out.push('<hr>'); }
    else if ((m = ln.match(/^\s*[-*]\s+(.*)$/))) { flushP(); if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inlineMd(m[1]) + '</li>'); }
    else if ((m = ln.match(/^&gt;\s?(.*)$/))) { flushP(); closeL(); out.push('<blockquote>' + inlineMd(m[1]) + '</blockquote>'); }
    else { closeL(); para.push(ln); }
  }
  flushP(); closeL();
  return out.join('');
}
function lyricsHtml(src) {
  const blocks = src.replace(/\r/g, '').split(/\n\s*\n/).filter((b) => b.trim());
  return blocks.map((b) => {
    const lines = b.split('\n');
    let label = '';
    const m = lines[0].match(/^\s*\[(.+?)\]\s*$/);
    if (m) { label = `<span class="lbl">${esc(m[1])}</span>`; lines.shift(); }
    const body = lines.map((l) => esc(l)).join('<br>');
    return `<div class="stanza">${label}${body}</div>`;
  }).join('');
}
async function fillReader(it) {
  const r = $('#reader');
  if (!r) return;
  const t = await ensureText(it);
  const r2 = $('#reader');
  if (S.selected !== it || !r2) return;
  if (it.big) { r2.innerHTML = '<p class="muted">This file is too large to preview. Use the button below to open it.</p>'; return; }
  if (!t.trim()) { r2.innerHTML = '<p class="muted">The file is empty.</p>'; return; }
  r2.setAttribute('lang', /[Ѐ-ӿ]/.test(t) ? 'ru' : 'en'); /* lets the browser hyphenate justified text */
  if (it.section === 'lyrics') r2.innerHTML = lyricsHtml(t);
  else if (it.ext === 'md' || it.ext === 'markdown') r2.innerHTML = mdHtml(t);
  else r2.innerHTML = '<div class="plain">' + esc(t) + '</div>';
  updateBinds();
}

/* ================= detail panel ================= */
/* one picture address per cover, kept for the whole session: a re-read of the folder or a refreshed Drive listing
   makes new file objects, but the cover keeps its address, so the browser never has to load it again */
const COVER_URLS = new Map();
const coverKey = (img) => (S.metaKey || S.name) + '|' + (img.file && img.file.id !== undefined ? img.file.id : img.path) + '|' + ((img.file && img.file.lastModified) || img.modified || 0);
const coverUrl = (img) => {
  const u = COVER_URLS.get(coverKey(img));
  if (u) return (img.url = u);
  img.url = img.url || fileUrl(img.file);
  if (String(img.url).startsWith('blob:') && !(img.file && img.file.remote)) COVER_URLS.set(coverKey(img), img.url);
  return img.url;
};
/* Drive covers are downloaded once and kept as blobs, so they never reload when you switch pages */
async function preloadCovers() {
  const covers = new Set();
  S.albums.forEach((i) => { if (i.cover) covers.add(i.cover); });
  covers.forEach((c) => { const u = COVER_URLS.get(coverKey(c)); if (u) c.url = u; });
  const list = [...covers].filter((c) => c.file && (c.file.remote || c.file.rel !== undefined) && !COVER_URLS.has(coverKey(c)));
  let idx = 0;
  const worker = async () => {
    while (idx < list.length) {
      const c = list[idx++];
      const k = 'dcov:' + S.metaKey + ':' + c.file.id;
      try {
        if (!c.file.remote) { /* desktop folder: read once, then every redraw uses the same in-memory picture */
          c.url = URL.createObjectURL(new Blob([await c.file.arrayBuffer()], { type: c.file.type || 'image/jpeg' }));
          COVER_URLS.set(coverKey(c), c.url);
          continue;
        }
        const rec = await idb.get(k);
        if (rec && rec.blob && rec.mod === c.file.lastModified) { c.url = URL.createObjectURL(rec.blob); COVER_URLS.set(coverKey(c), c.url); continue; }
        const blob = new Blob([await c.file.arrayBuffer()], { type: c.file.type || 'image/jpeg' });
        c.url = URL.createObjectURL(blob);
        COVER_URLS.set(coverKey(c), c.url);
        idb.set(k, { mod: c.file.lastModified, blob });
      } catch (e) { /* falls back to the streamed link */ }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

function factsFor(it) {
  const f = [];
  const F = (k, v, bind, edit) => f.push({ k, v, bind, edit });
  const dateFact = () => (isDateEditable(it) ? F('Date', dateLabel(getDate(it)), null, true) : F('Modified', dateLabel(isoDay(it.modified))));
  if (it.kind === 'album') {
    F('Tracks', String(it.tracks.length));
    F('Duration', '', 'dur');
    F('Format', [...new Set(it.tracks.map((t) => t.ext.toUpperCase()))].join(', '));
    dateFact();
  } else if (it.kind === 'audio') {
    F('Format', it.ext.toUpperCase());
    F('Duration', '', 'dur');
    const bpm = bpmOf(it);
    if (bpm) F('Tempo', bpm + ' BPM');
    F('Size', fmtSize(it.size));
    dateFact();
  } else if (it.kind === 'video') {
    F('Format', it.ext.toUpperCase());
    F('Resolution', '', 'res');
    F('Duration', '', 'dur');
    dateFact();
  } else if (it.kind === 'text') {
    F('Format', it.ext.toUpperCase());
    F('Words', '', 'words');
    F('Size', fmtSize(it.size));
    dateFact();
  } else {
    F('Format', (it.ext || '—').toUpperCase());
    F('Size', fmtSize(it.size));
    dateFact();
  }
  let html = f.map((x) => `<div class="fact"><span>${x.k}</span><b ${x.bind ? `data-bind="${x.bind}"` : ''} ${x.edit ? 'data-edit="date"' : ''}>${esc(x.v)}</b></div>`).join('');
  return html;
}
function refreshFacts() {
  const it = S.selected;
  const el = $('#detail .facts');
  if (it && el) { el.innerHTML = factsFor(it); updateBinds(); }
}

function bindValue(it, k) {
  if (k === 'dur') return durText(it);
  if (k === 'res') return it.vw ? it.vw + '×' + it.vh : '…';
  if (k === 'words') {
    if (it.big) return '—';
    return it.text === null ? '…' : String((it.text.trim().match(/\S+/g) || []).length);
  }
  return '';
}
function updateBinds() {
  const it = S.selected;
  if (!it) return;
  $$('#detail [data-bind]').forEach((el) => { el.textContent = bindValue(it, el.dataset.bind); });
  updateDetailTime();
}

function mediaHtml(it) {
  if (it.kind === 'audio') {
    return `<div class="card wave-card">
      <canvas class="wave" id="wave" aria-label="Waveform. Click to seek"></canvas>
      <div class="wave-row">
        <button class="playbtn" data-act="play-sel" aria-label="Play"><i data-playicon class="fa-solid fa-play"></i></button>
        <span class="time" id="dtime"></span>
      </div>
    </div>`;
  }
  if (it.kind === 'album') {
    const cover = it.cover
      ? `<img alt="" decoding="sync" src="${coverUrl(it.cover)}">`
      : '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="0.8" aria-hidden="true" style="color:var(--muted)"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="76"/><circle cx="100" cy="100" r="60"/><circle cx="100" cy="100" r="44"/><circle cx="100" cy="100" r="12"/></svg>';
    const tracks = it.tracks.map((t, i) => `<button class="track" data-act="play-track" data-uid="${t.uid}" aria-label="Play ${esc(t.title)}"><span class="n"><span class="num">${String(i + 1).padStart(2, '0')}</span><i class="fa-solid fa-play tp"></i></span><span class="tn">${esc(t.title)}</span><span class="td" data-tdur="${t.uid}">${esc(durText(t))}</span></button>`).join('');
    return `<div class="cover">${cover}</div>
      <div class="tracks">${tracks}</div>`;
  }
  if (it.kind === 'video') {
    const tall = it.vw ? it.vh > it.vw : it.section === 'lyricvideo';
    const ar = it.vw ? `${it.vw} / ${it.vh}` : (tall ? '9 / 16' : '16 / 9');
    return `<div class="video ${tall ? 'tall' : ''}" id="vbox" style="aspect-ratio:${ar}">
      <video id="vid" playsinline preload="metadata"></video>
      <button class="vplay" data-act="vplay" aria-label="Play"><i class="fa-solid fa-play"></i></button>
      <div class="vbar">
        <input type="range" id="vseek" min="0" max="1000" step="1" value="0" aria-label="Seek video">
        <span id="vtime">0:00</span>
        <button data-act="vfs" aria-label="Fullscreen"><i class="fa-solid fa-expand"></i></button>
      </div>
    </div>`;
  }
  if (it.kind === 'text') return `<div class="card reader ${it.section === 'lyrics' ? 'lyr' : 'just'}" id="reader"><p class="muted">Loading…</p></div>`;
  if (it.kind === 'pdf') return '<iframe class="pdf" id="pdf" title="PDF"></iframe>';
  return `<div class="card nopreview"><i class="fa-regular fa-file"></i><div>This file type can't be previewed in the browser.</div></div>`;
}

function renderDetail(opts) {
  opts = opts || {};
  cleanupDetail();
  if (S.selected && S.selected.kind === 'album') {
    /* load this album's durations first */
    S.selected.tracks.slice().reverse().forEach((t) => {
      if (t.metaState === 0) queueMeta(t);
      const i = loadQ.indexOf(t);
      if (i > 0) { loadQ.splice(i, 1); loadQ.unshift(t); }
    });
    pumpMeta();
  }
  const el = $('#detail');
  const it = S.selected;
  el.scrollTop = 0;
  if (!it) setDetailOpen(false);
  applyDetailWidth();
  if (!S.vault) { el.innerHTML = '<div class="d-empty"><i class="fa-solid fa-circle-info"></i><div>Select an Item to View Details</div></div>'; return; }
  if (!it) { el.innerHTML = '<div class="d-empty"><i class="fa-regular fa-hand-pointer"></i><div>Select an Item to View Details</div></div>'; return; }
  const fav = !!S.meta.favs[it.path];
  const hasNotes = it.kind === 'audio' || it.kind === 'album' || it.kind === 'video';
  const canOpen = it.kind !== 'album';
  const viewable = ['audio', 'video', 'text', 'pdf'].includes(it.kind);
  const openIcon = viewable ? 'fa-arrow-up-right-from-square' : 'fa-download';
  const openTitle = viewable ? 'Open file' : 'Download copy';
  const fullPath = esc(S.name + '/' + it.path);
  el.innerHTML = `
    <div class="d-head">
      <div class="chip"><i class="fa-solid ${it.kind === 'album' ? 'fa-compact-disc' : iconOf(it)}"></i></div>
      <div class="d-title"><div class="eyebrow">${esc(kindLabel(it))}</div><h2>${esc(it.title)}</h2></div>
      <button class="iconbtn ${fav ? 'on' : ''}" data-act="fav-sel" aria-label="Favorite"><i class="${fav ? 'fa-solid' : 'fa-regular'} fa-star"></i></button>
      <button class="iconbtn drawer-close" data-act="close-detail" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    ${mediaHtml(it)}
    <div class="facts">${factsFor(it)}</div>
    ${hasNotes ? `<div class="notes">
      <div class="notes-h"><div class="eyebrow-s">Notes</div><button class="stamp" data-act="stamp"><i class="fa-regular fa-clock"></i>Timestamp</button></div>
      <textarea id="notes" placeholder="What works, what doesn't, what to redo…">${esc(S.meta.notes[it.path] || '')}</textarea>
    </div>` : ''}
    <div class="path" title="${fullPath}">
      <span>${fullPath}</span>
      ${canOpen ? `<button class="iconbtn sm" data-act="open-file" aria-label="${openTitle}" title="${openTitle}"><i class="fa-solid ${openIcon}"></i></button>` : ''}
      <button class="iconbtn sm" data-act="copy-path" aria-label="Copy path" title="Copy path"><i class="fa-regular fa-copy"></i></button>
    </div>`;
  updateBinds();
  if (it.kind === 'audio') { ensurePeaks(it); requestAnimationFrame(drawWave); }
  if (it.kind === 'video') setupVideo(it, opts.autoplay);
  if (it.kind === 'text') fillReader(it);
  if (it.kind === 'pdf') {
    it.file.arrayBuffer().then((buf) => {
      if (S.selected !== it || !$('#pdf')) return;
      pdfUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
      $('#pdf').src = pdfUrl;
    }).catch(() => warn('Could not load the PDF'));
  }
  updateDetailPlayState();
}

function updateDetailTime() {
  const it = S.selected;
  if (!it) return;
  $$('#detail [data-tdur]').forEach((s) => { const t = S.byUid.get(+s.dataset.tdur) || S.base.find((x) => x.uid === +s.dataset.tdur); if (t) s.textContent = durText(t); });
  const el = $('#dtime');
  if (el && it.kind === 'audio') {
    const now = S.now === it;
    const d = now && isFinite(audio.duration) && audio.duration ? audio.duration : (it.dur || 0);
    el.textContent = (now ? fmt(audio.currentTime) : '0:00') + ' / ' + fmt(d);
  }
}
function updateDetailPlayState() {
  const it = S.selected;
  if (!it) return;
  const playing = it.kind === 'audio' && isNow(it) && !audio.paused;
  $$('#detail [data-playicon]').forEach((i) => { i.className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play'); });
  const pb = $('#detail .playbtn');
  if (pb) pb.classList.toggle('playing', playing);
  $$('#detail .track').forEach((b) => {
    const cur = !!S.now && S.now.uid === +b.dataset.uid;
    b.classList.toggle('on', cur);
    $('.tp', b).className = 'fa-solid tp ' + (cur && !audio.paused ? 'fa-pause' : 'fa-play');
  });
}

/* ---- layout: no details panel on Home; fixed 914px panel for Docs, Notes and Bibliography ---- */
function setDetailOpen(on) { $('#detail').classList.toggle('open', on); $('#app').classList.toggle('detail-open', on); }
function setMenuOpen(on) { $('.side').classList.toggle('open', on); $('#app').classList.toggle('menu-open', on); fitBrand(); }
function applyDetailWidth() {
  const app = $('#app');
  const it = S.selected;
  const home = S.section === 'home' && !S.query.trim();
  const wide = !home && !!it && it.kind === 'text' && WIDE_SECS.has(it.section) && window.innerWidth > 1000;
  if (wide) app.style.setProperty('--detail-w', 'min(' + (DETAIL_W[it.section] || 914) + 'px, calc(100vw - 600px))');
  else if (S.section === 'lyrics' && window.innerWidth > 1000) app.style.setProperty('--detail-w', DETAIL_W.lyrics + 'px');
  else app.style.removeProperty('--detail-w');
  const hide = home && window.innerWidth > 1000 && window.innerWidth < HOME_DETAIL_MIN;
  if (hide) app.style.setProperty('--detail-w', '0px');
  document.body.classList.toggle('no-detail', hide);
}

/* ---- the date is plain text; a click turns it into an input (no visible button) ---- */
function editDate(el) {
  const it = S.selected;
  if (!it || !isDateEditable(it)) return;
  const cur = dateInput(getDate(it));
  const inp = document.createElement('input');
  inp.type = 'date'; inp.className = 'date-edit'; inp.value = cur;
  inp.setAttribute('aria-label', 'Date');
  el.replaceWith(inp);
  let timer, done = false;
  const finish = (save) => {
    if (done) return;
    done = true; clearTimeout(timer);
    if (save) {
      if (!inp.value) delete S.meta.dates[it.path];
      else if (inp.value !== cur) S.meta.dates[it.path] = inp.value;
      saveMeta();
    }
    refreshFacts();
    renderList();
    markSelectedRow();
  };
  inp.addEventListener('change', () => { clearTimeout(timer); timer = setTimeout(() => finish(true), 700); });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
  });
  inp.focus();
  try { if (inp.showPicker) inp.showPicker(); } catch (err) { /* typing still works */ }
}

/* ================= actions ================= */
function toggleFav(it) {
  if (!it) return;
  if (S.meta.favs[it.path]) delete S.meta.favs[it.path]; else S.meta.favs[it.path] = true;
  saveMeta();
  const fav = !!S.meta.favs[it.path];
  $$(`.row[data-uid="${it.uid}"] .star`).forEach((row) => { row.classList.toggle('on', fav); $('i', row).className = (fav ? 'fa-solid' : 'fa-regular') + ' fa-star'; });
  if (S.selected === it) {
    const b = $('#detail [data-act="fav-sel"]');
    if (b) { b.classList.toggle('on', fav); $('i', b).className = (fav ? 'fa-solid' : 'fa-regular') + ' fa-star'; }
  }
  scheduleHome();
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { /* ignore */ }
    ta.remove();
    return ok;
  }
}

function openFile(it) {
  const viewable = ['audio', 'video', 'text', 'pdf'].includes(it.kind);
  if (it.file.isDoc) {
    it.file.text().then((t) => { const u = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); }).catch(() => toast('Could not open the document'));
    return;
  }
  if (it.file.url) {
    const u = it.file.url();
    if (viewable) window.open(u, '_blank', 'noopener');
    else { const a = document.createElement('a'); a.href = u; a.download = it.name; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); }
    return;
  }
  const type = it.kind === 'pdf' ? 'application/pdf' : it.file.type;
  const url = URL.createObjectURL(type ? new Blob([it.file], { type }) : it.file);
  if (viewable) window.open(url, '_blank', 'noopener');
  else { const a = document.createElement('a'); a.href = url; a.download = it.name; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function insertStamp() {
  const it = S.selected;
  const ta = $('#notes');
  if (!it || !ta) return;
  let stamp = '0:00';
  if (it.kind === 'video' && videoEl) stamp = fmt(videoEl.currentTime);
  else if (it.kind === 'audio' && S.now === it) stamp = fmt(audio.currentTime);
  else if (it.kind === 'album' && S.now && S.now.album === it) stamp = S.now.title + ' · ' + fmt(audio.currentTime);
  const text = '[' + stamp + '] ';
  const v = ta.value;
  const pos = ta.selectionStart != null && document.activeElement === ta ? ta.selectionStart : v.length;
  const before = v.slice(0, pos), after = v.slice(pos);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  ta.value = before + lead + text + after;
  const np = (before + lead + text).length;
  ta.focus();
  ta.setSelectionRange(np, np);
  S.meta.notes[it.path] = ta.value;
  saveMeta();
}

/* ================= events ================= */
$('#homeBtn').addEventListener('click', () => go('home'));
/* five quick clicks on the logo open the engineering menu */
let logoTaps = [];
$('#homeBtn').addEventListener('click', () => {
  const t = Date.now();
  logoTaps = logoTaps.filter((x) => t - x < 2200);
  logoTaps.push(t);
  if (logoTaps.length >= 5) { logoTaps = []; openEngDialog(); }
});
/* ================= context menu (follows the theme) ================= */
function closeCtx() { const c = $('#ctx'); if (c) c.remove(); }
function openCtx(x, y, rows) {
  closeCtx();
  const m = document.createElement('div');
  m.id = 'ctx'; m.className = 'ctx'; m.setAttribute('role', 'menu');
  m.innerHTML = rows.map((r, i) => `<button type="button" role="menuitem" data-i="${i}"><i class="fa-solid ${r.icon}"></i><span>${esc(r.label)}</span></button>`).join('');
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  m.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; closeCtx(); rows[+b.dataset.i].run(); });
  m.addEventListener('contextmenu', (e) => e.preventDefault());
}
['mousedown', 'wheel'].forEach((ev) => window.addEventListener(ev, (e) => { if (e.target.closest && e.target.closest('#ctx')) return; closeCtx(); }, true));
['blur', 'resize'].forEach((ev) => window.addEventListener(ev, closeCtx));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });
function toggleSecret(sec) {
  S.secret[sec] = !S.secret[sec];
  lsSet('console-secret:' + (S.user ? S.user.id : ''), JSON.stringify(S.secret));
  if (S.selected) S.selected = null;
  renderDetail();
  if (S.section === sec) { renderNav(); renderHead(); renderList(); $('#list').scrollTop = 0; runSwap(); } else go(sec);
}
$('#nav').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('button[data-sec]');
  if (!b || !SECRET[b.dataset.sec] || !S.vault) return;
  e.preventDefault();
  const sec = b.dataset.sec, on = !!S.secret[sec];
  openCtx(e.clientX, e.clientY, [on
    ? { label: SEC[sec].label, icon: SEC[sec].icon, run: () => toggleSecret(sec) }
    : { label: SECRET[sec].label, icon: 'fa-lock-open', run: () => toggleSecret(sec) }]);
});

function openEngDialog() {
  closeDialog();
  const n = Object.keys((S.meta && S.meta.dates) || {}).length;
  const d = document.createElement('div');
  d.className = 'dlg'; d.id = 'dlg';
  d.innerHTML = `<div class="dlg-box" role="dialog" aria-label="Engineering">
    <div class="dlg-h"><div><h3>Engineering</h3><p class="dlg-sub">Test tools. Dates set by hand: ${n}</p></div><button class="iconbtn sm" data-e="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="eng-list">
      <button class="ghost" data-e="export"><i class="fa-solid fa-file-arrow-down"></i>Export Dates</button>
      <button class="ghost" data-e="import"><i class="fa-solid fa-file-arrow-up"></i>Import Dates</button>
    </div>
    <div class="eng-sec dlg-drive">
      <p class="eng-cap">Menu Sections</p>
      ${GROUPS.map((g) => `<label class="chk"><input type="checkbox" data-grp="${g.id}" ${S.hideGroups.includes(g.id) ? '' : 'checked'}><span>${esc(g.label)}</span></label>`).join('')}
    </div>
    <p class="eng-note">Export saves every date you changed. Import puts them back by file path, so it also works after a new build or on another device.</p>
    <input type="file" id="engFile" accept=".json,application/json" hidden>
  </div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => {
    if (e.target === d) { closeDialog(); return; }
    const b = e.target.closest('[data-e]');
    if (!b) return;
    const act = b.dataset.e;
    if (act === 'close') closeDialog();
    else if (act === 'import') $('#engFile').click();
    else if (act === 'export') {
      const dates = Object.assign({}, (S.meta && S.meta.dates) || {});
      const out = { app: 'dean-jane-console', kind: 'dates', version: 1, exported: new Date().toISOString(), source: S.name || '', count: Object.keys(dates).length, dates };
      const u = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = u; a.download = 'dean-jane-dates-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 30000);
      toast('Exported ' + out.count + ' dates');
    }
  });
  d.addEventListener('change', (e) => {
    const c = e.target.closest && e.target.closest('input[data-grp]');
    if (!c) return;
    const set = new Set(S.hideGroups);
    if (c.checked) set.delete(c.dataset.grp); else set.add(c.dataset.grp);
    S.hideGroups = [...set];
    lsSet('console-hide:' + (S.user ? S.user.id : ''), JSON.stringify(S.hideGroups));
    if (SEC[S.section] && SEC[S.section].group && S.hideGroups.includes(SEC[S.section].group)) go('home'); else { renderNav(); renderList(); }
  });
  $('#engFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.kind !== 'dates' || !data.dates || typeof data.dates !== 'object') throw new Error('bad');
      let n2 = 0, skipped = 0;
      for (const [k, v] of Object.entries(data.dates)) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { if (!S.meta.dates) S.meta.dates = {}; S.meta.dates[k] = v; n2++; } else skipped++;
      }
      saveMeta();
      closeDialog();
      renderAll();
      toast('Imported ' + n2 + ' dates' + (skipped ? ', skipped ' + skipped : ''));
    } catch (err) { warn('That is not a dates file'); }
  });
}

$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sec]');
  if (!b) return;
  go(b.dataset.sec, true);
});
$('#sort').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sort]');
  if (!b) return;
  S.sort = b.dataset.sort;
  renderHead(); renderList();
});
let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const v = e.target.value;
  searchTimer = setTimeout(() => { S.query = v; renderHead(); renderList(); }, 120);
});
$('#folderBtn').addEventListener('click', pickFolder);
$('#refreshBtn').addEventListener('click', refresh);
$('#themeBtn').addEventListener('click', () => {
  const next = S.theme === 'dark' ? 'light' : 'dark';
  const apply = () => { S.theme = next; applyTheme(); };
  if (!document.startViewTransition) { apply(); return; }
  const r = $('#themeBtn').getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(apply);
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
      { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
    );
  }).catch(() => {});
});

$('#list').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act && act.dataset.act === 'open') { pickFolder(); return; }
  if (act && act.dataset.act === 'continue') { continueSaved(); return; }
  const hp = e.target.closest('[data-hplay]');
  if (hp) { const al = S.byUid.get(+hp.dataset.hplay); if (al) rowPlay(al); return; }
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    let it = S.byUid.get(+pick.dataset.pick);
    if (it && it.album) it = it.album;
    if (it) { go(it.section === 'lyricvideo' ? 'video' : it.section); selectItem(it); }
    return;
  }
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) { go(goBtn.dataset.go); return; }
  const open = e.target.closest('[data-open]');
  if (open) {
    const it = S.byUid.get(+open.dataset.open);
    if (it) { go(it.section); selectItem(it); }
    return;
  }
  const row = e.target.closest('.row');
  if (!row) return;
  const it = S.byUid.get(+row.dataset.uid);
  if (!it) return;
  const a = act ? act.dataset.act : 'select';
  if (a === 'fav') toggleFav(it);
  else if (a === 'play') rowPlay(it);
  else selectItem(it);
});
$('#list').addEventListener('dblclick', (e) => {
  const row = e.target.closest('.row');
  if (!row || e.target.closest('[data-act="fav"],[data-act="play"]')) return;
  const it = S.byUid.get(+row.dataset.uid);
  if (it && isPlayable(it)) rowPlay(it);
});

const detailEl = $('#detail');
detailEl.addEventListener('click', (e) => {
  const it = S.selected;
  if (!it) return;
  if (e.target.id === 'wave') { seekWave(e); return; }
  const ed = e.target.closest('[data-edit="date"]');
  if (ed) { editDate(ed); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  switch (b.dataset.act) {
    case 'fav-sel': toggleFav(it); break;
    case 'play-sel': rowPlay(it); break;
    case 'play-track': {
      const t = it.tracks && it.tracks.find((x) => x.uid === +b.dataset.uid);
      if (!t) break;
      if (S.now === t) toggleAudio(); else playAudioItem(t, it.tracks);
      break;
    }
    case 'vplay': toggleVideo(); break;
    case 'vfs': { const box = $('#vbox'); if (box && box.requestFullscreen) box.requestFullscreen().catch(() => {}); break; }
    case 'stamp': insertStamp(); break;
    case 'open-file': openFile(it); break;
    case 'copy-path': copyText(S.name + '/' + it.path).then((ok) => (ok ? 0 : warn('Could not copy'))); break;
    case 'close-detail': setDetailOpen(false); break;
    default: break;
  }
});
detailEl.addEventListener('input', (e) => {
  const it = S.selected;
  if (!it) return;
  if (e.target.id === 'notes') {
    const v = e.target.value;
    if (v.trim()) S.meta.notes[it.path] = v; else delete S.meta.notes[it.path];
    saveMeta();
  } else if (e.target.id === 'vseek' && videoEl && videoEl.duration) {
    videoEl.currentTime = (e.target.value / 1000) * videoEl.duration;
    setFill(e.target);
  }
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 1000) setDetailOpen(false);
  if (window.innerWidth > 700) setMenuOpen(false);
  applyDetailWidth(); drawWave();
});
$('#menuBtn').addEventListener('click', () => setMenuOpen(!$('.side').classList.contains('open')));
$('#scrim').addEventListener('click', () => { setDetailOpen(false); setMenuOpen(false); });
/* scroll bars appear only while scrolling */
const scrollTimers = new WeakMap();
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  t.classList.add('scrolling');
  clearTimeout(scrollTimers.get(t));
  scrollTimers.set(t, setTimeout(() => t.classList.remove('scrolling'), 900));
}, true);


/* player controls */
$('#pplay').addEventListener('click', toggleAudio);
$('#pprev').addEventListener('click', () => step(-1, false));
$('#pnext').addEventListener('click', () => step(1, false));
$('#pclose').addEventListener('click', () => {
  audio.pause();
  S.now = null; S.queue = [];
  audio.removeAttribute('src');
  audio.load();
  renderPlayer(); refreshRowStates(); updateDetailPlayState(); updateDetailTime(); drawWave();
});
const pseek = $('#pseek');
pseek.addEventListener('pointerdown', () => { seeking = true; });
window.addEventListener('pointerup', () => { seeking = false; });
pseek.addEventListener('input', () => { audio.currentTime = Number(pseek.value); setFill(pseek); $('#pcur').textContent = fmt(pseek.value); });
const pvol = $('#pvol');
pvol.addEventListener('input', () => { S.vol = Number(pvol.value); S.muted = false; lsSet('vault-vol', String(S.vol)); applyVolume(); setFill(pvol); updateMuteIcon(); });
$('#pmute').addEventListener('click', () => { S.muted = !S.muted; applyVolume(); updateMuteIcon(); });
function updateMuteIcon() {
  const ic = $('#pmute i');
  ic.className = 'fa-solid ' + (S.muted || S.vol === 0 ? 'fa-volume-xmark' : S.vol < 40 ? 'fa-volume-low' : 'fa-volume-high');
}

/* keyboard */
document.addEventListener('keydown', (e) => {
  const tg = e.target;
  if (tg && tg.closest && tg.closest('input,textarea,select,[contenteditable]')) {
    if (e.key === 'Escape' && tg.blur) tg.blur();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'Escape') { setDetailOpen(false); setMenuOpen(false); const dd = $('#dlg'); if (dd && !dd.dataset.req) closeDialog(); }
  else if (k === ' ') {
    e.preventDefault();
    if (S.selected && S.selected.kind === 'video' && videoEl) toggleVideo(); else toggleAudio();
  } else if (k === 'ArrowRight' && S.now) { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); }
  else if (k === 'ArrowLeft' && S.now) { audio.currentTime = Math.max(0, audio.currentTime - 5); }
  else if (k === 'n' || k === 'т') step(1, false);
  else if (k === 'p' || k === 'з') step(-1, false);
  else if (k === 'm' || k === 'ь') { S.muted = !S.muted; applyVolume(); updateMuteIcon(); }
  else if (k === 'f' || k === 'а') { if (S.selected) toggleFav(S.selected); }
  else if (k === '/') { e.preventDefault(); $('#search').focus(); }
  else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'j' || k === 'k') {
    if (S.section === 'home' && !S.query.trim()) return;
    e.preventDefault();
    const list = visible();
    if (!list.length) return;
    const i = list.indexOf(S.selected);
    const dir = (k === 'ArrowDown' || k === 'j') ? 1 : -1;
    const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? (dir > 0 ? 0 : list.length - 1) : i + dir)))];
    selectItem(next);
    const row = $(`#list .row[data-uid="${next.uid}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
});

/* fallback folder input (Firefox / Safari) */
$('#fallback').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  S.handle = null; S.desk = null;
  S.source = 'local'; S.drive = null;
  lsSet(srcKey(), '{"type":"local"}');
  setScanning(true, 'Reading folder…');
  const root = files[0].webkitRelativePath.split('/')[0];
  const entries = [];
  files.forEach((f) => {
    const segs = f.webkitRelativePath.split('/').slice(1);
    if (!segs.length || segs.some((s) => s.startsWith('.') || SKIP_DIRS.has(s))) return;
    entries.push({ path: segs.join('/'), name: f.name, file: f });
  });
  await loadVault(entries, root);
});

/* drag & drop folder */
['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add('dragging'); }));
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  if (DESK) {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    const p = f ? DESK.pathOf(f) : '';
    if (!p) { warn('Drop a folder'); return; }
    openDesk(p).catch(() => {});
    return;
  }
  const item = e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items[0];
  if (!item || !item.getAsFileSystemHandle) { warn('Dropping a folder works in Chrome and Edge'); return; }
  try {
    const h = await item.getAsFileSystemHandle();
    if (h && h.kind === 'directory') { await idb.set('handle', h); S.saved = h; await openHandle(h); }
    else warn('Drop a folder, not a file');
  } catch (err) { console.error(err); }
});


/* ================= Google Drive ================= */
const GD_API = lsGet('console-gapi', 'https://www.googleapis.com');
const GD_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GD_FOLDER = 'application/vnd.google-apps.folder';
const GD_SHORT = 'application/vnd.google-apps.shortcut';
const GD_DOC = 'application/vnd.google-apps.document';
const GD = { token: null, exp: 0, pending: null, timer: null, dead: false };
try { const t = JSON.parse(sessionStorage.getItem('console-gtoken') || 'null'); if (t && t.exp > Date.now()) { GD.token = t.token; GD.exp = t.exp; } } catch (e) { /* no saved token */ }
const gdClientId = () => lsGet('console-gclient', '') || (S.deskG && S.deskG.clientId) || '';
const gdValid = () => !!GD.token && Date.now() < GD.exp;

/* ---- service worker that streams Drive files ---- */
function pushToken() {
  try {
    const c = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (c && GD.token) c.postMessage({ type: 'token', token: GD.token, exp: GD.exp, api: GD_API });
  } catch (e) { /* ignore */ }
}
async function onSwMsg(e) {
  const d = e.data || {};
  if (d.type !== 'need-token' || !e.ports[0]) return;
  try { if (!GD.dead && (d.force || !gdValid())) await gdToken(false); } catch (err) { showReconnect(); }
  e.ports[0].postMessage({ token: GD.token, exp: GD.exp, api: GD_API });
}
let swReady = null;
function ensureSW() {
  const okHost = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !okHost) return Promise.reject(new Error('Google Drive needs https or localhost (not a file:// page)'));
  if (swReady) return swReady;
  swReady = (async () => {
    navigator.serviceWorker.addEventListener('message', onSwMsg);
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      /* a hard reload (Ctrl+F5) leaves the page without a controller: ask the worker to take it over */
      try { const w = reg.active || (await navigator.serviceWorker.ready).active; if (w) w.postMessage({ type: 'claim' }); } catch (e) { /* ignore */ }
      await new Promise((res) => { navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 3000); });
    }
    if (!navigator.serviceWorker.controller) throw new Error('Reload the page once (press F5) and try again');
    pushToken();
  })();
  swReady.catch(() => { swReady = null; });
  return swReady;
}

let gisP = null;
function loadGIS() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (gisP) return gisP;
  gisP = new Promise((res, rej) => {
    const s = document.createElement('script');
    const to = setTimeout(() => { s.remove(); rej(new Error('Google sign-in did not load. Check your connection and try again')); }, 12000);
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => { clearTimeout(to); res(); };
    s.onerror = () => { clearTimeout(to); s.remove(); rej(new Error('Could not load Google sign-in. Check your connection or ad blocker')); };
    document.head.appendChild(s);
  });
  gisP.catch(() => { gisP = null; });
  return gisP;
}
function gdSchedule() {
  clearTimeout(GD.timer);
  GD.timer = setTimeout(() => { gdToken(false).catch(() => {}); }, Math.max(30000, GD.exp - Date.now() - 120000));
}
const GD_ERR = {
  popup_closed: 'The Google window was closed before signing in',
  popup_failed_to_open: 'The Google window was blocked. Allow pop-ups for this site and press Connect again',
  access_denied: 'Google access was denied. Add your account as a test user or publish the app',
  interaction_required: 'Google needs you to sign in again',
  immediate_failed: 'Google needs you to sign in again',
  invalid_client: 'Google rejected the Client ID. Check that it is copied exactly'
};
const gdMsg = (k, fallback) => GD_ERR[k] || fallback || 'Google sign-in failed';
function gdApply(token, expiresIn) {
  GD.token = token; GD.dead = false;
  GD.exp = Date.now() + Math.max(60, (expiresIn || 3600) - 90) * 1000;
  try { sessionStorage.setItem('console-gtoken', JSON.stringify({ token: GD.token, exp: GD.exp })); } catch (e) { /* ignore */ }
  pushToken();
  gdSchedule();
  hideReconnect();
}
/* desktop app: the long-lived sign-in is kept by the app itself, so renewing is silent and never expires on its own */
async function gdTokenDesk(interactive) {
  if (interactive && S.scanning) setStatus('Finish signing in in your browser. Press Esc to cancel', true);
  const limit = new Promise((res) => setTimeout(() => res({ ok: false, code: 'timeout', message: interactive ? 'Sign-in took too long. Try again' : 'Google sign-in needs a click' }), interactive ? 190000 : 25000));
  const r = await Promise.race([DESK.google.token(!!interactive, interactive === 'pick'), limit]);
  setStatus('', true);
  if (!r || !r.ok) throw Object.assign(new Error((r && r.message) || 'Google sign-in failed'), { quiet: !interactive || (r && r.code === 'needs_login'), code: r && r.code });
  gdApply(r.access_token, r.expires_in);
  setStatus('', true);
  return GD.token;
}
/* interactive = true opens the Google window and must be called straight from a click.
   Without a click the browser blocks that window, so a quiet attempt gets a short time limit instead of hanging. */
function gdToken(interactive) {
  if (GD.pending) return GD.pending;
  const p = DESK ? gdTokenDesk(interactive) : (async () => {
    const cid = gdClientId();
    if (!cid) throw new Error('Add your Google Client ID first');
    await loadGIS();
    return new Promise((resolve, reject) => {
      let done = false;
      const fin = (fn, v) => { if (done) return; done = true; clearTimeout(to); fn(v); };
      const to = setTimeout(() => fin(reject, Object.assign(new Error(interactive ? 'Google did not answer. Try again' : 'Google sign-in needs a click'), { quiet: !interactive })), interactive ? 180000 : 4000);
      try {
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: cid,
          scope: GD_SCOPE,
          callback: (r) => {
            if (r && r.access_token) { gdApply(r.access_token, r.expires_in); fin(resolve, GD.token); }
            else fin(reject, new Error(gdMsg(r && r.error, r && (r.error_description || r.error))));
          },
          error_callback: (e) => fin(reject, new Error(gdMsg(e && e.type)))
        });
        tc.requestAccessToken(interactive === 'pick' ? { prompt: 'select_account' } : Object.assign({ prompt: interactive ? '' : 'none' }, lsGet('console-gmail', '') ? { hint: lsGet('console-gmail', '') } : {}));
      } catch (e) { fin(reject, e); }
    });
  })();
  GD.pending = p;
  p.then(() => { GD.pending = null; }, () => { GD.pending = null; });
  return p;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && DESK && GD.pending) DESK.google.cancel(); });
/* small button shown when the Google session ran out and could not be renewed quietly */
function showReconnect() {
  GD.dead = true;
  if ($('#gdBar')) return;
  const b = document.createElement('button');
  b.id = 'gdBar'; b.type = 'button'; b.className = 'gdbar';
  b.innerHTML = '<i class="fa-brands fa-google-drive"></i><span>Google session ended. Tap to reconnect</span>';
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await gdToken(true); location.reload(); }
    catch (e) { warn(e.message || 'Could not reconnect'); b.disabled = false; }
  });
  document.body.appendChild(b);
}
function hideReconnect() { const b = $('#gdBar'); if (b) b.remove(); }
async function gdFetch(url, opts, retry = true) {
  opts = opts || {};
  if (!gdValid()) {
    if (GD.dead) throw new Error('Google session ended');
    try { await gdToken(false); } catch (e) { showReconnect(); throw new Error('Google session ended'); }
  }
  const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + GD.token }) }));
  if (r.status === 401 && retry) { GD.token = null; try { sessionStorage.removeItem('console-gtoken'); } catch (e) { /* ignore */ } return gdFetch(url, opts, false); }
  if (!r.ok && r.status !== 206) { const e = new Error(r.status === 404 ? 'Folder not found or no access' : 'Google Drive error ' + r.status); e.status = r.status; throw e; }
  return r;
}

/* behaves like a File for the rest of the app, but reads from Drive */
class DriveFile {
  constructor(m) {
    this.id = m.id; this.name = m.name; this.mime = m.mimeType || '';
    this.isDoc = this.mime === GD_DOC;
    this.size = Number(m.size) || 0;
    this.lastModified = Date.parse(m.modifiedTime) || 0;
    this.type = this.isDoc ? 'text/plain' : this.mime;
  }
  get base() { return GD_API + '/drive/v3/files/' + this.id; }
  /* same-origin address served by sw.js, which adds the sign-in and supports seeking */
  url() { return new URL('drive-file/' + this.id + '?s=' + this.size + '&t=' + encodeURIComponent(this.mime || 'application/octet-stream'), document.baseURI).href; }
  async _get(range) {
    const u = this.isDoc ? this.base + '/export?mimeType=text%2Fplain' : this.base + '?alt=media&supportsAllDrives=true';
    return gdFetch(u, range ? { headers: { Range: range } } : {});
  }
  async text() { return (await this._get()).text(); }
  async arrayBuffer() { return (await this._get()).arrayBuffer(); }
  slice(a, b) {
    const self = this;
    return { arrayBuffer: async () => (self.isDoc ? new ArrayBuffer(0) : (await self._get('bytes=' + a + '-' + (b - 1))).arrayBuffer()) };
  }
}
DriveFile.prototype.remote = true;

/* lists the children of several folders in one request (much faster than one request per folder) */
async function gdListOnce(ids) {
  const out = [];
  let page = '';
  const q = encodeURIComponent('(' + ids.map((i) => "'" + i + "' in parents").join(' or ') + ') and trashed=false');
  const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,shortcutDetails)');
  do {
    const url = GD_API + '/drive/v3/files?q=' + q + '&fields=' + fields + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const j = await (await gdFetch(url)).json();
    out.push(...(j.files || []));
    page = j.nextPageToken || '';
  } while (page);
  return out;
}
/* Google sometimes leaves out "parents" for folders shared with you; then ask one folder at a time so the parent is known */
async function gdListMany(ids) {
  const out = await gdListOnce(ids);
  if (ids.length > 1 && out.some((m) => !(m.parents && m.parents.length))) {
    const all = [];
    for (const id of ids) for (const m of await gdListOnce([id])) all.push(Object.assign({}, m, { parents: [id] }));
    return all;
  }
  if (ids.length === 1) out.forEach((m) => { if (!(m.parents && m.parents.length)) m.parents = [ids[0]]; });
  return out;
}
async function gdWalk(rootId, onCount) {
  const entries = [];
  const prefix = new Map([[rootId, '']]);
  let level = [rootId];
  const seen = new Set([rootId]);
  while (level.length) {
    const chunks = [];
    for (let i = 0; i < level.length; i += 25) chunks.push(level.slice(i, i + 25));
    const next = [];
    let ci = 0;
    const worker = async () => {
      while (ci < chunks.length) {
        const items = await gdListMany(chunks[ci++]);
        for (const m of items) {
          if (m.name.startsWith('.') || SKIP_DIRS.has(m.name)) continue;
          const par = (m.parents || []).find((p) => prefix.has(p));
          if (par === undefined) continue;
          const pre = prefix.get(par);
          let mm = m;
          if (m.mimeType === GD_SHORT && m.shortcutDetails) mm = Object.assign({}, m, { id: m.shortcutDetails.targetId, mimeType: m.shortcutDetails.targetMimeType || '' });
          if (mm.mimeType === GD_FOLDER) {
            if (!seen.has(mm.id)) { seen.add(mm.id); prefix.set(mm.id, pre + m.name + '/'); next.push(mm.id); }
            continue;
          }
          let name = m.name;
          if (mm.mimeType === GD_DOC) { if (!TEXT.has(extOf(name))) name += '.txt'; }
          else if ((mm.mimeType || '').startsWith('application/vnd.google-apps.')) continue; /* sheets, slides… */
          entries.push({ path: pre + name, name, file: new DriveFile(Object.assign({}, mm, { name })) });
        }
        onCount(entries.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    level = next;
  }
  return entries;
}
const gdSig = (entries) => entries.map((e) => e.path + '|' + e.file.id + '|' + e.file.lastModified + '|' + e.file.size).sort().join('\n');
const gdPack = (entries) => entries.map((e) => ({ path: e.path, name: e.name, m: { id: e.file.id, name: e.name, mimeType: e.file.mime, size: String(e.file.size), modifiedTime: new Date(e.file.lastModified).toISOString() } }));
function gdFolderId(s) {
  s = String(s || '').trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : '';
}
/* explains an empty result: which Google account is signed in and what Drive returned for the folder */
async function gdWhyEmpty(id) {
  let who = '', info = '';
  try { const u = (await (await gdFetch(GD_API + '/drive/v3/about?fields=user(emailAddress)')).json()).user; if (u && u.emailAddress) { who = u.emailAddress; lsSet('console-gmail', who); } } catch (e) { /* ignore */ }
  try {
    const items = await gdListOnce([id]);
    const f = items.filter((m) => m.mimeType === GD_FOLDER).length;
    info = items.length ? 'The folder has ' + items.length + ' items (' + f + ' folders), but none are music, video or text files the console can read.' : 'Drive shows this folder as empty for this account.';
  } catch (e) { info = 'Could not read the folder.'; }
  return (who ? 'Signed in as ' + who + '. ' : '') + info + ' If this is the wrong account, press Connect and choose another.';
}
/* After an instant open from the cache, quietly check Drive and redraw only if something changed */
async function refreshDriveInBackground(id, cached) {
  try {
    if (!gdValid()) { if (GD.dead) return; await gdToken(false); }
    pushToken();
    const entries = await gdWalk(id, () => {});
    if (S.source !== 'drive' || !S.drive || S.drive.id !== id) return;
    if (gdSig(entries) === cached.sig) return;
    await idb.set('dlist:' + id, { name: cached.name, sig: gdSig(entries), entries: gdPack(entries) });
    await loadVault(entries, cached.name, 'g:' + id);
  } catch (e) { if (!gdValid()) showReconnect(); /* offline or signed out: the cached view stays */ }
}
async function openDrive(id, interactive, quiet, fresh) {
  /* the Google window must open straight from the click, before any waiting */
  let tokP = null;
  if (interactive === 'pick') { GD.token = null; GD.dead = false; try { sessionStorage.removeItem('console-gtoken'); } catch (e) { /* ignore */ } }
  if (interactive && !gdValid()) { tokP = gdToken(interactive); tokP.catch(() => {}); }
  setScanning(true, 'Connecting to Google Drive…');
  const dog = setTimeout(() => { if (S.scanning && !S.vault) { setScanning(false); if (isLocked()) openSourceDialog(true, 'This is taking too long. Check your connection and press Connect again'); } }, 60000);
  try {
    if (tokP) await tokP;
    const cached = fresh ? null : await idb.get('dlist:' + id);
    if (cached && cached.entries && cached.entries.length) {
      setStatus('Opening your library…');
      if (!gdValid() && !GD.dead) { try { await gdToken(false); } catch (e) { GD.dead = true; } }
      await ensureSW();
      S.handle = null; S.desk = null; S.source = 'drive'; S.drive = { id, name: cached.name };
      lsSet(srcKey(), JSON.stringify({ type: 'drive', id, name: cached.name }));
      const entries = cached.entries.map((e) => ({ path: e.path, name: e.name, file: new DriveFile(e.m) }));
      await loadVault(entries, cached.name, 'g:' + id);
      if (GD.dead) showReconnect(); else refreshDriveInBackground(id, cached);
      return;
    }
    if (!gdValid()) {
      if (!interactive && !DESK) throw Object.assign(new Error('Sign in to Google to open your library'), { needsClick: true });
      try { await gdToken(interactive); }
      catch (e) { if (!interactive) throw Object.assign(new Error('Sign in to Google to open your library'), { needsClick: true }); throw e; }
    }
    await ensureSW();
    pushToken();
    setStatus('Reading Google Drive…');
    const meta = await (await gdFetch(GD_API + '/drive/v3/files/' + id + '?fields=name,mimeType&supportsAllDrives=true')).json();
    if (meta.mimeType !== GD_FOLDER) throw new Error('That link is not a folder');
    const entries = await gdWalk(id, () => {});
    if (!entries.length) throw new Error(await gdWhyEmpty(id));
    S.handle = null; S.desk = null; S.source = 'drive'; S.drive = { id, name: meta.name };
    gdFetch(GD_API + '/drive/v3/about?fields=user(emailAddress)').then((r) => r.json()).then((j) => { if (j.user && j.user.emailAddress) lsSet('console-gmail', j.user.emailAddress); }).catch(() => {});
    lsSet(srcKey(), JSON.stringify({ type: 'drive', id, name: meta.name }));
    idb.set('dlist:' + id, { name: meta.name, sig: gdSig(entries), entries: gdPack(entries) });
    await loadVault(entries, meta.name, 'g:' + id);
  } catch (e) {
    console.error(e);
    setScanning(false);
    renderList();
    const msg = e.message === 'Google session ended' ? 'Google session ended. Press Connect to sign in again' : (e.message || 'Could not open Google Drive');
    if (isLocked()) openSourceDialog(true, (e.needsClick || (quiet && e.quiet)) ? 'Sign in to Google to open your library' : msg);
    else if (!quiet) warn(msg);
    throw e;
  } finally { clearTimeout(dog); }
}

/* ---- source dialog: This Computer / Google Drive ---- */
function closeDialog() { const d = $('#dlg'); if (d) d.remove(); }
function openSourceDialog(required, note) {
  closeDialog();
  const link = S.drive ? 'https://drive.google.com/drive/folders/' + S.drive.id : '';
  const d = document.createElement('div');
  d.className = 'dlg' + (required ? ' solid' : ''); d.id = 'dlg';
  if (required) d.dataset.req = '1';
  d.innerHTML = `<div class="dlg-box" role="dialog" aria-label="Choose Source">
    ${required ? '<i class="fa-brands fa-pied-piper dlg-mark"></i>' : ''}
    <div class="dlg-h"><div><h3>Choose Source</h3>${required ? '<p class="dlg-sub">Where are your files? You can change this later.</p>' : ''}</div>${required ? '' : '<button class="iconbtn sm" data-d="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'}</div>
    <div class="dlg-opts">
      <button class="ghost" data-d="local"><i class="fa-solid fa-computer"></i>This Computer</button>
      <button class="ghost ${S.source === 'drive' || (!DESK && gdClientId()) ? 'on' : ''}" data-d="drive"><i class="fa-brands fa-google-drive"></i>Google Drive</button>
    </div>
    <div class="slide ${S.source === 'drive' || (!DESK && gdClientId()) ? 'open' : ''}" id="dgWrap" ${S.source === 'drive' || (!DESK && gdClientId()) ? '' : 'inert'}><div class="dlg-drive" id="dgForm">
      <label>Folder Link<input id="dgLink" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://drive.google.com/drive/folders/…" value="${esc(link)}" autocomplete="off"></label>
      ${DESK ? '' : `<label>OAuth Client ID<input id="dgClient" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="123456789-abc.apps.googleusercontent.com" value="${esc(gdClientId())}" autocomplete="off"></label>`}
      <p class="dlg-hint">The console only reads your files (read-only access).</p>
      <p class="auth-err" id="dgErr" ${note ? '' : 'hidden'}>${esc(note || '')}</p>
      <button class="primary" data-d="connect"><i class="fa-brands fa-google-drive"></i>Connect</button>
    </div></div>
    ${required && S.saved ? `<button class="linkbtn" data-d="resume"><i class="fa-solid fa-clock-rotate-left"></i>Continue: ${esc(S.saved.name)}</button>` : ''}
  </div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => {
    if (e.target === d) { if (!required) closeDialog(); return; }
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const act = b.dataset.d;
    if (act === 'close') closeDialog();
    else if (act === 'local') {
      if (DESK) { pickLocal(); return; } /* the dialog closes by itself once the folder is open */
      if (required && !window.showDirectoryPicker) { pickLocal(); return; } /* keep the dialog until the folder arrives */
      closeDialog();
      pickLocal().then((r) => { if (r === 'cancel' && isLocked()) openSourceDialog(true); });
    }
    else if (act === 'resume') {
      closeDialog();
      continueSaved().then(() => { if (isLocked() && !S.vault) openSourceDialog(true); });
    }
    else if (act === 'drive') {
      const w = $('#dgWrap');
      w.classList.add('open'); w.removeAttribute('inert');
      d.querySelectorAll('.dlg-opts .ghost').forEach((x) => x.classList.toggle('on', x === b));
      if (!DESK) loadGIS().catch(() => {});
      setTimeout(() => { const l = $('#dgLink'); if (l && !l.value) l.focus(); }, 380);
    }
    else if (act === 'connect') {
      const cid = DESK ? 'built-in' : $('#dgClient').value.trim().replace(/\s+/g, '').replace(/[\u200b-\u200d\ufeff]/g, '');
      const id = gdFolderId($('#dgLink').value);
      if (!cid) { warn('Paste your OAuth Client ID'); return; }
      if (!id) { warn('Paste the link of a Google Drive folder'); return; }
      if (DESK) { b.disabled = true; closeDialog(); openDrive(id, 'pick').catch(() => {}); return; }
      lsSet('console-gclient', cid);
      b.disabled = true;
      closeDialog();
      openDrive(id, 'pick').catch(() => {});
    }
  });
  if (!DESK && $('#dgWrap').classList.contains('open')) loadGIS().catch(() => {});
}
function pickFolder() { openSourceDialog(); }


/* ================= profiles: sign in / create account (stored on this device) ================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NICK_RX = /^[\p{L}\p{N}._-]{2,24}$/u;
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function getUsers() { try { return (JSON.parse(lsGet('console-users', '[]')) || []).map((u) => Object.assign(u, { nick: String(u.nick || '').replace(/^@+/, '') })); } catch (e) { return []; } }
function saveUsers(u) { lsSet('console-users', JSON.stringify(u)); }
async function hashPw(pw, salt) {
  if (!(window.crypto && crypto.subtle)) throw new Error('This browser cannot protect passwords (open the site over https or localhost)');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 150000 }, key, 256);
  return b64(new Uint8Array(bits));
}
function sessionUser() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('console-session') || sessionStorage.getItem('console-session') || 'null'); } catch (e) { /* none */ }
  return s ? getUsers().find((u) => u.id === s.id) || null : null;
}
function rememberSession(user, remember) {
  try {
    localStorage.removeItem('console-session'); sessionStorage.removeItem('console-session');
    (remember ? localStorage : sessionStorage).setItem('console-session', JSON.stringify({ id: user.id }));
  } catch (e) { /* ignore */ }
}
function signOut() {
  try { localStorage.removeItem('console-session'); sessionStorage.removeItem('console-session'); } catch (e) { /* ignore */ }
  location.reload();
}
const displayName = (u) => (u.preferNick ? '@' + u.nick : (u.first + ' ' + u.last).trim());
function applyProfile() {
  const hb = $('#homeBtn');
  if (hb && S.user) hb.title = displayName(S.user);
  const lo = $('#logoutBtn');
  if (lo && S.user) lo.title = 'Sign out @' + S.user.nick;
}
/* the field shows @ only while there is something typed; the saved nickname never contains it */
const nickVal = (inp) => inp.value.replace(/[@\s]+/g, '');
function fixNick(inp) { const v = nickVal(inp), nv = v ? '@' + v : ''; if (inp.value !== nv) inp.value = nv; }
function showAuth() {
  return new Promise((resolve) => {
    closeDialog();
    const hasUsers = getUsers().length > 0;
    const d = document.createElement('div');
    d.className = 'dlg solid'; d.id = 'dlg'; d.dataset.req = '1';
    let mode = 'in';
    const chk = (id, text, on) => `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${text}</span></label>`;
    /* built once: switching tabs slides the extra fields open or closed instead of redrawing */
    const build = () => {
      d.innerHTML = `<div class="dlg-box" role="dialog" aria-label="Account">
        <i class="fa-brands fa-pied-piper dlg-mark"></i>
        <div class="dlg-h"><div><h3 id="aTitle"></h3><p class="dlg-sub" id="aSub"></p></div></div>
        <div class="atabs" role="tablist">
          <button data-m="in" type="button" role="tab">Sign In</button>
          <button data-m="up" type="button" role="tab">Create Account</button>
        </div>
        <form class="dlg-drive" id="authForm" novalidate>
          <div class="xtra"><div class="two"><label>First Name<input id="aFirst" type="text" placeholder="Dean" autocomplete="given-name" maxlength="40"></label><label>Last Name<input id="aLast" type="text" placeholder="Jane" autocomplete="family-name" maxlength="40"></label></div></div>
          <label>Nickname<input id="aNick" type="text" placeholder="@DeanJane" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="25"></label>
          <label>Password<input id="aPass" type="password" placeholder="Password" autocomplete="current-password"></label>
          <div class="xtra"><div><label>Confirm Password<input id="aPass2" type="password" placeholder="Password" autocomplete="new-password"></label></div></div>
          <div class="xtra xin open"><div>${chk('aRem', 'Remember Me', false)}</div></div>
          <p class="auth-err" id="authErr" hidden></p>
          <button class="primary" type="submit" id="authGo"></button>
        </form>
      </div>`;
      const nick = $('#aNick');
      nick.addEventListener('input', () => fixNick(nick));
    };
    const setMode = (m, first) => {
      mode = m;
      const up = m === 'up';
      $('#aTitle').textContent = up ? 'Create Your Profile' : 'Welcome Back';
      $('#aSub').textContent = up ? 'Stored only on this device.' : 'Sign in to open your console.';
      d.querySelectorAll('.atabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      d.querySelectorAll('.xtra').forEach((x) => { const on = x.classList.contains('xin') ? !up : up; x.classList.toggle('open', on); if (on) x.removeAttribute('inert'); else x.setAttribute('inert', ''); });
      $('#aPass').autocomplete = up ? 'new-password' : 'current-password';
      $('#authGo').textContent = up ? 'Create Account' : 'Sign In';
      const e = $('#authErr'); e.hidden = true;
      if (first || !up) $('#aNick').focus(); else $('#aFirst').focus();
    };
    const err = (m) => { if (m) warn(m); };
    /* only latin letters, digits and punctuation: no Cyrillic in the sign-in fields */
    d.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[type=text],input[type=password]') && /[\u0400-\u052F]/.test(t.value)) { const p = t.selectionStart; t.value = t.value.replace(/[\u0400-\u052F]/g, ''); try { t.setSelectionRange(p - 1, p - 1); } catch (x) { /* ignore */ } if (t.id === 'aNick') fixNick(t); }
    });
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (b && b.dataset.m !== mode) setMode(b.dataset.m);
    });
    d.addEventListener('submit', async (e) => {
      e.preventDefault();
      const go = $('#authGo');
      const nick = nickVal($('#aNick')), pass = $('#aPass').value, rem = mode === 'in' && $('#aRem').checked;
      const users = getUsers();
      go.disabled = true;
      try {
        if (mode === 'in') {
          const u = users.find((x) => x.nick.toLowerCase() === nick.toLowerCase());
          if (!nick || !pass) throw new Error('Enter your nickname and password');
          if (!u || (await hashPw(pass, u.salt)) !== u.hash) throw new Error('Wrong nickname or password');
          rememberSession(u, rem);
          d.remove(); resolve(u);
          return;
        }
        const first = $('#aFirst').value.trim(), last = $('#aLast').value.trim(), pass2 = $('#aPass2').value;
        if (!first || !last) throw new Error('Enter your first and last name');
        if (!NICK_RX.test(nick)) throw new Error('Nickname: 2–24 letters, digits, dot, dash or underscore');
        if (users.some((x) => x.nick.toLowerCase() === nick.toLowerCase())) throw new Error('This nickname is already taken');
        if (pass.length < 6) throw new Error('Password must be at least 6 characters');
        if (pass !== pass2) throw new Error('Passwords do not match');
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        const u = { id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), first, last, nick, preferNick: false, salt, hash: await hashPw(pass, salt), created: Date.now() };
        users.push(u); saveUsers(users);
        rememberSession(u, rem);
        d.remove(); resolve(u);
      } catch (ex) {
        err(ex.message || 'Something went wrong');
        go.disabled = false;
      }
    });
    document.body.appendChild(d);
    build();
    setMode('in', true);
  });
}

/* after sign-in: open the saved library, or ask where the files are */
async function enterApp(user) {
  S.user = user;
  try { S.secret = JSON.parse(lsGet('console-secret:' + user.id, '{}')) || {}; S.hideGroups = JSON.parse(lsGet('console-hide:' + user.id, '[]')) || []; } catch (e) { S.secret = {}; S.hideGroups = []; }
  applyProfile();
  setScanning(true, 'Signing you in…');
  await sleep(350);
  setStatus('Preparing your workspace…');
  let src = null;
  try {
    /* one-time: the folder saved before profiles had their own belongs to the first account */
    const old = lsGet('console-source', null);
    if (old !== null) {
      const first = getUsers()[0];
      if (first && first.id === user.id && lsGet(srcKey(), null) === null) lsSet(srcKey(), old);
      if (first && first.id === user.id) { try { localStorage.removeItem('console-source'); } catch (e) { /* ignore */ } }
    }
    const pend = lsGet('console-source-setup', null);
    if (pend !== null && lsGet(srcKey(), null) === null) { lsSet(srcKey(), pend); try { localStorage.removeItem('console-source-setup'); } catch (e) { /* ignore */ } }
  } catch (e) { /* ignore */ }
  try { src = JSON.parse(lsGet(srcKey(), 'null')); } catch (e) { /* ignore */ }
  if (src && src.type === 'drive' && src.id) {
    S.source = 'drive'; S.drive = { id: src.id, name: src.name || 'Google Drive' };
    try { await openDrive(src.id, false, true); return; } catch (e) { return; } /* openDrive reopens the chooser on failure */
  }
  if (src && src.type === 'desk' && DESK && src.path) {
    try { await openDesk(src.path); } catch (e) { /* openDesk reopens the chooser on failure */ }
    return;
  }
  const h = DESK ? null : await idb.get('handle');
  if (h) {
    S.saved = h;
    let state = 'prompt';
    try { state = await h.queryPermission({ mode: 'read' }); } catch (e) { /* needs a gesture */ }
    if (state === 'granted') { await openHandle(h); return; }
  }
  setScanning(false);
  openSourceDialog(true);
}

/* ================= theme / boot ================= */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', S.theme);
  lsSet('vault-theme', S.theme);
  $('#themeBtn i').className = 'fa-solid ' + (S.theme === 'dark' ? 'fa-sun' : 'fa-moon');
  drawWave();
}

async function continueSaved() {
  if (S.source === 'drive' && S.drive) { try { await openDrive(S.drive.id, true); } catch (e) { /* already reported */ } return; }
  const h = S.saved;
  if (!h) return;
  try {
    const p = await h.requestPermission({ mode: 'read' });
    if (p !== 'granted') { warn('No access to the folder'); return; }
    await openHandle(h);
  } catch (e) { console.error(e); warn('Could not open the folder'); }
}

/* The browser only lets a page re-open a saved folder after a user gesture.
   So: the very first click or key press anywhere reopens the last folder. */
function armAutoResume() {
  if (S.vault || (!S.saved && !S.drive)) return;
  const evs = ['pointerdown', 'keydown'];
  const off = () => evs.forEach((ev) => document.removeEventListener(ev, onGesture, true));
  function onGesture(e) {
    off();
    if (S.vault) return;
    if (e.target && e.target.closest && e.target.closest('[data-act="open"],#folderBtn')) return; /* they chose a new folder */
    if (e.type === 'keydown' && (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Escape')) return;
    continueSaved();
  }
  evs.forEach((ev) => document.addEventListener(ev, onGesture, true));
}

async function boot() {
  try { await boot1(); } finally { setScanning(false); }
}
async function boot1() {
  applyTheme();
  pvol.value = S.vol; setFill(pvol); updateMuteIcon(); applyVolume();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  renderAll();
  fitBrand();
  const lo = $('#logoutBtn'); if (lo) lo.addEventListener('click', signOut);
  /* a setup link (#setup=...) copied from another device fills in the Client ID and folder */
  try {
    const m = location.hash.match(/^#setup=(.+)$/);
    if (m) {
      const d = JSON.parse(atob(m[1]));
      if (d.c && d.f) {
        lsSet('console-gclient', String(d.c));
        lsSet('console-source-setup', JSON.stringify({ type: 'drive', id: String(d.f), name: 'Google Drive' }));
      }
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (e) { /* ignore a broken link */ }
  if (DESK) { try { S.deskG = await DESK.google.status(); } catch (e) { S.deskG = null; } }
  document.body.classList.add('locked');
  await sleep(450); /* a short, quiet preloader before the sign-in form */
  let user = sessionUser();
  if (!user) { setScanning(false); user = await showAuth(); }
  await enterApp(user);
}
ldStart(false);
boot();

})();
