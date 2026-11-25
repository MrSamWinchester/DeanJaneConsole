/* Jane Messages: a fan network (prototype: everything is stored on this device) */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let JUST_REGISTERED = false;
let toastTimer;
function warn(msg) {
  const t = $('#toast');
  if (!t || !msg) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
let hintTimer;
function hint(msg) {
  const t = $('#hint');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function addCopy(d) {
  const p = document.createElement('p'); p.className = 'copy';
  p.innerHTML = '<span>©</span> 2027 Jane Company Inc.';
  d.appendChild(p);
  const mo = new MutationObserver(() => { if (d.isConnected === false) { mo.disconnect(); return; } if (p.parentNode !== d) { mo.disconnect(); d.appendChild(p); mo.observe(d, { childList: true }); } });
  mo.observe(d, { childList: true });
}
function closeDialog() { const d = $('#dlg'); if (d) d.remove(); }

/* ---- theme: follows the system until you choose one yourself ---- */
const S = { user: null, prof: null, posts: [], q: '', att: null, radio: false, tour: {} };
function applyTheme() {
  const m = lsGet('jm-theme-manual', '');
  const t = m || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  return t;
}
applyTheme();
if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!lsGet('jm-theme-manual', '')) applyTheme(); }); } catch (e) { /* old browser */ } }

/* ---- loader ---- */
const LDX = { iv: 0, p: 0 };
function ldOn(msg) {
  const l = $('#loader'); l.classList.add('on'); document.body.classList.add('locked');
  LDX.p = 0; $('#ldBar').style.width = '0';
  clearInterval(LDX.iv);
  LDX.iv = setInterval(() => { LDX.p += (92 - LDX.p) * 0.06; $('#ldBar').style.width = LDX.p + '%'; }, 80);
  ldMsg(msg || '');
}
function ldMsg(msg) {
  const m = $('#loaderMsg');
  if (!msg) { m.classList.remove('show'); return; }
  setTimeout(() => { m.textContent = msg; m.classList.add('show'); }, 120);
}
async function ldOff() {
  clearInterval(LDX.iv); $('#ldBar').style.width = '100%';
  await sleep(260);
  $('#loader').classList.remove('on'); document.body.classList.remove('locked');
  $('#loaderMsg').classList.remove('show');
}

