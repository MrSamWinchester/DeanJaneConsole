/* Dean Jane Console — runs fully locally, files are never uploaded. */
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
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

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
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= storage (IndexedDB) ================= */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('music-vault', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this.db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
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
  { id: 'demo', group: 'music', label: 'Demos', icon: 'fa-microphone-lines' },
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
const GROUPED = new Set(['demo', 'lyrics', 'video', 'lyricvideo']); /* lists split by album folder */
const WIDE_SECS = new Set(['docs', 'n_docs', 'n_notes', 'n_bib']); /* these readers get a fixed 914px panel */

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
  vault: false, handle: null, saved: null, name: '',
  base: [], items: [], albums: [], byUid: new Map(), byPath: new Map(), uid: 1,
  idx: { byAlbumTitle: new Map(), byTitle: new Map() },
  section: 'home', query: '', sort: 'date',
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
        a = { uid: S.uid++, kind: 'album', path: key, title: key.split('/').pop(), tracks: [], section: 'disc', ext: '', dir: dirOf(key), hidden: false, albumName: '', _hay: null };
        albums.set(key, a);
      }
      a.tracks.push(it);
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
  const worker = async () => { while (idx < list.length && run === tagRun) { const it = list[idx++]; it.tag = await readTags(it); } };
  await Promise.all([worker(), worker(), worker()]);
  if (run !== tagRun) return;
  applyOrdering();
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
  let list = S.items.filter((i) => !i.hidden);
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
function layout() {
  const list = filtered();
  if (S.section === 'video') {
    return { cols: [
      { title: 'Videos', groups: groupItems(list.filter((i) => i.section !== 'lyricvideo')) },
      { title: 'Lyric Videos', groups: groupItems(list.filter((i) => i.section === 'lyricvideo')) }
    ] };
  }
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

async function pickLocal() {
  if (window.showDirectoryPicker) {
    try {
      const h = await window.showDirectoryPicker({ mode: 'read' });
      await idb.set('handle', h);
      S.saved = h;
      await openHandle(h);
    } catch (e) {
      if (e && e.name !== 'AbortError') { console.error(e); toast('Could not open the folder'); }
    }
  } else {
    $('#fallback').click();
  }
}

async function openHandle(h) {
  S.handle = h;
  S.source = 'local'; S.drive = null;
  lsSet('console-source', '{"type":"local"}');
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
    toast('Error reading the folder');
    setScanning(false);
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
  S.vault = true;
  setScanning(false);
  $('#folderName').textContent = name;
  renderAll();
  S.base.forEach((it) => { if (it.kind === 'audio' || it.kind === 'video') queueMeta(it); });
  loadAllText();
  loadAllTags();
}

function setScanning(on) {
  S.scanning = on;
  const l = $('#loader');
  if (l) l.classList.toggle('on', !!on);
}

async function refresh() {
  if (!S.vault) return;
  if (S.source === 'drive' && S.drive) {
    try { await openDrive(S.drive.id, true); toast('File list refreshed'); } catch (e) { /* already reported */ }
    return;
  }
  if (S.handle) {
    try {
      const p = await S.handle.requestPermission({ mode: 'read' });
      if (p !== 'granted') { toast('No access to the folder'); return; }
    } catch (e) { /* ignore */ }
    await openHandle(S.handle);
    toast('File list refreshed');
  } else {
    toast('Open the folder again to refresh');
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
function pumpMeta() {
  while (loading < 4 && loadQ.length) {
    const it = loadQ.shift();
    loading++;
    const el = document.createElement(it.kind === 'video' ? 'video' : 'audio');
    el.preload = it.kind === 'video' ? 'auto' : 'metadata';
    const url = fileUrl(it.file);
    if (it.file.url) el.crossOrigin = 'anonymous'; /* lets the video still be copied to a canvas */
    let finished = false;
    const done = (ok) => {
      if (finished) return;
      finished = true;
      if (ok) { it.dur = el.duration; if (it.kind === 'video') { it.vw = el.videoWidth; it.vh = el.videoHeight; } it.metaState = 2; }
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
        const sc = Math.min(1, 240 / (el.videoWidth || 240));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(el.videoWidth * sc)); cv.height = Math.max(1, Math.round(el.videoHeight * sc));
        const g = cv.getContext('2d');
        g.drawImage(el, 0, 0, cv.width, cv.height);
        if (!it._thumbTry) { /* a nearly black frame: try another spot once */
          const px = g.getImageData(0, 0, cv.width, cv.height).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 16) sum += px[i] + px[i + 1] + px[i + 2];
          if (sum / (px.length / 16) / 3 < 14) { it._thumbTry = 1; el.currentTime = el.duration * 0.3; return; }
        }
        it.thumb = cv.toDataURL('image/jpeg', 0.72);
      } catch (e) { /* no preview */ }
      done(true);
    };
    el.onerror = () => {
      if (it.file.url && el.crossOrigin && !finished && !el._noCors) { el._noCors = 1; el.removeAttribute('crossorigin'); el.src = url; return; } /* no CORS: still get the duration */
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
  S.items.forEach((i) => { if (!i.hidden) counts[i.section] = (counts[i.section] || 0) + 1; });
  const total = S.items.filter((i) => !i.hidden).length;
  const num = (id) => (id === 'all' ? total : id === 'video' ? (counts.video || 0) + (counts.lyricvideo || 0) : (counts[id] || 0));
  const btn = (s) => `<button data-sec="${s.id}" class="${S.section === s.id ? 'on' : ''}"><i class="fa-solid ${s.icon}"></i><span>${s.label}</span><span class="n">${S.vault ? num(s.id) : ''}</span></button>`;
  let html = '';
  if (SHOW_ALL_IN_MENU) html += btn(SEC.all);
  GROUPS.forEach((g) => {
    html += `<div class="nav-h">${g.label}</div>`;
    SECTIONS.filter((s) => s.group === g.id && !s.hiddenNav).forEach((s) => { html += btn(s); });
  });
  $('#nav').innerHTML = html;
}

function renderHead() {
  const s = SEC[S.section];
  const searching = S.section === 'home' && !!S.query.trim();
  const home = S.section === 'home' && !searching;
  $('#title').textContent = searching ? 'Search' : s.label;
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
  const right = it.kind === 'album' ? it.tracks.length + ' Tracks' : durText(it);
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
function homeHtml() {
  const items = S.items.filter((i) => !i.hidden);
  const albums = S.albums.slice().sort((x, y) => dateTs(getDate(x)) - dateTs(getDate(y)) || natural.compare(x.title, y.title));
  const coverOf = (al) => (al.cover ? `<img alt="" src="${coverUrl(al.cover)}">` : '<i class="fa-solid fa-compact-disc"></i>');
  const grid = albums.slice(-12).map((al) => `<button class="alb" data-open="${al.uid}"><span class="cv">${coverOf(al)}</span><b>${esc(al.title)}</b><small>${esc(monthYear(getDate(al)))}</small></button>`).join('');
  const recent = items.filter((i) => !(i.kind === 'audio' && i.section === 'disc')).sort((x, y) => y.modified - x.modified).slice(0, 16);
  const row = (it) => {
    const alb = it.kind === 'album';
    const sub = alb ? 'Album' : (SEC[it.section] || SEC.other).label;
    return `<button class="rrow" data-pick="${it.uid}"><span class="ri"><i class="fa-solid ${alb ? 'fa-compact-disc' : iconOf(it)}"></i></span><span class="rt"><b>${esc(it.title)}</b><small>${esc(sub)}</small></span><span class="rd">${esc(monthYear(getDate(it)))}</span></button>`;
  };
  return `<div class="home">
    <section class="hsec home-main">
      <div class="hsec-h"><span>Discography</span><button data-go="disc">View All</button></div>
      ${albums.length ? `<div class="alb-grid">${grid}</div>` : '<div class="hint-line">No albums yet.</div>'}
    </section>
    <aside class="home-side">
      <div class="hsec-h"><span>Recent</span></div>
      <div class="rec">${recent.length ? recent.map(row).join('') : '<div class="hint-line">Nothing here yet.</div>'}</div>
    </aside>
  </div>`;
}

/* Recent: rows of equal height, as many as fit exactly into the height of the three album rows */
const REC_ROW = 52;
function fitRecent() {
  const rec = $('.rec'), g = $('.alb-grid');
  if (!rec || !g) return;
  const h = g.offsetHeight;
  if (!h) return;
  rec.style.height = h + 'px';
  const n = Math.max(1, Math.floor(h / REC_ROW));
  [...rec.children].forEach((r, i) => { r.style.display = i < n ? '' : 'none'; });
}
if (window.ResizeObserver) new ResizeObserver(() => fitRecent()).observe($('#list'));

function renderList() {
  const el = $('#list');
  const st = el.scrollTop;
  if (!S.vault) { el.innerHTML = welcomeHtml(); $('#count').textContent = ''; return; }
  const totalFiles = S.items.filter((i) => !i.hidden).length;
  const searching = !!S.query.trim();
  el.classList.toggle('is-home', S.section === 'home' && !searching);
  if (S.section === 'home' && !searching) {
    $('#count').textContent = '';
    el.innerHTML = homeHtml();
    fitRecent();
    el.scrollTop = st;
    refreshRowStates();
    markSelectedRow();
    return;
  }
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
  audio.play().catch((err) => { if (err && err.name !== 'AbortError') toast('Could not play: ' + it.name); });
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
audio.addEventListener('error', () => { if (S.now && audio.src) toast('Could not play: ' + S.now.name); });

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
  if (cover) cov.innerHTML = `<img alt="" src="${coverUrl(cover)}">`;
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
  videoEl.addEventListener('error', () => toast('Could not play the video. The browser may not support this format.'));
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
const coverUrl = (img) => (img.url = img.url || fileUrl(img.file));

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
  if (f.length % 2) html += '<div class="fact"></div>';
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
      ? `<img alt="" src="${coverUrl(it.cover)}">`
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
    }).catch(() => toast('Could not load the PDF'));
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
function setMenuOpen(on) { $('.side').classList.toggle('open', on); $('#app').classList.toggle('menu-open', on); }
function applyDetailWidth() {
  const app = $('#app');
  const it = S.selected;
  const home = S.section === 'home' && !S.query.trim();
  const wide = !home && !!it && it.kind === 'text' && WIDE_SECS.has(it.section) && window.innerWidth > 1000;
  if (wide) app.style.setProperty('--detail-w', 'min(914px, calc(100vw - 600px))');
  else if (S.section === 'lyrics' && window.innerWidth > 1000) app.style.setProperty('--detail-w', '479px');
  else app.style.removeProperty('--detail-w');
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
$('#themeBtn').addEventListener('click', () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; applyTheme(); });

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
    case 'copy-path': copyText(S.name + '/' + it.path).then((ok) => toast(ok ? 'Path copied' : 'Could not copy')); break;
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
  if (k === 'Escape') { setDetailOpen(false); setMenuOpen(false); closeDialog(); }
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
  S.handle = null;
  S.source = 'local'; S.drive = null;
  lsSet('console-source', '{"type":"local"}');
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
  const item = e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items[0];
  if (!item || !item.getAsFileSystemHandle) { toast('Dropping a folder works in Chrome and Edge'); return; }
  try {
    const h = await item.getAsFileSystemHandle();
    if (h && h.kind === 'directory') { await idb.set('handle', h); S.saved = h; await openHandle(h); }
    else toast('Drop a folder, not a file');
  } catch (err) { console.error(err); }
});


