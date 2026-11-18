/* Dean Jane Console: streams Google Drive files to <audio>, <video> and <img> with the sign-in token attached. */
let TOKEN = null, EXP = 0, API = 'https://www.googleapis.com';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'token') { TOKEN = d.token; EXP = d.exp; if (d.api) API = d.api; }
});

async function askToken(force) {
  const cs = await self.clients.matchAll({ type: 'window' });
  for (const c of cs) {
    try {
      const t = await new Promise((res, rej) => {
        const ch = new MessageChannel();
        const to = setTimeout(() => rej(new Error('timeout')), 15000);
        ch.port1.onmessage = (ev) => { clearTimeout(to); res(ev.data); };
        c.postMessage({ type: 'need-token', force: !!force }, [ch.port2]);
      });
      if (t && t.token) { TOKEN = t.token; EXP = t.exp; if (t.api) API = t.api; return TOKEN; }
    } catch (e) { /* try the next window */ }
  }
  return null;
}
async function getToken(force) {
  if (!force && TOKEN && Date.now() < EXP - 30000) return TOKEN;
  return (await askToken(force)) || TOKEN;
}

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  const m = u.pathname.match(/\/drive-file\/([\w-]+)$/);
  if (!m || u.origin !== location.origin) return;
  e.respondWith(serve(e.request, m[1], u));
});

async function serve(req, id, u) {
  const size = Number(u.searchParams.get('s')) || 0;
  const type = u.searchParams.get('t') || 'application/octet-stream';
  let a = 0, b = size ? size - 1 : null, partial = false;
  const rg = req.headers.get('range');
  if (rg && size) {
    const mm = rg.match(/bytes=(\d*)-(\d*)/);
    if (mm) {
      if (mm[1] === '' && mm[2] !== '') a = Math.max(0, size - Number(mm[2]));
      else { a = Number(mm[1]) || 0; if (mm[2] !== '') b = Math.min(Number(mm[2]), size - 1); }
      partial = true;
    }
  }
  if (size && a >= size) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  const go = (tok) => fetch(API + '/drive/v3/files/' + id + '?alt=media&supportsAllDrives=true', {
    headers: Object.assign({ Authorization: 'Bearer ' + tok }, size ? { Range: 'bytes=' + a + '-' + b } : (rg ? { Range: rg } : {}))
  });
  let tok = await getToken(false);
  if (!tok) return new Response('Not signed in', { status: 401 });
  let r = await go(tok);
  if (r.status === 401) { tok = await getToken(true); if (tok) r = await go(tok); }
  if (!r.ok && r.status !== 206) return new Response('Drive error ' + r.status, { status: r.status });
  const h = new Headers({ 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=0' });
  if (size) {
    h.set('Content-Length', String(b - a + 1));
    if (partial) { h.set('Content-Range', 'bytes ' + a + '-' + b + '/' + size); return new Response(r.body, { status: 206, headers: h }); }
    return new Response(r.body, { status: 200, headers: h });
  }
  return new Response(r.body, { status: r.status, headers: h });
}
