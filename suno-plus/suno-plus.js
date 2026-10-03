/* SUNODLAA for suno.com - a nicer player and library manager, as an overlay on top of suno.com.
   Runs inside YOUR suno.com tab (bookmark). Tracks are played BY SUNO'S OWN PLAYER: the overlay
   opens the song in the page and presses Play, then only uses play / pause / seek / volume. It
   never copies or downloads audio. Changes (rename, move, delete, like) use the same Suno calls
   as the site itself, with your own session. */
(function () {
  'use strict';
  var VERSION = '2.4.0';
  if (window.__sdlSkin) { window.__sdlSkin.toggle(); return; }
  // Not on suno.com: go there (click the bookmark again to open the player).
  if (!/(^|\.)suno\.com$/.test(location.hostname)) { location.href = 'https://suno.com/'; return; }

  var THEMES = /*@THEMES@*/[];

  /* ================================================================ helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  var ALL = '__all__', EXP = '__explore__';
  // Language of the computer/browser: French if it is French, English otherwise.
  var LANG = /^fr/i.test(navigator.language || '') ? 'fr' : 'en';
  var LOC = LANG === 'fr' ? 'fr-FR' : 'en-GB';
  function tr(fr, en) { return LANG === 'fr' ? fr : en; }
  function pl(n, fr1, frN, en1, enN) { return n + ' ' + (LANG === 'fr' ? (n > 1 ? frN : fr1) : (n === 1 ? en1 : enN)); }
  function fdate(iso, time) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' }) + (time ? ' ' + d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }) : ''); }
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('sdl_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('sdl_' + k, JSON.stringify(v, function (key, val) { return key === 'ws' && this && this.id && this.title !== undefined ? undefined : key === 'no' ? undefined : val; })); } catch (e) {} }
  };
  // F12 > Console, filter "SUNODLAA": every step of the overlay.
  var log = function () { try { console.log.apply(console, ['%c[SUNODLAA]', 'color:#ff4f8b;font-weight:bold'].concat([].slice.call(arguments))); } catch (e) {} };
  log('version', VERSION);

  /* ================================================================ Suno API (as the page itself) */
  var BASES = ['https://studio-api-prod.suno.com', 'https://studio-api.prod.suno.com'];
  function cookie(re) { var m = document.cookie.match(re); return m ? decodeURIComponent(m[1]) : null; }
  async function token() {
    try { if (window.Clerk && window.Clerk.session) { var t = await window.Clerk.session.getToken(); if (t) return t; } } catch (e) {}
    return cookie(/(?:^|;\s*)__session(?:_[^=]+)?=([^;]+)/);
  }
  async function headers() {
    var t = await token();
    if (!t) throw new Error(tr('Pas connecté à Suno dans cet onglet', 'Not signed in to Suno in this tab'));
    var h = { Authorization: 'Bearer ' + t, 'browser-token': btoa(JSON.stringify({ timestamp: Date.now() })) };
    var dev = cookie(/(?:^|;\s*)ajs_anonymous_id=([^;]+)/); if (dev) h['device-id'] = dev.replace(/"/g, '');
    return h;
  }
  async function call(method, path, body) {
    var h = await headers(), err;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    for (var i = 0; i < BASES.length; i++) {
      try {
        var r = await (window.__sdlRealFetch || fetch)(BASES[i] + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit' });
        var txt = await r.text(), data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
        if (method !== 'GET') log(method, path, '→ HTTP ' + r.status, String(txt || '').slice(0, 300));
        if (r.ok) { if (i) BASES.unshift(BASES.splice(i, 1)[0]); return data; }
        err = new Error((data && (data.detail || data.message)) || ('HTTP ' + r.status));
        if (r.status >= 400 && r.status < 500) break;
      } catch (e) { err = e; log(method, path, '→ network error', e.message); }
    }
    throw err;
  }
  var api = function (path) { return call('GET', path); };
  // Public pages (Explore, public playlists) also work when not signed in.
  async function callPublic(method, path, body) {
    if (await token()) return call(method, path, body);
    var r = await (window.__sdlRealFetch || fetch)(BASES[0] + path, { method: method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  }
  // The only changes the overlay makes: the ones suno.com itself offers.
  var WRITES = [/^\/api\/gen\/trash\/?$/, /^\/api\/gen\/[0-9a-f-]{36}\/set_metadata\/$/, /^\/api\/gen\/[0-9a-f-]{36}\/update_reaction_type\/$/,
    /^\/api\/project\/[0-9a-f-]{36}\/metadata$/, /^\/api\/project\/trash$/, /^\/api\/project$/, /^\/api\/project\/([0-9a-f-]{36}|default)\/clips$/];
  async function write(path, body) {
    if (!WRITES.some(function (rx) { return rx.test(path); })) throw new Error('action non autorisée: ' + path);
    log('POST', path, JSON.stringify(body));
    return call('POST', path, body);
  }

  /* ================================================================ library (cached in this browser) */
  var S = {
    ws: LS.get('ws', []), clips: LS.get('clips', {}), markers: LS.get('markers', {}),
    cur: LS.get('cur', null) || '__all__', wsQ: '', tQ: '', filter: 'all', wsSort: LS.get('wsSort', 'recent'),
    queue: [], idx: -1, shuffle: LS.get('shuffle', false), repeat: LS.get('repeat', 'off'),
    playing: null, loading: false, lyr: null, showLyr: LS.get('showLyr', false), karaoke: false,
    exp: { feeds: [], cursor: 0, done: false, loading: false }, pls: {},
    sel: {}, syncing: false, err: '', theme: LS.get('theme', 'holi'), sort: LS.get('sort', 'no')
  };
  function slim(c) { var m = c.metadata || {}; return { id: c.id, title: c.title || tr('Sans titre', 'Untitled'), at: c.created_at || '', d: m.duration || 0, tags: m.tags || '', cover: m.cover_clip_id || '', img: c.image_url || '', imgL: c.image_large_url || c.image_url || '', liked: !!c.is_liked, prompt: m.prompt || '', author: c.display_name || c.handle || '', plays: c.play_count || 0 }; }
  function originals(cs) { var o = {}; cs.forEach(function (c) { if (c.cover) o[c.cover] = 1; }); return o; }
  function ordered(cs) {   // original(s) first, then oldest -> newest: track 001, 002...
    var o = originals(cs);
    return cs.slice().sort(function (a, b) { return ((o[b.id] ? 1 : 0) - (o[a.id] ? 1 : 0)) || a.at.localeCompare(b.at); });
  }
  function wsCover(w) {
    var cs = S.clips[w.id] || []; if (!cs.length) return w.img || '';
    var o = originals(cs), byDate = cs.slice().sort(function (a, b) { return a.at.localeCompare(b.at); });
    var f = byDate.find(function (c) { return o[c.id] && c.img; }) || byDate.find(function (c) { return c.img; });
    return f ? f.img : (w.img || '');
  }
  function wsRange(w) {
    var cs = S.clips[w.id] || []; if (!cs.length) return { first: '', last: w.upd || '' };
    var f = cs[0].at, l = cs[0].at; cs.forEach(function (c) { if (c.at < f) f = c.at; if (c.at > l) l = c.at; }); return { first: f, last: l };
  }
  var numsCache = {};
  function nums(wsId) { if (!numsCache[wsId]) { var m = {}; ordered(S.clips[wsId] || []).forEach(function (c, i) { m[c.id] = i + 1; }); numsCache[wsId] = m; } return numsCache[wsId]; }
  function wsOf(id) { for (var k in S.clips) if (S.clips[k].some(function (c) { return c.id === id; })) return S.ws.find(function (w) { return w.id === k; }); return null; }
  function findClip(id) {
    var f = function (x) { return x.id === id; }, c;
    for (var k in S.clips) { c = S.clips[k].find(f); if (c) return c; }
    for (var p in S.pls) { c = (S.pls[p].clips || []).find(f); if (c) return c; }
    for (var i = 0; i < S.exp.feeds.length; i++) { c = S.exp.feeds[i].clips.find(f); if (c) return c; }
    return null;
  }
  function isMine(c) { return !!wsOf(c.id); }

  /* ---- Explore: Suno's public feeds, and any public playlist ---- */
  async function loadExplore() {
    if (S.exp.loading || S.exp.done) return; S.exp.loading = true; renderTracks();
    try {
      var d = await callPublic('POST', '/api/unified/homepage/explore', S.exp.cursor ? { cursor: S.exp.cursor } : {});
      (d.feeds || []).forEach(function (f) {
        var cs = (f.items || []).filter(function (it) { return it.content_type === 'clip' && it.content_item; }).map(function (it) { return slim(it.content_item); });
        if (cs.length) S.exp.feeds.push({ title: f.feed_title || '', pl: f.feed_container_type === 'playlist' ? f.feed_container_id : null, n: f.item_count || cs.length, clips: cs });
      });
      if (d.next_cursor == null || !(d.feeds || []).length) S.exp.done = true; else S.exp.cursor = d.next_cursor;
    } catch (e) { S.exp.done = true; toast(tr('Explorer indisponible : ', 'Explore unavailable: ') + e.message, 6000); }
    S.exp.loading = false; renderTracks();
  }
  async function loadPlaylist(id) {
    var P = S.pls[id] = S.pls[id] || { name: '', clips: [], loading: true }; renderTracks();
    try {
      var page = 1, out = [];
      while (page < 30) {
        var d = await callPublic('GET', '/api/playlist/' + id + '/?page=' + page);
        if (page === 1) { P.name = d.name || ''; P.img = d.image_url || ''; P.user = d.user_display_name || d.user_handle || ''; P.total = d.num_total_results || 0; P.desc = d.description || ''; }
        var pc = d.playlist_clips || []; pc.forEach(function (x) { if (x.clip) out.push(slim(x.clip)); });
        P.clips = out.slice(); renderTracks();
        if (!pc.length || out.length >= (P.total || 0)) break; page++;
      }
    } catch (e) { toast(tr('Playlist indisponible : ', 'Playlist unavailable: ') + e.message, 6000); }
    P.loading = false; renderTracks();
  }
  function openView(id) { S.cur = id; S.tQ = ''; S.filter = 'all'; S.limit = 400; renderWs(); renderTracks(); $('#sdl-mainin').scrollTop = 0;
    if (id === EXP && !S.exp.feeds.length) loadExplore();
    if (id.indexOf('pl:') === 0 && !S.pls[id.slice(3)]) loadPlaylist(id.slice(3)); }
  function renderExplore(el) {
    var scroll = el.scrollTop;
    el.innerHTML = '<div class="sdl-hero"><span class="ph" style="display:grid;place-items:center;font-size:72px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff">🌍</span><div style="min-width:0"><div class="meta">' + tr('Les morceaux des autres', 'Other people\'s songs') + '</div><h1>' + tr('Explorer', 'Explore') + '</h1><div class="meta">' + tr('Les sélections de Suno. Clique sur un morceau pour l\'écouter, ou « Tout voir ».', 'Suno\'s picks. Click a song to play it, or “See all”.') + '</div></div></div>' +
      S.exp.feeds.map(function (f, fi) {
        return '<div class="sdl-feed"><div class="sdl-feedh"><b>' + esc(f.title) + '</b><span class="sdl-muted"> · ' + f.n + '</span><span style="flex:1"></span>' +
          (f.pl ? '<button class="sdl-chip" data-pl="' + esc(f.pl) + '">' + tr('Tout voir', 'See all') + ' →</button>' : '') + '<button class="sdl-chip" data-feedplay="' + fi + '">▶ ' + tr('Lire', 'Play') + '</button></div>' +
          '<div class="sdl-cards">' + f.clips.map(function (c, k) {
            var on = S.playing && S.playing.id === c.id;
            return '<button class="sdl-card' + (on ? ' on' : '') + '" data-feed="' + fi + '" data-k="' + k + '"><span class="cv"><img loading="lazy" src="' + esc(c.img) + '"><i>' + (on ? (S.loading ? '⟳' : '♪') : '▶') + '</i></span><b>' + esc(c.title) + '</b><span class="sdl-muted">' + esc(c.author) + (c.plays ? ' · ▶ ' + (c.plays >= 1000 ? Math.round(c.plays / 1000) + 'k' : c.plays) : '') + '</span></button>';
          }).join('') + '</div></div>';
      }).join('') +
      '<div style="padding:16px 32px 40px;text-align:center">' + (S.exp.loading ? '<span class="sdl-spin">⟳</span>' : S.exp.done ? '' : '<button class="sdl-ghost" data-act="expmore">' + tr('Charger plus', 'Load more') + '</button>') + '</div>';
    el.scrollTop = scroll;
  }
  function renderPlaylist(el, id) {
    var P = S.pls[id] || { clips: [] }, cs = viewClips(), scroll = el.scrollTop;
    el.innerHTML = '<div class="sdl-hero">' + (P.img || (P.clips[0] && P.clips[0].img) ? '<img src="' + esc(P.img || P.clips[0].img) + '">' : '<span class="ph"></span>') +
      '<div style="min-width:0"><div class="meta"><a href="#" data-ws="' + EXP + '" style="color:inherit">🌍 ' + tr('Explorer', 'Explore') + '</a> · Playlist' + (P.user ? ' · ' + esc(P.user) : '') + '</div><h1>' + esc(P.name || '…') + '</h1><div class="meta">' + pl(P.clips.length, 'titre', 'titres', 'track', 'tracks') + (P.loading ? ' <span class="sdl-spin">⟳</span>' : '') + '</div>' +
      '<div class="sdl-acts"><button class="sdl-big" data-act="playall">▶ ' + tr('Lire', 'Play') + '</button><button class="sdl-ghost" data-act="shufall">🔀 ' + tr('Aléatoire', 'Shuffle') + '</button></div></div></div>' +
      '<div class="sdl-tools"><input class="sdl-tq" id="sdl-tq" placeholder="' + tr('Rechercher un titre, un style…', 'Search a title, a style…') + '" value="' + esc(S.tQ) + '"></div>' +
      '<div class="sdl-tracks">' + cs.map(function (c, i) {
        var on = S.playing && S.playing.id === c.id;
        return '<div class="sdl-tr' + (on ? ' on' : '') + '" data-i="' + i + '" data-id="' + c.id + '"><span></span><span class="no">' + (on ? (S.loading ? '<span class="sdl-spin">⟳</span>' : '♪') : String(i + 1).padStart(3, '0')) + '</span>' +
          (c.img ? '<img loading="lazy" src="' + esc(c.img) + '">' : '<span></span>') +
          '<span style="min-width:0"><div class="tt">' + esc(c.title) + '</div><div class="tg"><b>' + esc(c.author) + '</b> · ' + esc(c.tags) + '</div></span>' +
          '<span class="dt">' + (c.plays ? '▶ ' + c.plays.toLocaleString(LOC) : '') + '</span>' +
          '<button class="lk' + (c.liked ? '' : ' off') + '" data-like="' + c.id + '">' + (c.liked ? '♥' : '♡') + '</button><span class="du">' + fmt(c.d) + '</span>' +
          '<button class="dots" data-menu="' + c.id + '">⋯</button></div>';
      }).join('') + '</div>';
    el.scrollTop = scroll;
    var tq = $('#sdl-tq'); if (tq) tq.oninput = function () { S.tQ = tq.value; var p = tq.selectionStart; renderTracks(); var n = $('#sdl-tq'); n.focus(); n.setSelectionRange(p, p); };
  }
  function save() { numsCache = {}; LS.set('ws', S.ws); LS.set('clips', S.clips); LS.set('markers', S.markers); }

  async function sync(force) {
    if (S.syncing) return; S.syncing = true; S.err = ''; renderStatus();
    try {
      var list = [], page = 1, total = null;
      while (true) {
        var d = await api('/api/project/me?page=' + page);
        var items = d.projects || []; list = list.concat(items); total = d.num_total_results != null ? d.num_total_results : total;
        if (!items.length || (total != null && list.length >= total)) break; page++;
      }
      var ids = {};
      S.ws = list.map(function (w) { ids[w.id] = 1; return { id: w.id, name: w.name || 'Sans nom', desc: w.description || '', img: w.image_url || '', n: w.clip_count || 0, upd: (w.last_updated_clip && w.last_updated_clip.created_at) || w.updated_at || w.created_at || '', marker: JSON.stringify(w.last_updated_clip == null ? null : w.last_updated_clip) + '|' + (w.clip_count || 0) }; });
      Object.keys(S.clips).forEach(function (k) { if (!ids[k]) { delete S.clips[k]; delete S.markers[k]; } });
      if (!S.cur || (S.cur !== ALL && !ids[S.cur])) S.cur = ALL;
      renderWs(); save();
      var todo = S.ws.filter(function (w) { return force || !S.clips[w.id] || S.markers[w.id] !== w.marker; });
      todo.sort(function (a, b) { return (b.id === S.cur) - (a.id === S.cur); });
      for (var i = 0; i < todo.length; i++) {
        var w = todo[i];
        try { S.clips[w.id] = await fetchClips(w.id); S.markers[w.id] = w.marker; } catch (e) { log('workspace failed', w.name, e.message); }
        S.syncInfo = (i + 1) + '/' + todo.length; renderStatus();
        if (w.id === S.cur) renderTracks();
        if (i % 5 === 4) { renderWs(); save(); }
      }
      save(); renderWs(); renderTracks();
    } catch (e) { S.err = '' + (e.message || e); log('sync error', S.err); }
    S.syncing = false; S.syncInfo = ''; renderStatus(); log('sync done', S.ws.length, 'workspaces');
  }
  async function fetchClips(id) {
    var out = [], page = 1;
    while (true) {
      var d = await api('/api/project/' + id + '?page=' + page);
      var pc = d.project_clips || [];
      pc.forEach(function (x) { var c = x.clip; if (c && c.status === 'complete' && !c.is_trashed) out.push(slim(c)); });
      if (pc.length < 20 || page > 200) break; page++;
    }
    return out;
  }

  /* ================================================================ Suno's own player */
  function audio() { var as = document.querySelectorAll('audio'); for (var i = 0; i < as.length; i++) if (as[i].src && as[i].src.indexOf('blob:') === 0) return as[i]; return null; }
  // Suno's Play button on a song page, whatever the site language: by its label, else by its ▶ icon.
  function isPlayIcon(b) { var p = b.querySelector('svg path'); return !!p && /^M6 18\.70/.test(p.getAttribute('d') || ''); }
  function findPlay() {
    var bs = $$('button').filter(function (b) { return !root.contains(b); });
    var lab = bs.find(function (b) { return /^(play|lire|lecture|écouter|jouer|reproducir|abspielen)$/i.test((b.getAttribute('aria-label') || '').trim()); });
    if (lab) return lab;
    var icons = bs.filter(isPlayIcon);
    return icons.find(function (b) { return /variant-primary/.test(b.className); }) ||
      icons.find(function (b) { return !/playbar|barre|lecteur/i.test(b.getAttribute('aria-label') || ''); }) || null;
  }
  var playToken = 0;
  async function playIdx(i) {
    if (i < 0 || i >= S.queue.length) return;
    S.idx = i; var c = S.queue[i]; S.playing = c; var my = ++playToken;
    log('play', (i + 1) + '/' + S.queue.length, c.title, c.id);
    S.loading = true; renderPlayer(); loadLyrics(c);
    var a0 = audio(); if (a0 && !a0.paused) a0.pause();
    if (location.pathname.indexOf(c.id) < 0) {
      if (window.next && window.next.router && window.next.router.push) { log('open song page (in-app)'); window.next.router.push('/song/' + c.id); }
      else { log('window.next.router missing'); toast(tr('Suno a changé son site : impossible d\'ouvrir le titre. Regarde la console (F12).', 'Suno changed its site: cannot open the track. See the console (F12).')); S.loading = false; renderPlayer(); return; }
    }
    for (var t = 0; t < 80 && my === playToken; t++) {          // up to 40 s
      await sleep(500);
      if (location.pathname.indexOf(c.id) < 0) continue;
      var a = audio(), title = navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title;
      if (a && !a.paused && a.currentTime > 0 && (!title || norm(title).trim() === norm(c.title).trim() || t > 12)) { log('playing', '"' + title + '"'); S.loading = false; applyVolume(); renderPlayer(); return; }
      if (t % 8 === 1) {
        var b = findPlay();
        if (b) { log('click Play', JSON.stringify(b.getAttribute('aria-label'))); b.click(); }
        else log('no Play button yet; buttons:', $$('button[aria-label]').filter(function (x) { return !root.contains(x); }).map(function (x) { return x.getAttribute('aria-label'); }).slice(0, 25).join(' | '));
      }
      if (t === 20) log('still not playing; audio:', a ? { paused: a.paused, t: a.currentTime } : 'none', 'title:', title);
    }
    if (my === playToken) { log('gave up', c.id); S.loading = false; toast(tr('Suno n\'a pas lancé « ' + c.title + ' » — titre suivant', 'Suno did not start "' + c.title + '" — next track')); next(true); }
  }
  function startQueue(cs, i, shuffle) {
    var list = cs.slice(); if (!list.length) return;
    if (shuffle) { var first = list.splice(i, 1)[0]; for (var k = list.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var x = list[k]; list[k] = list[j]; list[j] = x; } list.unshift(first); i = 0; }
    S.queue = list; playIdx(i);
  }
  function next(auto) {
    if (!S.queue.length) return;
    if (auto && S.repeat === 'one') return playIdx(S.idx);
    var n = S.idx + 1;
    if (n >= S.queue.length) { if (S.repeat === 'all') n = 0; else { renderPlayer(); return; } }
    playIdx(n);
  }
  function prev() { var a = audio(); if (a && a.currentTime > 4) { a.currentTime = 0; return; } if (S.idx > 0) playIdx(S.idx - 1); }
  function toggle() { var a = audio(); if (!a || !S.playing) { if (S.queue.length) playIdx(Math.max(0, S.idx)); else startQueue(viewClips(), 0, S.shuffle); return; } if (a.paused) a.play(); else a.pause(); }
  function applyVolume() { var a = audio(), v = LS.get('vol', null); if (a && v != null) a.volume = v / 100; }
  document.addEventListener('ended', function (e) { if (e.target === audio() && S.playing && location.pathname.indexOf(S.playing.id) >= 0) next(true); }, true);
  ['play', 'pause', 'playing'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.target === audio()) renderPlayer(); }, true); });
  document.addEventListener('timeupdate', function (e) { if (e.target === audio()) tick(); }, true);

  /* ================================================================ lyrics + karaoke */
  async function loadLyrics(c) {
    S.lyr = { loading: true }; renderLyrics();
    try {
      var d = await api('/api/gen/' + c.id + '/aligned_lyrics/v2/'); if (S.playing !== c) return;
      var lines = buildLines(d);
      S.lyr = lines.some(function (l) { return !l.sec; }) ? { lines: lines } : { text: c.prompt };
    } catch (e) { S.lyr = { text: c.prompt }; }
    renderLyrics();
  }
  function buildLines(d) {
    var words = d.aligned_words || [], lines = [], cur = null;
    function push() { if (cur && cur.words.length) { cur.t = cur.words.map(function (x) { return x.w; }).join('').trim(); if (cur.t) lines.push(cur); } cur = null; }
    if (words.length) {
      words.forEach(function (w) {
        var parts = String(w.word || '').split('\n'), s = +w.start_s || 0, e = +w.end_s || s;
        parts.forEach(function (part, i) { if (i > 0) push(); if (part.trim()) { if (!cur) cur = { words: [], s: s }; cur.words.push({ w: part, s: s, e: e }); } else if (part && cur) cur.words.push({ w: part, s: s, e: e }); });
      });
      push();
    } else (d.aligned_lyrics || []).forEach(function (l) { var t = String(l.text || '').trim(); if (t) lines.push({ t: t, s: +l.start_s || 0, words: null }); });
    lines.forEach(function (l) { l.sec = /^\s*\[[^\]]*\]\s*$/.test(l.t); });
    return lines;
  }
  var lyrCur = -1, follow = true, followUntil = 0;
  function renderLyrics() {
    var el = $('#sdl-lyr-body'); if (!el) return; var L = S.lyr; lyrCur = -1; follow = true; $('#sdl-follow').hidden = true;
    if (!L || L.loading) { el.innerHTML = '<div class="sdl-muted">…</div>'; return; }
    if (L.lines) el.innerHTML = L.lines.map(function (l, i) {
      return l.sec ? '<div class="sdl-ly sec" data-i="' + i + '">' + esc(l.t.replace(/[\[\]]/g, '')) + '</div>'
        : '<div class="sdl-ly" data-i="' + i + '">' + (l.words ? l.words.map(function (w, j) { return '<span class="w" data-j="' + j + '">' + esc(w.w) + '</span>'; }).join('') : esc(l.t)) + '</div>';
    }).join('');
    else el.innerHTML = L.text ? '<div class="sdl-ly static">' + esc(L.text).replace(/\n/g, '<br>') + '</div>' : '<div class="sdl-muted">' + tr('Pas de paroles', 'No lyrics') + '</div>';
    var a = audio(); if (a) lyrTick(a.currentTime);
  }
  function lyrTick(t) {
    var L = S.lyr, el = $('#sdl-lyr-body'); if (!L || !L.lines || !el || !(S.showLyr || S.karaoke)) return;
    var k = -1; for (var i = 0; i < L.lines.length; i++) { if (t >= L.lines[i].s - 0.12) k = i; else break; }
    if (k !== lyrCur) {
      $$('.sdl-ly', el).forEach(function (n, i) { n.classList.toggle('past', i < k); n.classList.toggle('on', i === k); if (i !== k) $$('.w', n).forEach(function (w) { w.classList.toggle('sung', i < k); }); });
      lyrCur = k; var n = $('.sdl-ly.on', el);
      if (n && follow) { followUntil = Date.now() + 900; el.scrollTo({ top: n.offsetTop - el.clientHeight / 2 + n.clientHeight / 2, behavior: 'smooth' }); }
    }
    var line = L.lines[k], ln = $('.sdl-ly.on', el);
    if (line && line.words && ln) $$('.w', ln).forEach(function (w) { var wd = line.words[+w.dataset.j]; w.classList.toggle('sung', !!wd && t >= wd.s - 0.05); });
  }

  /* ================================================================ title cleaning (same rules as before) */
  function cleanTitle(t0) {
    var s = (t0 || '');
    s = s.replace(/^\s*\[temp\]\s*-\s*/i, '');
    s = s.replace(/^\s*\d{1,2}-\d{2,3}\s*(?:-\s*)?(?=\S)/, '');
    s = s.replace(/(^|[_\s-])(?:dur[ée]e|duration)?[_\s-]?\d{1,2}m\d{1,2}s(?=[_\s-]|\(|$)/gi, ' ');
    s = s.replace(/(^|[_\s-])x\d+(?:[.,]\d+)?(?=[_\s-]|\(|$)/gi, ' ');
    s = s.replace(/\s*\((?:edit|edited|clean|temp)\)/gi, '');
    s = s.replace(/^[\s_]*\d{1,2}-\d{2,3}\s*(?:-\s*)?(?=\S)/, '');
    s = s.replace(/(\s(?:x|&|-|\+|vs\.?)\s+)\d{2}-\d{3}\s+(?=\S)/gi, '$1');
    s = s.replace(/_+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, '').trim();
    return s || (t0 || '');
  }

  /* ================================================================ themes */
  function hexA(h, a) { var n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function applyTheme(id) {
    var th = THEMES.find(function (t) { return t.id === id; }) || THEMES[0]; if (!th) return;
    S.theme = th.id; LS.set('theme', th.id);
    var v = { bg: th.bg, panel: th.panel, panel2: th.panel2, line: th.line, txt: th.txt, mut: th.mut, acc: th.acc, acc2: th.acc2, acc3: th.acc3, gold: th.gold };
    for (var k in v) root.style.setProperty('--' + k, v[k]);
    var pos = ['8% 6%', '92% 12%', '78% 92%', '14% 88%', '50% 50%'], al = th.dark ? 0.22 : 0.28;
    root.style.setProperty('--deco', th.deco.map(function (c, i) { return 'radial-gradient(circle at ' + pos[i % pos.length] + ',' + hexA(c, al) + ',transparent 42%)'; }).join(',') + ',' + th.bg);
    root.style.setProperty('--glass', th.dark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.72)');
    root.style.setProperty('--shadow', th.dark ? '0 12px 40px rgba(0,0,0,.5)' : '0 12px 34px ' + hexA(th.acc, 0.18));
    root.classList.toggle('dark', !!th.dark);
    var tb = $('#sdl-themes'); if (tb) renderThemes();
  }

  /* ================================================================ UI skeleton */
  var root = document.createElement('div'); root.id = 'sdl-root';
  root.innerHTML =
    '<style>' +
    '#sdl-root{position:fixed;inset:0;z-index:2147483000;background:var(--deco);color:var(--txt);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:grid;grid-template-columns:300px 1fr;grid-template-rows:1fr auto;}' +
    '#sdl-root.hide{display:none}#sdl-root *{box-sizing:border-box}#sdl-root button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}' +
    '#sdl-root input[type=text],#sdl-root input:not([type]){font:inherit;color:var(--txt);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px 12px;outline:none}' +
    '#sdl-root input:focus{border-color:var(--acc)}' +
    '.sdl-side{grid-row:1;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;background:var(--glass);backdrop-filter:blur(14px)}' +
    '.sdl-brand{display:flex;align-items:center;gap:4px;padding:16px 12px 8px 16px;font-weight:800;font-size:18px;letter-spacing:.3px}' +
    '.sdl-brand b{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.sdl-brand .sp{flex:1}.sdl-ic{width:34px;height:34px;border-radius:50%;display:inline-grid;place-items:center;font-size:16px}.sdl-ic:hover{background:var(--panel2)}' +
    '.sdl-search{margin:6px 12px 6px;width:calc(100% - 24px)}' +
    '.sdl-wsbar{display:flex;gap:6px;padding:0 12px 8px}.sdl-chip{padding:4px 10px;border-radius:999px;font-size:12px;border:1px solid var(--line)!important;color:var(--mut)!important}.sdl-chip.on{background:var(--acc)!important;border-color:var(--acc)!important;color:#fff!important}' +
    '.sdl-wslist{overflow:auto;flex:1;padding:0 8px 12px}.sdl-ws{display:flex;gap:10px;align-items:center;padding:7px 8px;border-radius:10px;width:100%;text-align:left}' +
    '.sdl-ws:hover{background:var(--panel2)}.sdl-ws.on{background:linear-gradient(90deg,' + 'var(--panel2),transparent);box-shadow:inset 3px 0 0 var(--acc)}' +
    '.sdl-ws img,.sdl-ws .ph{width:42px;height:42px;border-radius:8px;object-fit:cover;flex:none;background:var(--panel2)}' +
    '.sdl-ws .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-ws .ct{color:var(--mut);font-size:12px}' +
    '.sdl-status{padding:8px 16px;color:var(--mut);font-size:12px;border-top:1px solid var(--line)}.sdl-status.err{color:#e5484d}' +
    '.sdl-main{grid-row:1;overflow:hidden;min-width:0;display:flex}.sdl-mainin{flex:1;min-width:0;overflow:auto}' +
    '.sdl-hero{display:flex;gap:24px;align-items:flex-end;padding:32px 32px 18px}' +
    '.sdl-hero img,.sdl-hero .ph{width:190px;height:190px;border-radius:16px;object-fit:cover;box-shadow:var(--shadow);background:var(--panel2);flex:none}' +
    '.sdl-hero h1{margin:0 0 6px;font-size:40px;line-height:1.1;font-weight:800;word-break:break-word}.sdl-hero .meta{color:var(--mut)}' +
    '.sdl-acts{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.sdl-big{padding:10px 22px;border-radius:999px;font-weight:700;background:linear-gradient(90deg,var(--acc),var(--acc2))!important;color:#fff!important;box-shadow:var(--shadow)}' +
    '.sdl-ghost{padding:9px 16px;border-radius:999px;border:1px solid var(--line)!important;font-weight:600;background:var(--panel)!important}.sdl-ghost:hover{border-color:var(--acc)!important}' +
    '.sdl-ghost.danger:hover{border-color:#e5484d!important;color:#e5484d!important}' +
    '.sdl-tools{display:flex;gap:8px;align-items:center;padding:0 32px 8px;flex-wrap:wrap}.sdl-tools .sdl-tq{flex:1;min-width:180px;max-width:360px}' +
    '.sdl-selbar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;margin:0 20px 6px;padding:8px 12px;border-radius:12px;background:var(--acc);color:#fff;box-shadow:var(--shadow)}' +
    '.sdl-selbar button{padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.2)!important;color:#fff!important;font-weight:600}.sdl-selbar .sp{flex:1}' +
    '.sdl-grp{position:sticky;top:0;z-index:1;padding:14px 12px 6px;font-weight:800;font-size:16px;color:var(--acc);background:linear-gradient(var(--bg) 70%,transparent);cursor:pointer}' +
    '.sdl-tr .dt{color:var(--mut);font-size:12px;white-space:nowrap}' +
    '.sdl-tracks{padding:4px 20px 30px}.sdl-tr{display:grid;grid-template-columns:22px 36px 44px 1fr 110px auto 52px 34px;gap:10px;align-items:center;padding:6px 10px;border-radius:10px;width:100%;text-align:left;cursor:pointer}' +
    '.sdl-tr:hover{background:var(--glass)}.sdl-tr.on{background:var(--panel2)}.sdl-tr.on .tt{color:var(--acc)}.sdl-tr.sel{background:' + 'var(--panel2)}' +
    '.sdl-tr input{width:16px;height:16px;accent-color:var(--acc);opacity:.35}.sdl-tr:hover input,.sdl-tr input:checked,.sdl-anysel .sdl-tr input{opacity:1}' +
    '.sdl-tr .no{color:var(--mut);text-align:right;font-variant-numeric:tabular-nums}.sdl-tr img{width:44px;height:44px;border-radius:6px;object-fit:cover}' +
    '.sdl-tr .tt{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-tr .tg{color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sdl-tr .du{color:var(--mut);font-variant-numeric:tabular-nums;text-align:right}.sdl-tr .lk{color:var(--acc);font-size:16px;width:28px;height:28px;border-radius:50%}.sdl-tr .lk.off{color:var(--mut);opacity:0}.sdl-tr:hover .lk.off{opacity:.7}' +
    '.sdl-tr .dots{width:30px;height:30px;border-radius:50%;opacity:0}.sdl-tr:hover .dots{opacity:1}.sdl-tr .dots:hover{background:var(--panel)}' +
    '.sdl-star{color:var(--gold)}.sdl-orig .tt{color:var(--gold)}' +
    '.sdl-lyr{width:380px;flex:none;border-left:1px solid var(--line);display:flex;flex-direction:column;background:var(--glass);backdrop-filter:blur(14px);position:relative}.sdl-lyr[hidden]{display:none}' +
    '.sdl-lyr h3{margin:0;padding:12px 10px 12px 18px;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center}' +
    '#sdl-lyr-body{overflow:auto;flex:1;padding:10px 20px 50vh}.sdl-ly{padding:6px 0;font-size:20px;font-weight:700;color:var(--mut);opacity:.55;transition:color .2s,opacity .2s;cursor:pointer}' +
    '.sdl-ly.past{opacity:.8}.sdl-ly.on{color:var(--txt);opacity:1}.sdl-ly .w.sung{color:var(--acc)}.sdl-ly.sec{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:var(--acc2);opacity:1;padding-top:16px;cursor:default}' +
    '.sdl-ly.static{font-size:15px;font-weight:400;color:var(--txt);opacity:1;cursor:default}#sdl-follow{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:var(--acc)!important;color:#fff!important;font-weight:700}' +
    '#sdl-root.kara .sdl-lyr{position:fixed;inset:0 0 86px 0;width:auto;z-index:5;border:0;background:var(--deco)}#sdl-root.kara #sdl-lyr-body{padding:20vh 10vw 50vh;text-align:center}' +
    '#sdl-root.kara .sdl-ly{font-size:38px;line-height:1.25}#sdl-root.kara .sdl-ly.sec{font-size:15px}' +
    '.sdl-kbg{display:none}#sdl-root.kara .sdl-kbg{display:block;position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(40px) saturate(1.3);opacity:.35;pointer-events:none}' +
    '.sdl-muted{color:var(--mut)}' +
    '.sdl-feed{padding:6px 32px 10px}.sdl-feedh{display:flex;align-items:center;gap:6px;margin:8px 0}.sdl-feedh b{font-size:20px}' +
    '.sdl-cards{display:grid;grid-auto-flow:column;grid-auto-columns:168px;gap:14px;overflow-x:auto;padding:4px 2px 12px;scroll-snap-type:x mandatory}' +
    '.sdl-card{display:flex;flex-direction:column;gap:4px;text-align:left;scroll-snap-align:start;padding:8px!important;border-radius:14px}.sdl-card:hover,.sdl-card.on{background:var(--glass)!important}' +
    '.sdl-card .cv{position:relative;display:block}.sdl-card img{width:152px;height:152px;border-radius:12px;object-fit:cover;box-shadow:var(--shadow);display:block}' +
    '.sdl-card i{position:absolute;right:8px;bottom:8px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-style:normal;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));opacity:0;transition:opacity .2s}' +
    '.sdl-card:hover i,.sdl-card.on i{opacity:1}.sdl-card b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-card .sdl-muted{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sdl-bar{grid-column:1/3;display:grid;grid-template-columns:minmax(200px,1fr) minmax(320px,2fr) minmax(200px,1fr);gap:16px;align-items:center;padding:10px 18px;background:var(--panel);border-top:1px solid var(--line);position:relative;z-index:6}' +
    '.sdl-now{display:flex;gap:12px;align-items:center;min-width:0;cursor:pointer}.sdl-now img{width:56px;height:56px;border-radius:8px;object-fit:cover;background:var(--panel2)}' +
    '.sdl-now .t{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-now .s{color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sdl-ctl{display:flex;flex-direction:column;gap:6px;align-items:center}.sdl-btns{display:flex;gap:14px;align-items:center}' +
    '.sdl-play{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--acc2))!important;color:#fff!important;font-size:18px;display:grid;place-items:center;box-shadow:var(--shadow)}' +
    '.sdl-tog{opacity:.55}.sdl-tog.on{opacity:1;color:var(--acc)}.sdl-prog{display:flex;gap:10px;align-items:center;width:100%;font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}' +
    '.sdl-prog input,.sdl-vol input{flex:1;accent-color:var(--acc)}.sdl-right{display:flex;gap:8px;justify-content:flex-end;align-items:center}.sdl-vol{display:flex;align-items:center;gap:6px;width:150px}' +
    '.sdl-toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--txt);color:var(--bg);padding:10px 16px;border-radius:10px;font-weight:600;z-index:2147483002;max-width:80vw}' +
    '.sdl-spin{display:inline-block;animation:sdlspin 1s linear infinite}@keyframes sdlspin{to{transform:rotate(360deg)}}' +
    '.sdl-menu{position:fixed;z-index:2147483003;min-width:220px;padding:6px;border-radius:12px;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow)}' +
    '.sdl-menu button{display:block;width:100%;text-align:left;padding:9px 12px;border-radius:8px}.sdl-menu button:hover{background:var(--panel2)}.sdl-menu .danger{color:#e5484d}' +
    '.sdl-modal{position:fixed;inset:0;z-index:2147483002;display:grid;place-items:center;background:rgba(0,0,0,.35)}' +
    '.sdl-mbox{width:min(640px,92vw);max-height:86vh;display:flex;flex-direction:column;background:var(--panel);color:var(--txt);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.35);padding:22px}' +
    '.sdl-mbox h2{margin:0 0 10px;font-size:20px}.sdl-mbody{overflow:auto;flex:1}.sdl-mbtns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}' +
    '.sdl-mbtns button{padding:9px 18px;border-radius:999px;border:1px solid var(--line)!important;font-weight:600}.sdl-mbtns .primary{background:var(--acc)!important;border-color:var(--acc)!important;color:#fff!important}.sdl-mbtns .danger{background:#e5484d!important;border-color:#e5484d!important;color:#fff!important}' +
    '.sdl-row{display:flex;gap:10px;align-items:center;padding:6px 4px;border-bottom:1px solid var(--line)}.sdl-row .from{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-row input[type=text]{width:100%;margin-top:3px}' +
    '.sdl-row.done{opacity:.6}.sdl-row.fail{background:rgba(229,72,77,.08)}.sdl-pbar{height:6px;border-radius:3px;background:var(--panel2);overflow:hidden;margin:6px 0}.sdl-pbar i{display:block;height:100%;background:var(--acc);width:0;transition:width .3s}' +
    '.sdl-themes{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:6px}.sdl-th{display:flex;gap:8px;align-items:center;padding:8px;border-radius:10px;border:2px solid transparent!important;text-align:left}' +
    '.sdl-th.on{border-color:var(--acc)!important}.sdl-th .sw{width:34px;height:34px;border-radius:8px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}' +
    '#sdl-fab{position:fixed;right:18px;bottom:96px;z-index:2147483001;padding:10px 14px;border-radius:999px;border:0;font:700 13px system-ui;color:#fff;cursor:pointer;background:linear-gradient(90deg,#E81E8C,#F57C00);box-shadow:0 6px 20px rgba(0,0,0,.3)}' +
    '</style>' +
    '<aside class="sdl-side"><div class="sdl-brand"><b>SUNODLAA</b><span class="sp"></span>' +
    '<button class="sdl-ic" id="sdl-spy" title="' + tr("Mouchard : enregistrer ce que fait suno.com", "Spy: record what suno.com does") + '">🕵</button><button class="sdl-ic" id="sdl-theme" title="' + tr("Thème", "Theme") + '">🎨</button><button class="sdl-ic" id="sdl-sync" title="' + tr("Actualiser depuis Suno", "Refresh from Suno") + '">⟳</button><button class="sdl-ic" id="sdl-hide" title="' + tr("Fermer (Échap) : revenir à la page Suno", "Close (Esc): back to the Suno page") + '">✕</button></div>' +
    '<input class="sdl-search" id="sdl-wsq" placeholder="' + tr("Rechercher un espace de travail…", "Search a workspace…") + '">' +
    '<div class="sdl-wsbar"><button class="sdl-chip" data-act="newws" title="' + tr('Nouvel espace de travail', 'New workspace') + '">＋</button><button class="sdl-chip" data-wsort="recent">' + tr("Récents", "Recent") + '</button><button class="sdl-chip" data-wsort="az">A → Z</button><button class="sdl-chip" data-wsort="size">' + tr("Taille", "Size") + '</button></div>' +
    '<div class="sdl-wslist" id="sdl-wslist"></div><div class="sdl-status" id="sdl-status"></div></aside>' +
    '<main class="sdl-main"><div class="sdl-mainin" id="sdl-mainin"></div>' +
    '<section class="sdl-lyr" id="sdl-lyr" hidden><div class="sdl-kbg" id="sdl-kbg"></div><h3><span style="flex:1">' + tr("Paroles", "Lyrics") + '</span><button class="sdl-ic" id="sdl-kara" title="' + tr("Karaoké plein écran", "Full-screen karaoke") + '">⤢</button></h3><div id="sdl-lyr-body"></div><button id="sdl-follow" hidden>⤓ ' + tr("Suivre les paroles", "Follow the lyrics") + '</button></section></main>' +
    '<footer class="sdl-bar"><div class="sdl-now" id="sdl-now" title="' + tr("Aller à l\'espace de travail", "Go to the workspace") + '"></div>' +
    '<div class="sdl-ctl"><div class="sdl-btns"><button class="sdl-ic sdl-tog" id="sdl-shuf" title="' + tr("Aléatoire", "Shuffle") + '">🔀</button><button class="sdl-ic" id="sdl-prev" title="' + tr("Précédent", "Previous") + '">⏮</button>' +
    '<button class="sdl-play" id="sdl-pp">▶</button><button class="sdl-ic" id="sdl-next" title="' + tr("Suivant", "Next") + '">⏭</button><button class="sdl-ic sdl-tog" id="sdl-rep" title="' + tr("Répéter", "Repeat") + '">🔁</button></div>' +
    '<div class="sdl-prog"><span id="sdl-t">0:00</span><input type="range" id="sdl-seek" min="0" max="1000" value="0"><span id="sdl-d">0:00</span></div></div>' +
    '<div class="sdl-right"><button class="sdl-ic sdl-tog" id="sdl-lyrbtn" title="' + tr("Paroles", "Lyrics") + '">🎤</button><div class="sdl-vol">🔊<input type="range" id="sdl-vol" min="0" max="100"></div></div></footer>';
  document.documentElement.appendChild(root);
  var fab = document.createElement('button'); fab.id = 'sdl-fab'; fab.textContent = '♪ SUNODLAA'; fab.hidden = true;
  document.documentElement.appendChild(fab);

  /* ---- the SUNODLAA button, right under Suno's own logo (animated ring) ---- */
  var gst = document.createElement('style'); gst.id = 'sdl-global';
  gst.textContent = '#sdl-pill{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:1px;margin:0 16px 12px 24px;padding:9px 16px;border-radius:14px;border:0;cursor:pointer;overflow:hidden;isolation:isolate;text-align:left;width:calc(100% - 40px)}' +
    '#sdl-pill::before{content:"";position:absolute;inset:-150%;background:conic-gradient(from 0deg,#E81E8C,#FFC400,#009B8E,#3D7BFF,#8B3DFF,#E81E8C);animation:sdlrot 3s linear infinite;z-index:-2}' +
    '#sdl-pill::after{content:"";position:absolute;inset:2px;border-radius:12px;background:#111116;z-index:-1}' +
    '#sdl-pill b{font:900 14px/1.1 system-ui,sans-serif;letter-spacing:.6px;background:linear-gradient(90deg,#E81E8C,#FFC400,#3D7BFF);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '#sdl-pill span{font:600 11px/1.2 system-ui,sans-serif;color:#b9b7c8}' +
    '#sdl-pill:hover{transform:scale(1.03)}#sdl-pill{transition:transform .2s;box-shadow:0 0 18px rgba(232,30,140,.35);animation:sdlglow 2.4s ease-in-out infinite}' +
    '@keyframes sdlrot{to{transform:rotate(360deg)}}@keyframes sdlglow{50%{box-shadow:0 0 26px rgba(61,123,255,.5)}}';
  document.head.appendChild(gst);
  var pill = document.createElement('button'); pill.id = 'sdl-pill'; pill.type = 'button';
  pill.innerHTML = '<b>♪ SUNODLAA</b><span>' + tr('le lecteur qu\'ils n\'ont pas fait', 'the player they never built') + '</span>';
  pill.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleUI(); });
  function sunoLogo() {
    var as = document.querySelectorAll('a[href="/"]');
    for (var i = 0; i < as.length; i++) { var a = as[i], svg = a.querySelector('svg[viewBox="0 0 606 149"]'); if (svg && !root.contains(a)) { var r = a.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return a; } }
    return null;
  }
  function placePill() {
    var logo = sunoLogo();
    if (logo) { var box = logo.parentElement; if (pill.previousElementSibling !== box) box.insertAdjacentElement('afterend', pill); }
    else if (pill.isConnected) pill.remove();
    fab.hidden = !root.classList.contains('hide') || pill.isConnected;
  }
  setInterval(placePill, 1500);

  function show(on) { root.classList.toggle('hide', !on); closeMenu(); placePill(); }
  function toggleUI() { show(root.classList.contains('hide')); }
  var toastT; function toast(m, ms) { var t = $('.sdl-toast'); if (!t) { t = document.createElement('div'); t.className = 'sdl-toast'; root.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 4000); }

  /* ---- modal + menu ---- */
  function modal(title, body, buttons) {
    closeModal(); var m = document.createElement('div'); m.className = 'sdl-modal'; m.id = 'sdl-modal';
    m.innerHTML = '<div class="sdl-mbox"><h2>' + esc(title) + '</h2><div class="sdl-mbody">' + body + '</div><div class="sdl-mbtns"></div></div>';
    root.appendChild(m); setButtons(buttons);
    m.addEventListener('mousedown', function (e) { if (e.target === m && !m.dataset.busy) closeModal(); });
    return m;
  }
  function setButtons(buttons) {
    var box = $('#sdl-modal .sdl-mbtns'); if (!box) return; box.innerHTML = '';
    (buttons || []).forEach(function (b) { var e = document.createElement('button'); e.textContent = b.label; if (b.cls) e.className = b.cls; e.onclick = b.onclick; box.appendChild(e); });
  }
  function closeModal() { var m = $('#sdl-modal'); if (m) m.remove(); }
  function menu(ev, items) {
    closeMenu(); var m = document.createElement('div'); m.className = 'sdl-menu'; m.id = 'sdl-menu';
    items.filter(Boolean).forEach(function (it) { var b = document.createElement('button'); b.textContent = it[0]; if (it[2]) b.className = it[2]; b.onclick = function () { closeMenu(); it[1](); }; m.appendChild(b); });
    root.appendChild(m);
    var r = ev.target.getBoundingClientRect();
    m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4)) + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  }
  function closeMenu() { var m = $('#sdl-menu'); if (m) m.remove(); }
  document.addEventListener('mousedown', function (e) { if (!e.target.closest || !e.target.closest('#sdl-menu')) closeMenu(); }, true);

  /* ================================================================ render */
  function renderStatus() {
    var el = $('#sdl-status'); el.className = 'sdl-status' + (S.err ? ' err' : '');
    var n = 0; for (var k in S.clips) n += S.clips[k].length;
    el.innerHTML = S.err ? esc(S.err) : S.syncing ? '<span class="sdl-spin">⟳</span> ' + tr('Synchro Suno… ', 'Syncing Suno… ') + esc(S.syncInfo || '') : pl(S.ws.length, 'espace', 'espaces', 'workspace', 'workspaces') + ' · ' + pl(n, 'titre', 'titres', 'track', 'tracks') + ' · v' + VERSION;
  }
  function renderWs() {
    var q = norm(S.wsQ);
    var list = S.ws.filter(function (w) { return !q || norm(w.name).indexOf(q) >= 0; });
    if (S.wsSort === 'az') list.sort(function (a, b) { return collator.compare(a.name, b.name); });
    else if (S.wsSort === 'size') list.sort(function (a, b) { return ((S.clips[b.id] || []).length || b.n) - ((S.clips[a.id] || []).length || a.n); });
    else list.sort(function (a, b) { return (wsRange(b).last || '').localeCompare(wsRange(a).last || ''); });
    var total = 0; S.ws.forEach(function (w) { total += (S.clips[w.id] || []).length; });
    $$('[data-wsort]').forEach(function (b) { b.classList.toggle('on', b.dataset.wsort === S.wsSort); });
    $('#sdl-wslist').innerHTML = '<button class="sdl-ws' + (S.cur === ALL ? ' on' : '') + '" data-ws="' + ALL + '"><span class="ph" style="display:grid;place-items:center;font-size:20px;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2))">♫</span>' +
      '<span style="min-width:0"><div class="nm">' + tr('Tous les titres', 'All tracks') + '</div><div class="ct">' + pl(total, 'titre', 'titres', 'track', 'tracks') + ' · ' + pl(S.ws.length, 'espace', 'espaces', 'workspace', 'workspaces') + '</div></span></button>' +
      '<button class="sdl-ws' + (S.cur === EXP || S.cur.indexOf('pl:') === 0 ? ' on' : '') + '" data-ws="' + EXP + '"><span class="ph" style="display:grid;place-items:center;font-size:20px;background:linear-gradient(135deg,var(--acc2),var(--acc3))">🌍</span>' +
      '<span style="min-width:0"><div class="nm">' + tr('Explorer', 'Explore') + '</div><div class="ct">' + tr('les morceaux des autres', 'other people\'s songs') + '</div></span></button>' +
      list.map(function (w) {
      var img = wsCover(w), n = (S.clips[w.id] || []).length || w.n, r = wsRange(w);
      var range = r.first ? (fdate(r.first) === fdate(r.last) ? fdate(r.first) : fdate(r.first) + ' → ' + fdate(r.last)) : '';
      return '<button class="sdl-ws' + (w.id === S.cur ? ' on' : '') + '" data-ws="' + esc(w.id) + '">' + (img ? '<img loading="lazy" src="' + esc(img) + '">' : '<span class="ph"></span>') +
        '<span style="min-width:0"><div class="nm">' + esc(w.name) + '</div><div class="ct">' + pl(n, 'titre', 'titres', 'track', 'tracks') + (range ? ' · ' + esc(range) : '') + '</div></span></button>';
    }).join('') || '<div class="sdl-muted" style="padding:12px">' + (S.syncing ? tr('Chargement…', 'Loading…') : tr('Aucun espace', 'No workspace')) + '</div>';
    renderStatus();
  }
  function curWs() { return S.ws.find(function (w) { return w.id === S.cur; }); }
  // Tracks on screen: one workspace (or all, grouped by workspace), filtered, then sorted.
  function viewClips() {
    var q = norm(S.tQ), base = [];
    if (S.cur.indexOf('pl:') === 0) {
      return ((S.pls[S.cur.slice(3)] || {}).clips || []).filter(function (c) { return !q || norm(c.title).indexOf(q) >= 0 || norm(c.tags).indexOf(q) >= 0 || norm(c.author).indexOf(q) >= 0; });
    }
    if (S.cur === EXP) return [];
    if (S.cur === ALL) {
      var wl = S.ws.slice().sort(function (a, b) { return collator.compare(a.name, b.name); });
      wl.forEach(function (w) { ordered(S.clips[w.id] || []).forEach(function (c) { c.ws = w; base.push(c); }); });
    } else { var w0 = curWs(); base = ordered(S.clips[S.cur] || []); base.forEach(function (c) { c.ws = w0; }); }
    base.forEach(function (c) { c.no = c.ws ? nums(c.ws.id)[c.id] : 0; });
    var out = base.filter(function (c) {
      if (S.filter === 'fav' && !c.liked) return false;
      return !q || norm(c.title).indexOf(q) >= 0 || norm(c.tags).indexOf(q) >= 0 || (S.cur === ALL && c.ws && norm(c.ws.name).indexOf(q) >= 0);
    });
    var by = {
      new: function (a, b) { return b.at.localeCompare(a.at); }, old: function (a, b) { return a.at.localeCompare(b.at); },
      az: function (a, b) { return collator.compare(a.title, b.title); }, long: function (a, b) { return (b.d || 0) - (a.d || 0); }
    }[S.sort];
    return by ? out.sort(by) : out;
  }
  function selList() { var out = []; for (var k in S.clips) S.clips[k].forEach(function (c) { if (S.sel[c.id]) out.push(c); }); return out; }
  function renderTracks() {
    if (S.cur === EXP) return renderExplore($('#sdl-mainin'));
    if (S.cur.indexOf('pl:') === 0) return renderPlaylist($('#sdl-mainin'), S.cur.slice(3));
    var w = S.cur === ALL ? { id: ALL, name: tr('Tous les titres', 'All tracks'), all: true } : curWs(), el = $('#sdl-mainin');
    if (!w) { el.innerHTML = '<div class="sdl-hero"><div><h1>' + tr('Tes espaces de travail', 'Your workspaces') + '</h1><div class="meta">' + (S.syncing ? tr('Chargement…', 'Loading…') : tr('Choisis un espace à gauche.', 'Pick a workspace on the left.')) + '</div></div></div>'; return; }
    var all = [];
    if (w.all) S.ws.forEach(function (x) { all = all.concat(S.clips[x.id] || []); }); else all = S.clips[S.cur] || [];
    var cs = viewClips(), o = originals(all), img = w.all ? '' : wsCover(w), tot = all.reduce(function (s, c) { return s + (c.d || 0); }, 0);
    var r = w.all ? null : wsRange(w);
    var ugly = all.filter(function (c) { return cleanTitle(c.title) !== c.title; }).length, sel = selList();
    var scroll = el.scrollTop;
    el.innerHTML = '<div class="sdl-hero">' + (img ? '<img src="' + esc(img) + '">' : '<span class="ph"></span>') +
      '<div style="min-width:0"><div class="meta">' + (w.all ? tr('Toute ta bibliothèque', 'Your whole library') : tr('Espace de travail', 'Workspace')) + '</div><h1>' + esc(w.name) + '</h1><div class="meta">' + pl(all.length, 'titre', 'titres', 'track', 'tracks') + ' · ' + Math.round(tot / 60) + ' min' +
      (r && r.first ? ' · ' + esc(fdate(r.first) === fdate(r.last) ? fdate(r.first) : tr('du ', 'from ') + fdate(r.first) + tr(' au ', ' to ') + fdate(r.last)) : '') + '</div>' +
      '<div class="sdl-acts"><button class="sdl-big" data-act="playall">▶ ' + tr("Lire", "Play") + '</button><button class="sdl-ghost" data-act="shufall">🔀 ' + tr("Aléatoire", "Shuffle") + '</button>' +
      (w.all ? '' : '<button class="sdl-ghost" data-act="wsrename">✏️ ' + tr("Renommer", "Rename") + '</button>') + (ugly ? '<button class="sdl-ghost" data-act="clean">✨ ' + tr('Nettoyer ', 'Clean ') + pl(ugly, 'titre', 'titres', 'title', 'titles') + '</button>' : '') +
      (w.all ? '' : '<button class="sdl-ghost danger" data-act="wsdelete" title="' + tr("Mettre l\'espace à la corbeille Suno", "Send the workspace to Suno's trash") + '">🗑</button>') + '</div></div></div>' +
      '<div class="sdl-tools"><input class="sdl-tq" id="sdl-tq" placeholder="' + tr("Rechercher un titre, un style…", "Search a title, a style…") + '" value="' + esc(S.tQ) + '">' +
      '<button class="sdl-chip' + (S.filter === 'all' ? ' on' : '') + '" data-filter="all">' + tr("Tous", "All") + '</button><button class="sdl-chip' + (S.filter === 'fav' ? ' on' : '') + '" data-filter="fav">♥ ' + tr("Favoris", "Favorites") + '</button>' +
      '<span class="sdl-muted" style="margin-left:8px">' + tr('Tri', 'Sort') + '</span>' + [['no', 'N°'], ['new', tr('Récents', 'Newest')], ['old', tr('Anciens', 'Oldest')], ['az', 'A → Z'], ['long', tr('Durée', 'Length')]].map(function (x) { return '<button class="sdl-chip' + (S.sort === x[0] ? ' on' : '') + '" data-sort="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
      '<button class="sdl-chip" data-act="selall" style="margin-left:auto">☑ ' + tr("Tout sélectionner", "Select all") + '</button></div>' +
      (sel.length ? '<div class="sdl-selbar"><b>' + pl(sel.length, 'sélectionné', 'sélectionnés', 'selected', 'selected') + '</b><span class="sp"></span><button data-act="bmove">📁 ' + tr("Déplacer", "Move") + '</button><button data-act="bclean">✨ ' + tr("Nettoyer les titres", "Clean titles") + '</button><button data-act="bdelete">🗑 ' + tr("Supprimer", "Delete") + '</button><button data-act="bnone">✕</button></div>' : '') +
      '<div class="sdl-tracks' + (sel.length ? ' sdl-anysel' : '') + '">' + (cs.length ? cs.slice(0, S.limit || 400).map(function (c, i) {
        var on = S.playing && S.playing.id === c.id, head = '';
        if (w.all && S.sort === 'no' && (i === 0 || cs[i - 1].ws !== c.ws)) head = '<div class="sdl-grp" data-ws="' + esc(c.ws.id) + '">' + esc(c.ws.name) + ' <span class="sdl-muted">· ' + (S.clips[c.ws.id] || []).length + '</span></div>';
        return head + '<div class="sdl-tr' + (on ? ' on' : '') + (o[c.id] ? ' sdl-orig' : '') + (S.sel[c.id] ? ' sel' : '') + '" data-i="' + i + '" data-id="' + c.id + '">' +
          '<input type="checkbox" data-selid="' + c.id + '"' + (S.sel[c.id] ? ' checked' : '') + '>' +
          '<span class="no">' + (on ? (S.loading ? '<span class="sdl-spin">⟳</span>' : '♪') : String(c.no).padStart(3, '0')) + '</span>' +
          (c.img ? '<img loading="lazy" src="' + esc(c.img) + '">' : '<span></span>') +
          '<span style="min-width:0"><div class="tt">' + (o[c.id] ? '<span class="sdl-star">★ </span>' : '') + esc(c.title) + '</div><div class="tg">' + (w.all && S.sort !== 'no' && c.ws ? '<b>' + esc(c.ws.name) + '</b> · ' : '') + esc(c.tags) + '</div></span>' +
          '<span class="dt" title="' + esc(fdate(c.at, true)) + '">' + esc(fdate(c.at)) + '</span>' +
          '<button class="lk' + (c.liked ? '' : ' off') + '" data-like="' + c.id + '" title="' + tr("Favori", "Favorite") + '">' + (c.liked ? '♥' : '♡') + '</button><span class="du">' + fmt(c.d) + '</span>' +
          '<button class="dots" data-menu="' + c.id + '" title="Actions">⋯</button></div>';
      }).join('') + (cs.length > (S.limit || 400) ? '<div style="padding:12px;text-align:center"><button class="sdl-ghost" data-act="more">' + tr('Afficher ', 'Show ') + (cs.length - (S.limit || 400)) + tr(' de plus', ' more') + '</button></div>' : '') : '<div class="sdl-muted" style="padding:20px">' + (S.syncing && !all.length ? tr('Chargement…', 'Loading…') : tr('Aucun titre', 'No track')) + '</div>') + '</div>';
    el.scrollTop = scroll;
    var tq = $('#sdl-tq'); if (tq) tq.oninput = function () { S.tQ = tq.value; var p = tq.selectionStart; renderTracks(); var n = $('#sdl-tq'); n.focus(); n.setSelectionRange(p, p); };
  }
  function renderPlayer() {
    var c = S.playing, a = audio(), w = c && wsOf(c.id);
    $('#sdl-now').innerHTML = c ? '<img src="' + esc(c.img) + '"><div style="min-width:0"><div class="t">' + esc(c.title) + '</div><div class="s">' + esc(w ? w.name : (c.author || '')) + '</div></div>' : '<div class="sdl-muted">' + tr('Rien en lecture', 'Nothing playing') + '</div>';
    $('#sdl-pp').innerHTML = S.loading ? '<span class="sdl-spin">⟳</span>' : (a && !a.paused && S.playing ? '⏸' : '▶');
    $('#sdl-shuf').classList.toggle('on', S.shuffle);
    var r = $('#sdl-rep'); r.classList.toggle('on', S.repeat !== 'off'); r.textContent = S.repeat === 'one' ? '🔂' : '🔁';
    $('#sdl-lyrbtn').classList.toggle('on', S.showLyr || S.karaoke); $('#sdl-lyr').hidden = !(S.showLyr || S.karaoke);
    root.classList.toggle('kara', S.karaoke); $('#sdl-kbg').style.backgroundImage = c ? 'url("' + (c.imgL || c.img) + '")' : '';
    var v = LS.get('vol', null); $('#sdl-vol').value = v != null ? v : (a ? Math.round(a.volume * 100) : 100);
    renderTracks(); tick();
  }
  var seeking = false;
  function tick() {
    var a = audio(); if (!a || !S.playing) return;
    var d = isFinite(a.duration) ? a.duration : (S.playing.d || 0);
    $('#sdl-t').textContent = fmt(a.currentTime); $('#sdl-d').textContent = fmt(d);
    if (!seeking && d) $('#sdl-seek').value = Math.round(1000 * a.currentTime / d);
    lyrTick(a.currentTime);
  }
  function renderThemes() {
    var box = $('#sdl-themes'); if (!box) return;
    box.innerHTML = THEMES.map(function (t) {
      return '<button class="sdl-th' + (t.id === S.theme ? ' on' : '') + '" data-sdltheme="' + t.id + '"><span class="sw" style="background:linear-gradient(135deg,' + t.acc + ',' + t.acc2 + ' 55%,' + t.bg + ' 56%)"></span><span><b>' + esc(t.name) + '</b><div class="sdl-muted" style="font-size:12px">' + (t.dark ? tr('sombre', 'dark') : tr('clair', 'light')) + '</div></span></button>';
    }).join('');
  }

  /* ================================================================ actions on Suno */
  function refreshAll() { save(); renderWs(); renderTracks(); renderPlayer(); }
  async function setTitle(c, v) { await write('/api/gen/' + c.id + '/set_metadata/', { title: v }); c.title = v; }
  function renameTrack(c) {
    var sug = cleanTitle(c.title);
    modal(tr('Renommer le titre', 'Rename the track'), '<input type="text" id="sdl-rn" style="width:100%" value="' + esc(c.title) + '">' +
      (sug !== c.title ? '<div class="sdl-muted" style="margin-top:8px;font-size:13px">' + tr('Suggestion : ', 'Suggestion: ') + '<a href="#" id="sdl-sug" style="color:var(--acc)">' + esc(sug) + '</a></div>' : ''),
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Renommer', 'Rename'), cls: 'primary', onclick: async function () {
        var v = $('#sdl-rn').value.trim(); if (!v || v === c.title) return closeModal();
        setButtons([{ label: '…' }]);
        try { await setTitle(c, v); closeModal(); refreshAll(); toast(tr('Renommé : ', 'Renamed: ') + v); }
        catch (e) { closeModal(); toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }
      } }]);
    var s = $('#sdl-sug'); if (s) s.onclick = function (e) { e.preventDefault(); $('#sdl-rn').value = sug; };
    setTimeout(function () { var i = $('#sdl-rn'); if (i) { i.focus(); i.select(); i.onkeydown = function (e) { if (e.key === 'Enter') $('#sdl-modal .primary').click(); }; } }, 30);
  }
  async function toggleLike(c) {
    var want = !c.liked;
    try { await write('/api/gen/' + c.id + '/update_reaction_type/', { reaction: want ? 'LIKE' : null }); c.liked = want; refreshAll(); }
    catch (e) { toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 6000); }
  }
  function deleteTracks(cs) {
    modal(cs.length > 1 ? tr('Supprimer ' + cs.length + ' titres ?', 'Delete ' + cs.length + ' tracks?') : tr('Supprimer « ' + cs[0].title + ' » ?', 'Delete "' + cs[0].title + '"?'),
      '<div>' + (cs.length > 1 ? tr('Ils iront dans la corbeille de Suno (récupérable sur suno.com).', 'They go to Suno\'s trash (you can restore them on suno.com).') : tr('Il ira dans la corbeille de Suno (récupérable sur suno.com).', 'It goes to Suno\'s trash (you can restore it on suno.com).')) + '</div>' +
      '<div style="margin-top:10px;max-height:240px;overflow:auto;font-size:13px">' + cs.slice(0, 80).map(function (c) { return '• ' + esc(c.title); }).join('<br>') + (cs.length > 80 ? '<br>… +' + (cs.length - 80) : '') + '</div>',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Supprimer', 'Delete'), cls: 'danger', onclick: async function () {
        setButtons([{ label: '…' }]);
        try {
          var ids = cs.map(function (c) { return c.id; });
          for (var i = 0; i < ids.length; i += 50) await write('/api/gen/trash', { clip_ids: ids.slice(i, i + 50), trash: true });
          var set = {}; ids.forEach(function (id) { set[id] = 1; delete S.sel[id]; });
          for (var k in S.clips) S.clips[k] = S.clips[k].filter(function (c) { return !set[c.id]; });
          closeModal(); refreshAll(); toast(pl(ids.length, 'titre', 'titres', 'track', 'tracks') + tr(' dans la corbeille Suno', ' in Suno\'s trash'));
        } catch (e) { closeModal(); toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }
      } }]);
  }
  function moveTracks(cs) {
    var src = {}; cs.forEach(function (c) { var w = wsOf(c.id); if (w) src[w.id] = 1; });
    var list = S.ws.slice().sort(function (a, b) { return collator.compare(a.name, b.name); });
    modal(tr('Déplacer ', 'Move ') + pl(cs.length, 'titre', 'titres', 'track', 'tracks') + tr(' vers…', ' to…'),
      '<input type="text" id="sdl-mvq" style="width:100%" placeholder="' + tr("Rechercher un espace…", "Search a workspace…") + '"><div id="sdl-mvl" style="margin-top:8px;max-height:46vh;overflow:auto">' +
      list.map(function (w) { var only = Object.keys(src).length === 1 && src[w.id]; return '<label class="sdl-row" data-n="' + esc(norm(w.name)) + '"' + (only ? ' style="opacity:.4"' : '') + '><input type="radio" name="sdl-mv" value="' + w.id + '"' + (only ? ' disabled' : '') + '><span style="flex:1">' + esc(w.name) + '</span><span class="sdl-muted">' + (S.clips[w.id] || []).length + '</span></label>'; }).join('') + '</div>',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Déplacer', 'Move'), cls: 'primary', onclick: async function () {
        var r = $('input[name=sdl-mv]:checked', root); if (!r) return toast(tr('Choisis un espace', 'Pick a workspace'));
        var target = S.ws.find(function (w) { return w.id === r.value; });
        setButtons([{ label: '…' }]);
        var bySrc = {}; cs.forEach(function (c) { var w = wsOf(c.id); if (w && w.id !== target.id) (bySrc[w.id] = bySrc[w.id] || []).push(c); });
        var n = 0, err = null;
        for (var sid in bySrc) {
          var ids = bySrc[sid].map(function (c) { return c.id; });
          try { await write('/api/project/' + sid + '/clips', { update_type: 'move', metadata: { clip_ids: ids, target_project_id: target.id } }); }
          catch (e) { err = e; break; }
          var set = {}; ids.forEach(function (id) { set[id] = 1; delete S.sel[id]; });
          S.clips[sid] = (S.clips[sid] || []).filter(function (c) { return !set[c.id]; });
          S.clips[target.id] = (S.clips[target.id] || []).concat(bySrc[sid]); n += ids.length;
        }
        closeModal(); refreshAll();
        toast(err ? tr('Suno a refusé : ', 'Suno refused: ') + err.message : tr(pl(n, 'titre déplacé', 'titres déplacés', '', '') + ' vers « ' + target.name + ' »', pl(n, 'track', 'tracks', 'track', 'tracks') + ' moved to "' + target.name + '"'), 6000);
      } }]);
    var q = $('#sdl-mvq'); q.focus(); q.oninput = function () { var v = norm(q.value); $$('#sdl-mvl .sdl-row').forEach(function (e) { e.style.display = !v || e.dataset.n.indexOf(v) >= 0 ? '' : 'none'; }); };
  }
  var cleanStop = false;
  function cleanTitles(cs) {
    cs = cs.filter(function (c) { return cleanTitle(c.title) !== c.title; });
    if (!cs.length) return toast(tr('Rien à nettoyer : les titres sont déjà propres.', 'Nothing to clean: titles are already tidy.'));
    modal(tr('Nettoyer ', 'Clean ') + pl(cs.length, 'titre', 'titres', 'title', 'titles'),
      '<div class="sdl-muted" style="font-size:13px">' + tr('Vérifie ou corrige chaque nouveau titre, décoche ceux à garder tels quels.', 'Check or fix each new title; untick those to keep as they are.') + '</div><div id="sdl-prog" hidden><div class="sdl-pbar"><i id="sdl-pbar"></i></div><div id="sdl-ptxt" style="font-size:13px"></div></div>' +
      cs.map(function (c, i) { return '<label class="sdl-row" data-i="' + i + '"><input type="checkbox" checked><div style="flex:1;min-width:0"><div class="from">' + esc(c.title) + '</div><input type="text" value="' + esc(cleanTitle(c.title)) + '"></div><span class="st"></span></label>'; }).join(''),
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Renommer sur Suno', 'Rename on Suno'), cls: 'primary', onclick: async function () {
        var rows = $$('#sdl-modal .sdl-row').map(function (r) { return { r: r, on: $('input[type=checkbox]', r).checked, c: cs[+r.dataset.i], v: $('input[type=text]', r).value.trim() }; })
          .filter(function (x) { return x.on && x.v && x.v !== x.c.title; });
        $('#sdl-modal').dataset.busy = 1; $('#sdl-prog').hidden = false; $$('#sdl-modal input').forEach(function (i) { i.disabled = true; });
        cleanStop = false; setButtons([{ label: tr('Arrêter', 'Stop'), onclick: function () { cleanStop = true; } }]);
        var ok = 0, bad = 0;
        for (var i = 0; i < rows.length && !cleanStop; i++) {
          var x = rows[i]; $('#sdl-ptxt').textContent = (i + 1) + ' / ' + rows.length + ' — ' + x.v; $('#sdl-pbar').style.width = (100 * i / rows.length) + '%';
          $('.st', x.r).textContent = '⏳'; x.r.scrollIntoView({ block: 'center', behavior: 'smooth' });
          try { await setTitle(x.c, x.v); ok++; x.r.classList.add('done'); $('.st', x.r).textContent = '✅'; }
          catch (e) { bad++; x.r.classList.add('fail'); $('.st', x.r).textContent = '❌'; $('.st', x.r).title = e.message; }
          await sleep(250);
        }
        $('#sdl-pbar').style.width = '100%'; $('#sdl-ptxt').textContent = tr(pl(ok, 'renommé', 'renommés', '', ''), ok + ' renamed') + (bad ? tr(', ' + bad + ' en échec', ', ' + bad + ' failed') : '') + (cleanStop ? tr(' — arrêté', ' — stopped') : '');
        delete $('#sdl-modal').dataset.busy; refreshAll(); setButtons([{ label: 'OK', cls: 'primary', onclick: closeModal }]);
      } }]);
  }
  function renameWs(w) {
    modal(tr('Renommer l\'espace de travail', 'Rename the workspace'), '<input type="text" id="sdl-wsn" style="width:100%" value="' + esc(w.name) + '">',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Renommer', 'Rename'), cls: 'primary', onclick: async function () {
        var v = $('#sdl-wsn').value.trim().slice(0, 100); if (!v || v === w.name) return closeModal();
        setButtons([{ label: '…' }]);
        try { await write('/api/project/' + w.id + '/metadata', { name: v, description: w.desc || v }); w.name = v; closeModal(); refreshAll(); toast(tr('Espace renommé : ', 'Workspace renamed: ') + v); }
        catch (e) { closeModal(); toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }
      } }]);
    setTimeout(function () { var i = $('#sdl-wsn'); if (i) { i.focus(); i.select(); i.onkeydown = function (e) { if (e.key === 'Enter') $('#sdl-modal .primary').click(); }; } }, 30);
  }
  function newWs() {
    modal(tr('Nouvel espace de travail', 'New workspace'), '<input type="text" id="sdl-nws" style="width:100%" placeholder="' + tr('Nom', 'Name') + '">',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Créer', 'Create'), cls: 'primary', onclick: async function () {
        var v = $('#sdl-nws').value.trim().slice(0, 100); if (!v) return;
        setButtons([{ label: '…' }]);
        try {
          var r = await write('/api/project', { name: v, description: '' });
          var w = { id: r && r.id, name: (r && r.name) || v, desc: '', img: '', n: 0, upd: new Date().toISOString(), marker: '' };
          if (w.id) { S.ws.unshift(w); S.clips[w.id] = []; S.cur = w.id; }
          closeModal(); refreshAll(); toast(tr('Espace créé : ', 'Workspace created: ') + w.name);
        } catch (e) { closeModal(); toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }
      } }]);
    setTimeout(function () { var i = $('#sdl-nws'); if (i) { i.focus(); i.onkeydown = function (e) { if (e.key === 'Enter') $('#sdl-modal .primary').click(); }; } }, 30);
  }
  function deleteWs(w) {
    var n = (S.clips[w.id] || []).length;
    modal(tr('Supprimer « ' + w.name + ' » ?', 'Delete "' + w.name + '"?'), '<div>' + tr('L\'espace de travail et ses ' + n + ' titres iront dans la corbeille de Suno (récupérable sur suno.com).', 'The workspace and its ' + n + ' tracks go to Suno\'s trash (you can restore them on suno.com).') + '</div>',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Supprimer', 'Delete'), cls: 'danger', onclick: async function () {
        setButtons([{ label: '…' }]);
        try {
          await write('/api/project/trash', { project_id: w.id, undo_trash: false });
          S.ws = S.ws.filter(function (x) { return x.id !== w.id; }); delete S.clips[w.id]; delete S.markers[w.id];
          S.cur = ALL; closeModal(); refreshAll(); toast(tr('« ' + w.name + ' » est dans la corbeille Suno', '"' + w.name + '" is in Suno\'s trash'));
        } catch (e) { closeModal(); toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }
      } }]);
  }
  function trackMenu(ev, c) {
    if (!isMine(c)) return menu(ev, [
      ['▶ ' + tr('Lire', 'Play'), function () { var cs = viewClips(); startQueue(cs, Math.max(0, cs.indexOf(c)), false); }],
      [c.liked ? '♡ ' + tr('Retirer des favoris', 'Remove from favorites') : '♥ ' + tr('Ajouter aux favoris', 'Add to favorites'), function () { toggleLike(c); }],
      ['↗ ' + tr('Voir sur Suno', 'See on Suno'), function () { show(false); if (window.next && window.next.router) window.next.router.push('/song/' + c.id); }]
    ]);
    menu(ev, [
      ['▶ ' + tr('Lire', 'Play'), function () { var cs = viewClips(); startQueue(cs, Math.max(0, cs.indexOf(c)), false); }],
      ['✏️ ' + tr('Renommer', 'Rename'), function () { renameTrack(c); }],
      cleanTitle(c.title) !== c.title ? ['✨ ' + tr('Nettoyer le titre', 'Clean the title'), function () { cleanTitles([c]); }] : null,
      [c.liked ? '♡ ' + tr('Retirer des favoris', 'Remove from favorites') : '♥ ' + tr('Ajouter aux favoris', 'Add to favorites'), function () { toggleLike(c); }],
      ['📁 ' + tr('Déplacer vers…', 'Move to…'), function () { moveTracks([c]); }],
      ['↗ ' + tr('Voir sur Suno', 'See on Suno'), function () { show(false); if (window.next && window.next.router) window.next.router.push('/song/' + c.id); }],
      ['🗑 ' + tr('Supprimer', 'Delete'), function () { deleteTracks([c]); }, 'danger']
    ]);
  }

  /* ================================================================ events */
  root.addEventListener('click', function (e) {
    var t = e.target;
    // closest() limited to the overlay (suno.com's own <html>/<body> carry data-* attributes too)
    var cl = function (sel) { var x = t.closest(sel); return x && root.contains(x) && x !== root ? x : null; };
    var sb = cl('[data-selid]'); if (sb) { S.sel[sb.dataset.selid] = sb.checked; if (!sb.checked) delete S.sel[sb.dataset.selid]; renderTracks(); return; }
    var lk = cl('[data-like]'); if (lk) { var c1 = findClip(lk.dataset.like); if (c1) toggleLike(c1); return; }
    var mn = cl('[data-menu]'); if (mn) { var c2 = findClip(mn.dataset.menu); if (c2) trackMenu(e, c2); return; }
    var th = cl('[data-sdltheme]'); if (th) { applyTheme(th.dataset.sdltheme); return; }
    var fc = cl('[data-feed]'); if (fc) { var F = S.exp.feeds[+fc.dataset.feed]; if (F) startQueue(F.clips, +fc.dataset.k, false); return; }
    var fp = cl('[data-feedplay]'); if (fp) { var F2 = S.exp.feeds[+fp.dataset.feedplay]; if (F2) startQueue(F2.clips, 0, false); return; }
    var plb = cl('[data-pl]'); if (plb) { openView('pl:' + plb.dataset.pl); return; }
    var ws = cl('[data-ws]'); if (ws) {
      e.preventDefault();
      if (ws.dataset.ws === EXP) return openView(EXP);
      S.cur = ws.dataset.ws; S.tQ = ''; S.filter = 'all'; S.limit = 400; LS.set('cur', S.cur); renderWs(); renderTracks(); $('#sdl-mainin').scrollTop = 0;
      if (S.cur !== ALL && !S.clips[S.cur]) { var id = S.cur; fetchClips(id).then(function (cs) { S.clips[id] = cs; save(); renderTracks(); renderWs(); }); } return;
    }
    var so = cl('[data-wsort]'); if (so) { S.wsSort = so.dataset.wsort; LS.set('wsSort', S.wsSort); renderWs(); return; }
    var fi = cl('[data-filter]'); if (fi) { S.filter = fi.dataset.filter; renderTracks(); return; }
    var srt = cl('[data-sort]'); if (srt) { S.sort = srt.dataset.sort; LS.set('sort', S.sort); renderTracks(); return; }
    var ac = cl('[data-act]'); if (ac) {
      var w = curWs(), vc = viewClips();
      switch (ac.dataset.act) {
        case 'playall': return startQueue(vc, 0, false);
        case 'shufall': return startQueue(vc, Math.floor(Math.random() * vc.length), true);
        case 'wsrename': return w && renameWs(w);
        case 'wsdelete': return w && deleteWs(w);
        case 'newws': return newWs();
        case 'expmore': return loadExplore();
        case 'clean': return cleanTitles(S.cur === ALL ? [].concat.apply([], S.ws.map(function (x) { return S.clips[x.id] || []; })) : (S.clips[S.cur] || []));
        case 'selall': vc.forEach(function (c) { S.sel[c.id] = true; }); return renderTracks();
        case 'bnone': S.sel = {}; return renderTracks();
        case 'bmove': return moveTracks(selList());
        case 'bdelete': return deleteTracks(selList());
        case 'bclean': return cleanTitles(selList());
        case 'more': S.limit = (S.limit || 400) + 400; return renderTracks();
      }
    }
    var trow = cl('.sdl-tr'); if (trow && !cl('button,input')) { var list = viewClips(); return startQueue(list, +trow.dataset.i, S.shuffle); }
    var bt = cl('button'); if (!bt) return;
    switch (bt.id) {
      case 'sdl-pp': return toggle();
      case 'sdl-next': return next(false);
      case 'sdl-prev': return prev();
      case 'sdl-shuf': S.shuffle = !S.shuffle; LS.set('shuffle', S.shuffle); return renderPlayer();
      case 'sdl-rep': S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off'; LS.set('repeat', S.repeat); return renderPlayer();
      case 'sdl-lyrbtn': if (S.karaoke) S.karaoke = false; else S.showLyr = !S.showLyr; LS.set('showLyr', S.showLyr); renderPlayer(); renderLyrics(); return;
      case 'sdl-kara': S.karaoke = !S.karaoke; renderPlayer(); renderLyrics(); return;
      case 'sdl-follow': follow = true; bt.hidden = true; lyrCur = -1; return tick();
      case 'sdl-sync': return sync(true);
      case 'sdl-hide': return show(false);
      case 'sdl-spy': return spyPanel();
      case 'sdl-theme': return modal(tr('Thème', 'Theme'), '<div class="sdl-themes" id="sdl-themes"></div>', [{ label: 'OK', cls: 'primary', onclick: closeModal }]), renderThemes();
    }
  });
  $('#sdl-now').addEventListener('click', function () { var w = S.playing && wsOf(S.playing.id); if (w) { S.cur = w.id; renderWs(); renderTracks(); } });
  $('#sdl-lyr-body').addEventListener('click', function (e) { var n = e.target.closest('.sdl-ly'); var a = audio(); if (!n || !a || !S.lyr || !S.lyr.lines) return; var l = S.lyr.lines[+n.dataset.i]; if (l && !l.sec) { a.currentTime = Math.max(0, l.s - 0.05); follow = true; $('#sdl-follow').hidden = true; } });
  ['wheel', 'touchmove'].forEach(function (ev) { $('#sdl-lyr-body').addEventListener(ev, function () { if (Date.now() > followUntil) { follow = false; $('#sdl-follow').hidden = false; } }, { passive: true }); });
  $('#sdl-wsq').addEventListener('input', function (e) { S.wsQ = e.target.value; renderWs(); });
  var sk = $('#sdl-seek');
  sk.addEventListener('input', function () { seeking = true; var a = audio(); if (a && isFinite(a.duration)) $('#sdl-t').textContent = fmt(a.duration * sk.value / 1000); });
  sk.addEventListener('change', function () { var a = audio(); if (a && isFinite(a.duration)) a.currentTime = a.duration * sk.value / 1000; seeking = false; });
  $('#sdl-vol').addEventListener('input', function (e) { var a = audio(); if (a) a.volume = e.target.value / 100; LS.set('vol', +e.target.value); });
  fab.addEventListener('click', function () { show(true); });
  document.addEventListener('keydown', function (e) {
    if (root.classList.contains('hide')) return;
    if (e.key === 'Escape') { if ($('#sdl-modal')) closeModal(); else if (S.karaoke) { S.karaoke = false; renderPlayer(); } else show(false); e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.matches && e.target.matches('input,textarea')) return;
    if (e.code === 'Space') { toggle(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowRight' && e.shiftKey) next(false);
    else if (e.key === 'ArrowLeft' && e.shiftKey) prev();
  }, true);

  /* ================================================================ spy ("mouchard")
     Records the calls suno.com ITSELF makes to its API while you use the site normally, so we can
     see how the site does things (rename, move, playlists...). Tokens and cookies are never
     recorded: only method, path, the JSON sent (truncated) and the answer's status + start. */
  var SPY = { on: false, log: [] };
  function spyAdd(method, url, body, status, resp) {
    try {
      var u = new URL(url, location.href); if (!/suno\.com$/.test(u.hostname) || !/^\/api\//.test(u.pathname)) return;
      if (/\/api\/(challenge\/progress|notification|billing|user\/get_user_session|statsig|c\/|modals|session\/?$|music_player\/playbar_state)/.test(u.pathname)) return;
      var b = body == null ? '' : typeof body === 'string' ? body : '[' + (body.constructor && body.constructor.name) + ']';
      var e = { t: new Date().toLocaleTimeString('fr-FR'), m: method, p: u.pathname + u.search, body: b.slice(0, 600), st: status, resp: String(resp || '').slice(0, 300) };
      SPY.log.push(e); log('SPY', e.m, e.p, e.body, '→', e.st, e.resp);
      var c = $('#sdl-spyn'); if (c) c.textContent = SPY.log.length;
    } catch (x) {}
  }
  function spyStart() {
    if (SPY.on) return; SPY.on = true;
    var rf = window.fetch; window.__sdlRealFetch = rf;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '', method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var body = init && init.body, bodyP = Promise.resolve(body);
      // suno.com sends Request objects: read their body from a copy
      if (body == null && input && typeof input !== 'string' && input.clone && method !== 'GET') { try { bodyP = input.clone().text(); } catch (x) {} }
      return rf.apply(this, arguments).then(function (r) {
        if (SPY.on) { try { Promise.all([bodyP, r.clone().text()]).then(function (v) { spyAdd(method, url, v[0], r.status, v[1]); }); } catch (x) {} }
        return r;
      });
    };
    var xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__sdl = { m: String(m).toUpperCase(), u: u }; return xo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      var x = this, d = x.__sdl;
      if (d) x.addEventListener('loadend', function () { if (SPY.on) spyAdd(d.m, d.u, b, x.status, x.responseType === '' || x.responseType === 'text' ? x.responseText : '[' + x.responseType + ']'); });
      return xs.apply(this, arguments);
    };
    log('spy ON: use suno.com normally (rename, move, playlists...), then copy the log from the overlay');
  }
  // Structure of the current suno.com page (form fields and buttons only, no content): to build the Create screen.
  function pageStructure() {
    var vis = function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    var out = ['SUNODLAA page structure v' + VERSION + ' — ' + location.pathname + ' — ' + innerWidth + 'x' + innerHeight];
    $$('textarea,input,[contenteditable="true"],[role="textbox"],[role="switch"],[role="tab"],[role="combobox"],[role="slider"],select,button').filter(function (e) { return !root.contains(e) && vis(e); }).slice(0, 220).forEach(function (e) {
      var r = e.getBoundingClientRect(), tag = e.tagName.toLowerCase();
      var label = (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('title') || (tag === 'button' ? (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50) : '') || '');
      var extra = [e.type && tag === 'input' ? 'type=' + e.type : '', e.getAttribute('role') ? 'role=' + e.getAttribute('role') : '', e.getAttribute('data-testid') ? 'testid=' + e.getAttribute('data-testid') : '',
        e.getAttribute('aria-checked') != null ? 'checked=' + e.getAttribute('aria-checked') : '', e.getAttribute('aria-selected') != null ? 'selected=' + e.getAttribute('aria-selected') : '',
        (tag === 'textarea' || tag === 'input') && e.maxLength > 0 ? 'max=' + e.maxLength : '', (tag === 'textarea' || tag === 'input') ? 'len=' + (e.value || '').length : ''].filter(Boolean).join(' ');
      out.push(tag + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + label + '" ' + extra);
    });
    return out.join('\n');
  }
  function spyPanel() {
    modal(tr('🕵 Mouchard', '🕵 Spy'), tr('<div style="font-size:14px">1. Clique sur <b>Démarrer</b>.<br>2. Ferme le lecteur (✕) et fais l\'action sur suno.com, normalement (renommer, déplacer, playlist…).<br>3. Rouvre le lecteur avec le bouton rose, 🕵, puis <b>Copier le journal</b> et envoie-le-moi.<br><span class="sdl-muted">Jamais de mot de passe ni de jeton dans le journal : seulement les adresses appelées, ce qui est envoyé et le début des réponses.</span></div>', '<div style="font-size:14px">1. Click <b>Start</b>.<br>2. Close the player (✕) and do the action on suno.com as usual (rename, move, playlist…).<br>3. Reopen the player with the SUNODLAA button, 🕵, then <b>Copy the log</b> and send it to me.<br><span class="sdl-muted">Never any password or token in the log: only the addresses called, what is sent and the start of the answers.</span></div>') +
      '<div style="margin-top:12px">' + tr('Appels enregistrés : ', 'Calls recorded: ') + '<b id="sdl-spyn">' + SPY.log.length + '</b></div>',
      [{ label: tr('Fermer', 'Close'), onclick: closeModal },
       { label: tr('Structure de la page', 'Page structure'), onclick: function () {
         var txt = pageStructure();
         (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(tr('Structure copiée', 'Structure copied')); }, function () { console.log(txt); toast(tr('Copie impossible : regarde la console (F12)', 'Could not copy: see the console (F12)')); });
       } },
       { label: tr('Vider', 'Clear'), onclick: function () { SPY.log = []; $('#sdl-spyn').textContent = 0; } },
       { label: tr('Copier le journal', 'Copy the log'), onclick: function () {
         var txt = 'SUNODLAA spy v' + VERSION + '\n' + SPY.log.map(function (e) { return e.t + ' ' + e.m + ' ' + e.p + (e.body ? '\n   body: ' + e.body : '') + '\n   -> ' + e.st + ' ' + e.resp.replace(/\s+/g, ' '); }).join('\n');
         (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(tr('Journal copié (', 'Log copied (') + SPY.log.length + tr(' appels)', ' calls)')); }, function () { console.log(txt); toast(tr('Copie impossible : le journal est dans la console (F12)', 'Could not copy: the log is in the console (F12)')); });
       } },
       { label: SPY.on ? tr('En cours…', 'Running…') : tr('Démarrer', 'Start'), cls: 'primary', onclick: function () { spyStart(); closeModal(); show(false); toast(tr('Mouchard actif : fais ton action sur suno.com', 'Spy on: do your action on suno.com'), 5000); } }]);
  }

  placePill();
  window.__sdlSkin = { toggle: toggleUI, sync: sync, state: S, version: VERSION, render: function () { renderWs(); renderTracks(); renderPlayer(); } };
  applyTheme(S.theme);
  if (S.cur === EXP || S.cur.indexOf('pl:') === 0) setTimeout(function () { openView(S.cur); }, 0);
  renderWs(); renderTracks(); renderPlayer(); renderLyrics();
  sync(false);
})();