/* ================= Google Drive ================= */
const GD_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GD_FOLDER = 'application/vnd.google-apps.folder';
const GD_SHORT = 'application/vnd.google-apps.shortcut';
const GD_DOC = 'application/vnd.google-apps.document';
const GD = { token: null, exp: 0, pending: null, timer: null };
try { const t = JSON.parse(sessionStorage.getItem('console-gtoken') || 'null'); if (t && t.exp > Date.now()) { GD.token = t.token; GD.exp = t.exp; } } catch (e) { /* no saved token */ }
const gdClientId = () => lsGet('console-gclient', '');
const gdValid = () => !!GD.token && Date.now() < GD.exp;

function loadGIS() {
  return new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.oauth2) { res(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => res();
    s.onerror = () => rej(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
}
function gdSchedule() {
  clearTimeout(GD.timer);
  GD.timer = setTimeout(() => { gdToken(false).catch(() => {}); }, Math.max(30000, GD.exp - Date.now() - 120000));
}
/* interactive = true may show the Google sign-in window, so call it from a click */
function gdToken(interactive) {
  if (GD.pending) return GD.pending;
  const p = (async () => {
    const cid = gdClientId();
    if (!cid) throw new Error('Add your Google Client ID first');
    await loadGIS();
    return new Promise((resolve, reject) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: GD_SCOPE,
        callback: (r) => {
          if (r && r.access_token) {
            GD.token = r.access_token;
            GD.exp = Date.now() + Math.max(60, (r.expires_in || 3600) - 90) * 1000;
            try { sessionStorage.setItem('console-gtoken', JSON.stringify({ token: GD.token, exp: GD.exp })); } catch (e) { /* ignore */ }
            S.base.forEach((i) => { if (i.kind === 'image') i.url = null; }); /* cover links carry the token */
            gdSchedule();
            resolve(GD.token);
          } else reject(new Error((r && (r.error_description || r.error)) || 'Sign-in failed'));
        },
        error_callback: (e) => reject(new Error((e && e.type) || 'Sign-in was cancelled'))
      });
      tc.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  })();
  GD.pending = p;
  p.then(() => { GD.pending = null; }, () => { GD.pending = null; });
  return p;
}
async function gdFetch(url, opts, retry = true) {
  opts = opts || {};
  if (!gdValid()) {
    try { await gdToken(false); } catch (e) { throw new Error('Google session expired. Press Refresh to sign in again.'); }
  }
  const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + GD.token }) }));
  if (r.status === 401 && retry) { GD.token = null; return gdFetch(url, opts, false); }
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
  get base() { return 'https://www.googleapis.com/drive/v3/files/' + this.id; }
  url() { return (this.isDoc ? this.base + '/export?mimeType=text%2Fplain' : this.base + '?alt=media&supportsAllDrives=true') + (this.isDoc ? '&' : '&') + 'access_token=' + encodeURIComponent(GD.token || ''); }
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