/* ================= profiles: sign in / create account (stored on this device) ================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NICK_RX = /^[\p{L}\p{N}._-]{2,24}$/u;
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function getUsers() { try { return (JSON.parse(lsGet('jm-users', '[]')) || []).map((u) => Object.assign(u, { nick: String(u.nick || '').replace(/^@+/, '') })); } catch (e) { return []; } }
function saveUsers(u) { lsSet('jm-users', JSON.stringify(u)); }
async function hashPw(pw, salt) {
  if (!(window.crypto && crypto.subtle)) throw new Error('This browser cannot protect passwords (open the site over https or localhost)');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 150000 }, key, 256);
  return b64(new Uint8Array(bits));
}
function sessionUser() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('jm-session') || sessionStorage.getItem('jm-session') || 'null'); } catch (e) { /* none */ }
  return s ? getUsers().find((u) => u.id === s.id) || null : null;
}
function rememberSession(user, remember) {
  try {
    localStorage.removeItem('jm-session'); sessionStorage.removeItem('jm-session');
    (remember ? localStorage : sessionStorage).setItem('jm-session', JSON.stringify({ id: user.id }));
  } catch (e) { /* ignore */ }
}
/* the field shows @ only while there is something typed; the saved nickname never contains it */
const nickVal = (inp) => inp.value.replace(/[@\s]+/g, '');
function fixNick(inp) { const v = nickVal(inp), nv = v ? '@' + v : ''; if (inp.value !== nv) inp.value = nv; }
function showAuth() {
  return new Promise((resolve) => {
    closeDialog();
    const hasUsers = getUsers().length > 0;
    const d = document.createElement('div');
    d.className = 'dlg solid'; d.id = 'dlg'; d.dataset.req = '1'; addCopy(d);
    let mode = 'in';
    const arrow = '<button class="qgo" type="submit" aria-label="Continue"><i class="fa-solid fa-arrow-right"></i></button>';
    const build = () => {
      d.innerHTML = `<div class="dlg-box authq" role="dialog" aria-label="Account">
        <div class="aq-top"><i class="fa-brands fa-pied-piper dlg-mark"></i><div class="aq-step"><span id="aCount"></span></div></div>
        <form id="authForm" novalidate>
          <small class="aq-lab" id="aLab"></small>
          <h3 class="aq-h" id="aTitle"></h3>
          <div class="aq-stack">
            <div class="aq-pane" data-s="first"><div class="aq-row"><input id="aFirst" type="text" placeholder="Dean" autocomplete="given-name" maxlength="40" aria-label="First Name">${arrow}</div></div>
            <div class="aq-pane" data-s="last"><div class="aq-row"><input id="aLast" type="text" placeholder="Jane" autocomplete="family-name" maxlength="40" aria-label="Last Name">${arrow}</div></div>
            <div class="aq-pane" data-s="nick"><div class="aq-row ic"><i class="fa-solid fa-user"></i><input id="aNick" type="text" placeholder="@DeanJane" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="25" aria-label="Nickname">${arrow}</div></div>
            <div class="aq-pane" data-s="pass"><div class="aq-row ic"><i class="fa-solid fa-key"></i><input id="aPass" type="password" placeholder="Password" autocomplete="current-password" aria-label="Password">${arrow}</div></div>
            <div class="aq-pane" data-s="confirm"><div class="aq-row ic"><i class="fa-solid fa-key"></i><input id="aPass2" type="password" placeholder="Confirm Password" autocomplete="new-password" aria-label="Confirm Password">${arrow}</div></div>
          </div>
        </form>
        <div class="aq-mid"><button type="button" class="aq-back" id="aBack">Go Back</button></div>
        <div class="aq-foot"><p class="auth-swap"><span id="aSwapT"></span> <button type="button" id="aSwapB"></button></p><div class="aq-dots" id="aDots"></div></div>
      </div>`;
      const nick = $('#aNick');
      nick.addEventListener('input', () => fixNick(nick));
    };
    let steps = ['nick', 'pass'], at = 0;
    const seqFor = (up) => (up ? ['first', 'last', 'nick', 'pass', 'confirm'] : ['nick', 'pass']);
    const paint = (focus) => {
      const up = mode === 'up', name = steps[at], last = at === steps.length - 1;
      d.firstElementChild.classList.toggle('up', up);
      $('#aLab').textContent = up ? 'Create Account' : 'Sign In';
      $('#aTitle').textContent = { first: 'What is your first name?', last: 'And your last name?', confirm: 'Confirm your password', nick: up ? 'Choose a nickname' : 'What is your nickname?', pass: up ? 'Create a password' : 'And your password?' }[name];
      $('#aCount').textContent = (at + 1) + ' / ' + steps.length;
      $('#aBack').classList.toggle('on', at > 0);
      $('#aDots').innerHTML = steps.map((x, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('');
      d.querySelectorAll('.aq-pane').forEach((p) => {
        const i = steps.indexOf(p.dataset.s);
        const pos = i < 0 ? 'after' : i < at ? 'before' : i === at ? 'active' : 'after';
        p.dataset.pos = pos;
        if (pos === 'active') p.removeAttribute('inert'); else p.setAttribute('inert', '');
      });
      $('#aPass').autocomplete = up ? 'new-password' : 'current-password';
      $('#aSwapT').textContent = up ? 'Have An Account?' : "Don't Have An Account?";
      $('#aSwapB').textContent = up ? 'Sign In' : 'Sign Up';
      $('#aSwapB').dataset.m = up ? 'in' : 'up';
      if (focus) setTimeout(() => { const p = d.querySelector('.aq-pane[data-pos="active"] input'); if (p) p.focus(); }, 60);
    };
    const setMode = (m, first) => {
      mode = m; steps = seqFor(m === 'up'); at = 0;
      d.querySelectorAll('.aq-pane').forEach((p) => { p.style.transition = 'none'; });
      paint(true);
      void d.offsetWidth;
      d.querySelectorAll('.aq-pane').forEach((p) => { p.style.transition = ''; });
    };
    const err = (m) => { if (m) warn(m); };
    /* only latin letters, digits and punctuation: no Cyrillic in the sign-in fields */
    d.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[type=text],input[type=password]') && /[Ѐ-ԯ]/.test(t.value)) { const p = t.selectionStart; t.value = t.value.replace(/[Ѐ-ԯ]/g, ''); try { t.setSelectionRange(p - 1, p - 1); } catch (x) { /* ignore */ } }
    });
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (b && b.dataset.m !== mode) setMode(b.dataset.m);
      if (e.target.closest('#aBack') && at > 0) { at--; paint(true); }
    });
    /* each step checks only its own answer */
    const check = (name, users) => {
      const nick = nickVal($('#aNick')), pass = $('#aPass').value;
      if (name === 'first') {
        if (!$('#aFirst').value.trim()) throw new Error('Enter your first name');
      } else if (name === 'last') {
        if (!$('#aLast').value.trim()) throw new Error('Enter your last name');
      } else if (name === 'nick') {
        if (mode === 'in') { if (!nick) throw new Error('Enter your nickname'); }
        else {
          if (!NICK_RX.test(nick)) throw new Error('Nickname: 2–24 letters, digits, dot, dash or underscore');
          if (users.some((x) => x.nick.toLowerCase() === nick.toLowerCase())) throw new Error('This nickname is already taken');
        }
      } else if (mode === 'in') {
        if (!pass) throw new Error('Enter your password');
      } else if (name === 'pass') {
        if (pass.length < 6) throw new Error('Password must be at least 6 characters');
      } else if (pass !== $('#aPass2').value) throw new Error('Passwords do not match');
    };
    d.addEventListener('submit', async (e) => {
      e.preventDefault();
      const users = getUsers();
      const name = steps[at];
      try { check(name, users); } catch (ex) { err(ex.message); return; }
      if (at < steps.length - 1) { at++; paint(true); return; }
      const btns = d.querySelectorAll('.qgo');
      btns.forEach((b) => { b.disabled = true; });
      const nick = nickVal($('#aNick')), pass = $('#aPass').value, rem = true; /* the sign-in is always remembered */
      try {
        if (mode === 'in') {
          const u = users.find((x) => x.nick === nick);
          if (!u || (await hashPw(pass, u.salt)) !== u.hash) throw new Error('Wrong nickname or password');
          rememberSession(u, rem);
          d.remove(); resolve(u);
          return;
        }
        const first = $('#aFirst').value.trim(), last = $('#aLast').value.trim();
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        const u = { id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), first, last, nick, preferNick: false, salt, hash: await hashPw(pass, salt), created: Date.now() };
        users.push(u); saveUsers(users);
        JUST_REGISTERED = true;
        rememberSession(u, rem);
        d.remove(); resolve(u);
      } catch (ex) {
        err(ex.message || 'Something went wrong');
        btns.forEach((b) => { b.disabled = false; });
        if (mode === 'in') { at = 1; paint(true); }
      }
    });
    document.body.appendChild(d);
    build();
    setMode('in', true);
  });
}


/* ================= profile data ================= */
const fullName = (u) => (u.first + ' ' + u.last).trim();
const initials = (u) => ((u.first || u.nick || '?')[0] + ((u.last || '')[0] || '')).toUpperCase();
function loadProf() {
  let p = {};
  try { p = JSON.parse(lsGet('jm-prof:' + S.user.id, '{}')) || {}; } catch (e) { p = {}; }
  S.prof = Object.assign({ bio: '', location: '', nextShow: '', spinning: '', shows: 0, avatar: '', following: 0, followers: 0 }, p);
  try { S.posts = JSON.parse(lsGet('jm-posts:' + S.user.id, '[]')) || []; } catch (e) { S.posts = []; }
  try { S.tour = JSON.parse(lsGet('jm-tour:' + S.user.id, '{}')) || {}; } catch (e) { S.tour = {}; }
}
const saveProf = () => lsSet('jm-prof:' + S.user.id, JSON.stringify(S.prof));
const savePosts = () => lsSet('jm-posts:' + S.user.id, JSON.stringify(S.posts));
/* every photo except the profile banner is example.jpg for now (drop your own picture into the app folder) */
const PHOTO = 'example.jpg';
const avStyle = () => ` style="background-image:url(${S.prof.avatar || PHOTO})"`;
const avInner = () => '';

function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'now';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  if (s < 86400 * 7) return Math.round(s / 86400) + 'd';
  return new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