async function gdList(id) {
  const out = [];
  let page = '';
  do {
    const q = encodeURIComponent("'" + id + "' in parents and trashed=false");
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime,shortcutDetails)');
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=' + fields + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const j = await (await gdFetch(url)).json();
    out.push(...(j.files || []));
    page = j.nextPageToken || '';
  } while (page);
  return out;
}
async function gdWalk(rootId, onCount) {
  const entries = [];
  const queue = [{ id: rootId, prefix: '' }];
  let active = 0, failed = false;
  await new Promise((resolve, reject) => {
    const pump = () => {
      if (failed) return;
      while (active < 6 && queue.length) {
        const f = queue.shift();
        active++;
        gdList(f.id).then((items) => {
          for (const m of items) {
            if (m.name.startsWith('.') || SKIP_DIRS.has(m.name)) continue;
            let mm = m;
            if (m.mimeType === GD_SHORT && m.shortcutDetails) mm = Object.assign({}, m, { id: m.shortcutDetails.targetId, mimeType: m.shortcutDetails.targetMimeType || '' });
            if (mm.mimeType === GD_FOLDER) { queue.push({ id: mm.id, prefix: f.prefix + m.name + '/' }); continue; }
            let name = m.name;
            if (mm.mimeType === GD_DOC) { if (!TEXT.has(extOf(name))) name += '.txt'; }
            else if ((mm.mimeType || '').startsWith('application/vnd.google-apps.')) continue; /* sheets, slides… */
            entries.push({ path: f.prefix + name, name, file: new DriveFile(Object.assign({}, mm, { name })) });
          }
          onCount(entries.length);
        }).catch((e) => { failed = true; reject(e); }).finally(() => {
          active--;
          if (!failed) { if (!queue.length && !active) resolve(); else pump(); }
        });
      }
    };
    pump();
  });
  return entries;
}
function gdFolderId(s) {
  s = String(s || '').trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : '';
}
async function openDrive(id, interactive, quiet) {
  setScanning(true, 'Connecting to Google Drive…');
  try {
    if (!gdValid()) await gdToken(interactive);
    setScanning(true, 'Reading Google Drive…');
    const meta = await (await gdFetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=name,mimeType&supportsAllDrives=true')).json();
    if (meta.mimeType !== GD_FOLDER) throw new Error('That link is not a folder');
    const entries = await gdWalk(id, (n) => setScanning(true, 'Reading Google Drive… ' + n));
    S.handle = null; S.source = 'drive'; S.drive = { id, name: meta.name };
    lsSet('console-source', JSON.stringify({ type: 'drive', id, name: meta.name }));
    await loadVault(entries, meta.name, 'g:' + id);
  } catch (e) {
    console.error(e);
    setScanning(false);
    renderList();
    if (!quiet) toast(e.message || 'Could not open Google Drive');
    throw e;
  }
}

/* ---- source dialog: This Computer / Google Drive ---- */
function closeDialog() { const d = $('#dlg'); if (d) d.remove(); }
function openSourceDialog() {
  closeDialog();
  const link = S.drive ? 'https://drive.google.com/drive/folders/' + S.drive.id : '';
  const d = document.createElement('div');
  d.className = 'dlg'; d.id = 'dlg';
  d.innerHTML = `<div class="dlg-box" role="dialog" aria-label="Choose Source">
    <div class="dlg-h"><h3>Choose Source</h3><button class="iconbtn sm" data-d="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-opts">
      <button class="ghost" data-d="local"><i class="fa-solid fa-computer"></i>This Computer</button>
      <button class="ghost ${S.source === 'drive' ? 'on' : ''}" data-d="drive"><i class="fa-brands fa-google-drive"></i>Google Drive</button>
    </div>
    <div class="dlg-drive" id="dgForm" ${S.source === 'drive' || gdClientId() ? '' : 'hidden'}>
      <label>Folder link<input id="dgLink" type="text" placeholder="https://drive.google.com/drive/folders/…" value="${esc(link)}" autocomplete="off"></label>
      <label>OAuth Client ID<input id="dgClient" type="text" placeholder="123456789-abc.apps.googleusercontent.com" value="${esc(gdClientId())}" autocomplete="off"></label>
      <p>The console only reads your files (read-only access). The setup steps are in README.txt.</p>
      <button class="primary" data-d="connect"><i class="fa-brands fa-google-drive"></i>Connect</button>
    </div>
  </div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => {
    if (e.target === d) { closeDialog(); return; }
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const act = b.dataset.d;
    if (act === 'close') closeDialog();
    else if (act === 'local') { closeDialog(); pickLocal(); }
    else if (act === 'drive') { $('#dgForm').hidden = false; loadGIS().catch(() => {}); $('#dgLink').focus(); }
    else if (act === 'connect') {
      const cid = $('#dgClient').value.trim();
      const id = gdFolderId($('#dgLink').value);
      if (!cid) { toast('Paste your OAuth Client ID'); return; }
      if (!id) { toast('Paste the link of a Google Drive folder'); return; }
      lsSet('console-gclient', cid);
      closeDialog();
      openDrive(id, true).catch(() => {});
    }
  });
  if (!$('#dgForm').hidden) loadGIS().catch(() => {});
}
function pickFolder() { openSourceDialog(); }

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
    if (p !== 'granted') { toast('No access to the folder'); return; }
    await openHandle(h);
  } catch (e) { console.error(e); toast('Could not open the folder'); }
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
  let src = null;
  try { src = JSON.parse(lsGet('console-source', 'null')); } catch (e) { /* ignore */ }
  if (src && src.type === 'drive' && src.id) {
    S.source = 'drive'; S.drive = { id: src.id, name: src.name || 'Google Drive' };
    try { await openDrive(src.id, false, true); } catch (e) { renderList(); armAutoResume(); }
    return;
  }
  const h = await idb.get('handle');
  if (h) {
    S.saved = h;
    let state = 'prompt';
    try { state = await h.queryPermission({ mode: 'read' }); } catch (e) { /* needs a gesture */ }
    if (state === 'granted') { await openHandle(h); return; }
    renderList();
    armAutoResume();
  }
}
boot();

})();