function rich(t) {
  return esc(t).replace(/(^|[\s(])([#@][\p{L}\p{N}_]{1,40})/gu, '$1<b>$2</b>');
}

/* ================= screens ================= */
const NAV = [
  ['feed', 'fa-house', 'Feed'], ['profile', 'fa-user', 'My Profile'], ['communities', 'fa-user-group', 'Communities'],
  ['music', 'fa-compact-disc', 'Music & Bootlegs'], ['tour', 'fa-calendar', 'Tour Dates'], ['messages', 'fa-envelope', 'Messages'], ['bookmarks', 'fa-bookmark', 'Bookmarks'],
];
function renderNav() {
  $('#jNav').innerHTML = NAV.map(([id, ic, lab]) => `<button data-nav="${id}" class="${id === 'profile' ? 'on' : ''}" title="${esc(lab)}"><i class="fa-solid ${ic}"></i><span>${esc(lab)}</span>${id === 'tour' ? '<em class="dot"></em>' : ''}</button>`).join('');
}
function renderMe() {
  $('#jMe').innerHTML = `<div class="av sm"${avStyle()}>${avInner()}</div><div class="nm"><b>${esc(fullName(S.user))}</b><span>@${esc(S.user.nick)}</span></div><i class="fa-solid fa-ellipsis"></i>`;
}
function bannerSvg() {
  const r = [30, 60, 90, 120, 150, 180].map((x) => `<circle cx="200" cy="200" r="${x}" fill="none" stroke="rgba(255,255,255,${(0.28 - x / 1000).toFixed(2)})" stroke-width="1.4"/>`).join('');
  return `<svg viewBox="0 0 400 400" aria-hidden="true">${r}</svg>`;
}
function bootlegCount() { return S.posts.filter((p) => p.track).length; }
function renderProfile() {
  const u = S.user, p = S.prof;
  const joined = new Date(u.created || Date.now()).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  const posts = S.posts.filter((x) => matches(x));
  $('#jMain').innerHTML = `
    <div class="p-head"><div><b>${esc(fullName(u))}</b><small id="hSub">${S.posts.length} Posts · ${+p.shows || 0} Shows Attended</small></div><button class="pill" id="shareBtn">Share Profile</button></div>
    <div class="banner">${bannerSvg()}</div>
    <div class="p-wrap">
      <div class="p-top">
        <div class="av xl"${avStyle()}>${avInner()}</div>
        <div class="p-act"><button class="pill" id="editBtn">Edit Profile</button></div>
        <div class="p-name"><h2>${esc(fullName(u))}</h2><span class="badge">Member</span></div>
        <div class="p-nick">@${esc(u.nick)}</div>
        ${p.bio ? `<p class="p-bio">${rich(p.bio)}</p>` : ''}
        <div class="p-meta">${p.location ? `<span><i class="fa-solid fa-location-dot"></i>${esc(p.location)}</span>` : ''}${p.nextShow ? `<span><i class="fa-solid fa-ticket"></i>Next Show: ${esc(p.nextShow)}</span>` : ''}<span><i class="fa-regular fa-calendar"></i>Joined ${esc(joined)}</span></div>
      </div>
      <div class="stats"><div><b>${+p.followers || 0}</b><span>Followers</span></div><div><b>${+p.following || 0}</b><span>Following</span></div><div><b>${bootlegCount()}</b><span>Bootlegs</span></div><div><b>${+p.shows || 0}</b><span>Concerts</span></div></div>
    </div>
    <div class="comp" id="comp">
      <div class="av sm"${avStyle()}>${avInner()}</div>
      <div class="cbody">
        <textarea id="cText" rows="1" maxlength="400" placeholder="What's spinning or happening on tour, ${esc(u.first || u.nick)}?"></textarea>
        <div class="att" id="att"></div>
        <div class="bar">
          <button class="tool" data-att="track"><i class="fa-solid fa-music"></i>Track</button>
          <button class="tool" data-att="photo"><i class="fa-regular fa-image"></i>Photo</button>
          <button class="tool" data-att="setlist"><i class="fa-solid fa-list-ol"></i>Setlist</button>
          <span class="cnt" id="cCnt">280</span>
          <button class="pill solid" id="postBtn" disabled>Post</button>
        </div>
      </div>
    </div>
    <div id="postList">${posts.map(postHtml).join('')}</div>
    <input type="file" id="photoIn" accept="image/*" hidden>`;
  renderAtt();
}
function matches(x) {
  const q = S.q.trim().toLowerCase();
  if (!q) return true;
  return [x.text, x.track && x.track.title, x.track && x.track.sub, x.setlist && x.setlist.title, x.setlist && x.setlist.tracks.join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q);
}
function postHtml(x) {
  const u = S.user;
  const trk = x.track ? `<div class="trk"><span class="pl"><i class="fa-solid fa-play"></i></span><div class="ti"><b>${esc(x.track.title)}</b><span>${esc(x.track.sub || 'Track')}</span></div></div>` : '';
  const sl = x.setlist ? `<div class="setl"><div class="sh"><span style="font-weight:700;color:var(--text);letter-spacing:.08em;text-transform:uppercase"><i class="fa-solid fa-list-ol" style="margin-right:8px"></i>${esc(x.setlist.title || 'Setlist')}</span><span>${x.setlist.tracks.length} Tracks</span></div>${x.setlist.tracks.map((t, i) => `<div class="sr1">${String(i + 1).padStart(2, '0')}. ${esc(t)}</div>`).join('')}</div>` : '';
  const ph = x.photo ? `<img class="pimg" src="${x.photo}" alt="">` : '';
  return `<article class="post" data-id="${x.id}">
    <div class="av"${avStyle()}>${avInner()}</div>
    <div class="pb">
      <div class="ph1"><b>${esc(fullName(u))}</b><span class="m">@${esc(u.nick)} · ${ago(x.t)}</span><span class="tag">${esc(x.tag || 'Public')}</span><button class="more" data-more aria-label="More"><i class="fa-solid fa-ellipsis"></i></button></div>
      ${x.text ? `<p class="tx">${rich(x.text)}</p>` : ''}${trk}${sl}${ph}
      <div class="acts">
        <button data-act="reply"><i class="fa-regular fa-comment"></i>${x.replies || ''}</button>
        <button data-act="repost" class="${x.reposted ? 'on' : ''}"><i class="fa-solid fa-retweet"></i>${(x.reposts || 0) || ''}</button>
        <button data-act="like" class="${x.liked ? 'on' : ''}"><i class="${x.liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>${(x.likes || 0) || ''}</button>
        <button data-act="mark" class="${x.marked ? 'on' : ''}"><i class="${x.marked ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i></button>
      </div>
    </div></article>`;
}
function refreshPosts() {
  const posts = S.posts.filter(matches);
  $('#postList').innerHTML = posts.map(postHtml).join('');
  const sub = $('#hSub'); if (sub) sub.textContent = S.posts.length + ' Posts · ' + (+S.prof.shows || 0) + ' Shows Attended';
  const st = $('.stats'); if (st) st.children[2].firstElementChild.textContent = bootlegCount();
  renderRight();
}

/* ---- composer ---- */
function renderAtt() {
  const a = S.att, box = $('#att');
  if (!box) return;
  document.querySelectorAll('[data-att]').forEach((b) => b.classList.toggle('on', !!a && a.kind === b.dataset.att));
  if (!a) { box.innerHTML = ''; return upd(); }
  if (a.kind === 'track') box.innerHTML = `<div class="f"><input id="aTitle" type="text" maxlength="80" placeholder="Track title" value="${esc(a.title || '')}"><input id="aSub" type="text" maxlength="80" placeholder="Details (venue, recording, length)" value="${esc(a.sub || '')}"><button class="x" data-attx aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></div>`;
  else if (a.kind === 'setlist') box.innerHTML = `<div class="f col"><div style="display:flex;gap:8px"><input id="aTitle" type="text" maxlength="60" placeholder="Setlist title" value="${esc(a.title || '')}"><button class="x" data-attx aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></div><textarea id="aList" placeholder="One song per line">${esc(a.list || '')}</textarea></div>`;
  else if (a.kind === 'photo') box.innerHTML = `<div class="ph"><img src="${a.data}" alt=""><button class="x" data-attx aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></div>`;
  upd();
}
function upd() {
  const t = $('#cText'); if (!t) return;
  const left = 280 - t.value.length;
  const c = $('#cCnt'); c.textContent = left; c.classList.toggle('over', left < 0);
  const a = S.att;
  const attOk = !!a && ((a.kind === 'track' && (a.title || '').trim()) || (a.kind === 'setlist' && (a.list || '').trim()) || a.kind === 'photo');
  $('#postBtn').disabled = left < 0 || !(t.value.trim() || attOk);
  t.style.height = 'auto'; t.style.height = Math.min(260, t.scrollHeight) + 'px';
}
function readPhoto(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1000 / Math.max(im.width, im.height));
        const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = () => rej(new Error('This image cannot be opened'));
      im.src = fr.result;
    };
    fr.onerror = () => rej(new Error('Could not read the file'));
    fr.readAsDataURL(file);
  });
}
function submitPost() {
  const t = $('#cText'), a = S.att;
  const post = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: Date.now(), text: t.value.trim(), tag: 'Public', likes: 0, reposts: 0, replies: 0 };
  if (a && a.kind === 'track' && (a.title || '').trim()) post.track = { title: a.title.trim(), sub: (a.sub || '').trim() };
  if (a && a.kind === 'setlist' && (a.list || '').trim()) { const tr = a.list.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 40); post.setlist = { title: (a.title || '').trim() || 'Setlist', tracks: tr }; }
  if (a && a.kind === 'photo') post.photo = a.data;
  S.posts.unshift(post); savePosts();
  S.att = null; t.value = '';
  renderAtt(); refreshPosts();
}

/* ---- right column ---- */
const TOUR = [
  ['nov29', 'Nov 29 · Paris, FR', 'Le Zénith Paris - La Villette', 412], ['dec02', 'Dec 02 · London, UK', 'Alexandra Palace', 890], ['dec05', 'Dec 05 · Berlin, DE', 'Velodrom', 305],
];
function trending() {
  const m = {};
  S.posts.forEach((p) => (p.text || '').replace(/#[\p{L}\p{N}_]{1,40}/gu, (h) => { m[h] = (m[h] || 0) + 1; }));
  const mine = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([h, n]) => ['Your posts', h, n + (n === 1 ? ' post' : ' posts')]);
  const demo = [['Tour Discussion · Trending', '#Tour2026', '2,840 posts'], ['Gear & Pedals', '#AnalogSynth', '915 posts'], ['Collectors', '#BSideVinyl', '640 posts']];
  return mine.concat(demo).slice(0, 4);
}
function renderRight() {
  const r = $('#jRight');
  if (!r) return;
  const hadFocus = document.activeElement && document.activeElement.id === 'jq';
  const v = $('#jq') ? $('#jq').value : S.q;
  r.innerHTML = `
    <div class="j-search"><label><i class="fa-solid fa-magnifying-glass"></i><input id="jq" type="text" placeholder="Search your posts, tracks, setlists…" value="${esc(v)}" autocomplete="off"></label></div>
    <div class="card rad"><div class="rl">Community Radio / Bootleg</div>
      <div class="rr"><div class="cv"><i class="fa-solid fa-compact-disc"></i></div><div><b>Let It Happen (Live)</b><span>Demo track · Soundboard</span></div></div>
      <div class="sk"><i id="rkBar"></i></div><div class="tm"><span id="rkT">02:41</span><span>07:46</span></div>
      <div class="ct"><button aria-label="Previous"><i class="fa-solid fa-backward-step"></i></button><button class="pp" id="rkPlay" aria-label="Play"><i class="fa-solid ${S.radio ? 'fa-pause' : 'fa-play'}"></i></button><button aria-label="Next"><i class="fa-solid fa-forward-step"></i></button></div></div>
    <div class="card tour"><h4>2026 European Leg<span>Live</span></h4>${TOUR.map(([id, d, v, n]) => `<div class="tr"><div><small>${esc(d)}</small><b>${esc(v)}</b><span>${n + (S.tour[id] ? 1 : 0)} members attending</span></div><button class="pill ${S.tour[id] ? 'solid' : ''}" data-rsvp="${id}">${S.tour[id] ? 'Going' : 'RSVP'}</button></div>`).join('')}</div>
    <div class="card trend"><h4>Trending in Fanbase</h4>${trending().map(([c, h, n]) => `<div class="tt"><div><small>${esc(c)}</small><b>${esc(h)}</b><span>${esc(n)}</span></div><i class="fa-solid fa-arrow-trend-up"></i></div>`).join('')}</div>`;
  if (hadFocus) { const q = $('#jq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
let radioT = 0, radioPos = 161;
function radioTick() {
  clearInterval(radioT);
  if (!S.radio) return;
  radioT = setInterval(() => {
    radioPos = (radioPos + 1) % 466;
    const b = $('#rkBar'), t = $('#rkT');
    if (!b) return;
    b.style.width = (radioPos / 466 * 100) + '%';
    t.textContent = String(Math.floor(radioPos / 60)).padStart(2, '0') + ':' + String(radioPos % 60).padStart(2, '0');
  }, 1000);
}

/* ---- dialogs ---- */
function modal(html, onMount) {
  const m = document.createElement('div'); m.className = 'jmodal'; m.id = 'jmodal';
  m.innerHTML = `<div class="box" role="dialog">${html}</div>`;
  m.addEventListener('mousedown', (e) => { if (e.target === m) m.remove(); });
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', k); } });
  document.body.appendChild(m);
  if (onMount) onMount(m);
  return m;
}
function editProfile() {
  const p = S.prof;
  let av = p.avatar;
  const m = modal(`<h3>Edit Profile</h3>
    <div class="erow"><div class="av xl" id="eAv" title="Photo"></div><label class="grow">Bio<textarea id="eBio" rows="5" maxlength="200">${esc(p.bio)}</textarea></label></div>
    <label>City<input id="eLoc" type="text" maxlength="60" value="${esc(p.location)}" placeholder="City, Country"></label>
    <input type="file" id="eFile" accept="image/*" hidden>
    <div class="row"><button class="pill" id="eCancel">Cancel</button><button class="pill solid" id="eSave">Save</button></div>`, (m) => {
    const setAv = () => { $('#eAv', m).style.backgroundImage = `url(${av || PHOTO})`; };
    setAv();
    /* the photo itself is the control: a left or a right click opens the same small menu */
    const photoMenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      const rows = [{ label: 'Change Photo', run: () => $('#eFile', m).click() }];
      if (av) rows.push({ label: 'Remove Photo', danger: true, run: () => { av = ''; setAv(); } });
      openCtx(e.clientX, e.clientY, rows);
    };
    $('#eAv', m).addEventListener('click', photoMenu);
    $('#eAv', m).addEventListener('contextmenu', photoMenu);
    $('#eFile', m).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { av = await readPhotoSquare(f); setAv(); } catch (x) { warn(x.message); }
    };
    $('#eCancel', m).onclick = () => m.remove();
    $('#eSave', m).onclick = () => {
      Object.assign(S.prof, { avatar: av, bio: $('#eBio', m).value.trim(), location: $('#eLoc', m).value.trim() });
      saveProf(); m.remove(); renderProfile(); renderMe(); renderRight();
    };
  });
  return m;
}
function readPhotoSquare(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(im.width, im.height), c = document.createElement('canvas'); c.width = c.height = 256;
        c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 256, 256);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = () => rej(new Error('This image cannot be opened'));
      im.src = fr.result;
    };
    fr.onerror = () => rej(new Error('Could not read the file'));
    fr.readAsDataURL(file);
  });
}
function meMenu() {
  const r = $('#jMe').getBoundingClientRect();
  const dark = document.documentElement.dataset.theme === 'dark';
  openCtx(r.left, r.top - 4, [
    { label: 'Toggle theme', icon: 'fa-circle-half-stroke', run: () => { lsSet('jm-theme-manual', dark ? 'light' : 'dark'); applyTheme(); } },
    { label: 'Sign out @' + S.user.nick, icon: 'fa-right-from-bracket', danger: true, run: signOut },
  ], true);
}
async function signOut() {
  try { localStorage.removeItem('jm-session'); sessionStorage.removeItem('jm-session'); } catch (e) { /* ignore */ }
  $('#jm').hidden = true; ldOn('Signing out'); await sleep(1000); location.reload();
}


/* ---- the themed context menu (the same one as in Impala) ---- */
function closeCtx() { const c = $('#ctx'); if (c) c.remove(); }
function openCtx(x, y, rows, above) {
  closeCtx();
  const m = document.createElement('div');
  m.id = 'ctx'; m.className = 'ctx'; m.setAttribute('role', 'menu');
  m.classList.toggle('plain', !rows.some((r) => r.icon));
  m.innerHTML = rows.map((r, i) => `<button type="button" role="menuitem" data-i="${i}" class="${r.on ? 'on' : ''}${r.danger ? ' danger' : ''}">${r.icon ? `<i class="fa-solid ${r.icon}"></i>` : ''}<span>${esc(r.label)}</span></button>`).join('');
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(above ? y - h : y, innerHeight - h - 8)) + 'px';
  m.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; closeCtx(); rows[+b.dataset.i].run(); });
  m.addEventListener('contextmenu', (e) => e.preventDefault());
}
['mousedown', 'wheel'].forEach((ev) => window.addEventListener(ev, (e) => { if (e.target.closest && e.target.closest('#ctx')) return; closeCtx(); }, true));
['blur', 'resize'].forEach((ev) => window.addEventListener(ev, closeCtx));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });
const copyText = async (t) => { try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (x) { /* ignore */ } a.remove(); } };
/* no browser menu anywhere: text gets Copy, fields get Cut / Copy / Paste / Select All */
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const t = e.target;
  const f = t.closest && t.closest('input[type=text],input[type=password],input[type=number],textarea');
  if (f) {
    f.focus();
    const sel = f.value.slice(f.selectionStart, f.selectionEnd);
    const pw = f.type === 'password', ro = f.readOnly || f.disabled;
    const rows = [];
    if (sel && !pw && !ro) rows.push({ label: 'Cut', run: async () => { await copyText(sel); f.setRangeText('', f.selectionStart, f.selectionEnd, 'end'); f.dispatchEvent(new Event('input', { bubbles: true })); } });
    if (sel && !pw) rows.push({ label: 'Copy', run: () => copyText(sel) });
    if (!ro) rows.push({ label: 'Paste', run: async () => { let c = ''; try { c = await navigator.clipboard.readText(); } catch (x) { return; } f.setRangeText(c, f.selectionStart, f.selectionEnd, 'end'); f.dispatchEvent(new Event('input', { bubbles: true })); } });
    rows.push({ label: 'Select All', run: () => f.select() });
    openCtx(e.clientX, e.clientY, rows);
    return;
  }
  const blk = t.closest && t.closest('.post .pb');
  if (blk) {
    const sel = String(window.getSelection() || '');
    const txt = sel.trim() || (blk.querySelector('.tx') ? blk.querySelector('.tx').innerText : blk.innerText);
    openCtx(e.clientX, e.clientY, [{ label: 'Copy', run: () => copyText(txt) }]);
  }
});

/* ================= events ================= */
document.addEventListener('click', async (e) => {
  const t = e.target;
  const nav = t.closest('[data-nav]');
  if (nav) { if (nav.dataset.nav !== 'profile') hint('Coming soon'); return; }
  if (t.closest('#newPost')) { const c = $('#cText'); if (c) { $('#jMain').scrollTo({ top: 0, behavior: 'smooth' }); c.focus(); } return; }
  if (t.closest('#jMe')) { meMenu(); return; }
  if (t.closest('#editBtn')) return void editProfile();
  if (t.closest('#shareBtn')) {
    const link = '@' + S.user.nick;
    try { await navigator.clipboard.writeText(link); hint('Copied ' + link); } catch (x) { hint(link); }
    return;
  }
  const at = t.closest('[data-att]');
  if (at) {
    const k = at.dataset.att;
    if (S.att && S.att.kind === k) { S.att = null; renderAtt(); return; }
    if (k === 'photo') { $('#photoIn').click(); return; }
    S.att = { kind: k }; renderAtt();
    const f = $('#aTitle'); if (f) f.focus();
    return;
  }
  if (t.closest('[data-attx]')) { S.att = null; renderAtt(); return; }
  if (t.closest('#postBtn')) { if (!$('#postBtn').disabled) submitPost(); return; }
  const mr = t.closest('[data-more]');
  if (mr) {
    const id = mr.closest('.post').dataset.id, r = mr.getBoundingClientRect();
    openCtx(r.right, r.bottom + 4, [{ label: 'Delete Post', icon: 'fa-trash', danger: true, run: () => { S.posts = S.posts.filter((x) => x.id !== id); savePosts(); refreshPosts(); } }]);
    return;
  }
  const ac = t.closest('[data-act]');
  if (ac) {
    const id = ac.closest('.post').dataset.id, x = S.posts.find((p) => p.id === id); if (!x) return;
    const a = ac.dataset.act;
    if (a === 'like') { x.liked = !x.liked; x.likes = Math.max(0, (x.likes || 0) + (x.liked ? 1 : -1)); }
    else if (a === 'repost') { x.reposted = !x.reposted; x.reposts = Math.max(0, (x.reposts || 0) + (x.reposted ? 1 : -1)); }
    else if (a === 'mark') x.marked = !x.marked;
    else { hint('Replies are coming soon'); return; }
    savePosts(); refreshPosts();
    return;
  }
  const rs = t.closest('[data-rsvp]');
  if (rs) { const id = rs.dataset.rsvp; S.tour[id] = !S.tour[id]; lsSet('jm-tour:' + S.user.id, JSON.stringify(S.tour)); renderRight(); return; }
  if (t.closest('#rkPlay')) { S.radio = !S.radio; radioTick(); renderRight(); return; }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'cText') upd();
  else if (t.id === 'aTitle' && S.att) { S.att.title = t.value; upd(); }
  else if (t.id === 'aSub' && S.att) S.att.sub = t.value;
  else if (t.id === 'aList' && S.att) { S.att.list = t.value; upd(); }
  else if (t.id === 'jq') { S.q = t.value; const pl = $('#postList'); if (pl) pl.innerHTML = S.posts.filter(matches).map(postHtml).join(''); }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'photoIn') {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { S.att = { kind: 'photo', data: await readPhoto(f) }; renderAtt(); } catch (x) { warn(x.message); }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'cText' && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !$('#postBtn').disabled) { e.preventDefault(); submitPost(); }
});

/* ================= start ================= */
async function boot() {
  const fresh = !sessionUser();
  ldOn(fresh ? 'Preparing for launch' : '');
  await sleep(fresh ? 1800 : 600);
  let user = sessionUser();
  if (!user) {
    await ldOff();
    user = await showAuth();
    ldOn(JUST_REGISTERED ? 'Data processing' : '');
    await sleep(JUST_REGISTERED ? 1900 : 700);
    JUST_REGISTERED = false;
  }
  S.user = user; loadProf();
  renderNav(); renderMe(); renderProfile(); renderRight();
  $('#jm').hidden = false;
  await ldOff();
}
boot();
