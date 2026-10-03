/* SUNODLAA - a nicer player on top of suno.com.
   Runs inside YOUR suno.com tab (bookmark). It lists your workspaces and plays them track after
   track WITH SUNO'S OWN PLAYER: it opens the song in the page and presses Play, then only uses
   play / pause / seek / volume. It never copies or downloads the audio. */
(function () {
  'use strict';
  if (window.__sdlSkin) { window.__sdlSkin.toggle(); return; }
  if (!/(^|\.)suno\.com$/.test(location.hostname)) { alert('Ouvre suno.com (connecté) puis clique sur le favori.'); return; }

  /* ---------------------------------------------------------------- helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('sdl_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('sdl_' + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------------------------------------------------------------- Suno API (as the page itself) */
  var BASES = ['https://studio-api-prod.suno.com', 'https://studio-api.prod.suno.com'];
  function cookie(re) { var m = document.cookie.match(re); return m ? decodeURIComponent(m[1]) : null; }
  async function token() {
    try { if (window.Clerk && window.Clerk.session) { var t = await window.Clerk.session.getToken(); if (t) return t; } } catch (e) {}
    return cookie(/(?:^|;\s*)__session(?:_[^=]+)?=([^;]+)/);
  }
  async function api(path) {
    var t = await token();
    if (!t) throw new Error('Pas connecté à Suno dans cet onglet');
    var h = { Authorization: 'Bearer ' + t, 'browser-token': btoa(JSON.stringify({ timestamp: Date.now() })) };
    var dev = cookie(/(?:^|;\s*)ajs_anonymous_id=([^;]+)/); if (dev) h['device-id'] = dev.replace(/"/g, '');
    var err;
    for (var i = 0; i < BASES.length; i++) {
      try {
        var r = await fetch(BASES[i] + path, { headers: h, credentials: 'omit' });
        if (r.ok) { if (i) BASES.unshift(BASES.splice(i, 1)[0]); return await r.json(); }
        err = new Error('HTTP ' + r.status);
        if (r.status === 401 || r.status === 403) break;
      } catch (e) { err = e; }
    }
    throw err;
  }

  /* ---------------------------------------------------------------- library (cached in this browser) */
  var S = {
    ws: LS.get('ws', []), clips: LS.get('clips', {}), markers: LS.get('markers', {}),
    cur: LS.get('cur', null), q: '', wsQ: '',
    queue: [], idx: -1, shuffle: LS.get('shuffle', false), repeat: LS.get('repeat', 'off'),
    playing: null, lyr: null, showLyr: LS.get('showLyr', false), syncing: false, err: ''
  };
  function slim(c) { var m = c.metadata || {}; return { id: c.id, title: c.title || 'Sans titre', at: c.created_at || '', d: m.duration || 0, tags: m.tags || '', cover: m.cover_clip_id || '', img: c.image_url || '', imgL: c.image_large_url || c.image_url || '', liked: !!c.is_liked, prompt: m.prompt || '' }; }
  function originals(cs) { var o = {}; cs.forEach(function (c) { if (c.cover) o[c.cover] = 1; }); return o; }
  function ordered(cs) {   // original(s) first, then oldest -> newest (same numbering as SunoAAWeb)
    var o = originals(cs);
    return cs.slice().sort(function (a, b) { return ((o[b.id] ? 1 : 0) - (o[a.id] ? 1 : 0)) || a.at.localeCompare(b.at); });
  }
  function wsCover(w) {
    var cs = S.clips[w.id] || []; if (!cs.length) return w.img || '';
    var o = originals(cs), byDate = cs.slice().sort(function (a, b) { return a.at.localeCompare(b.at); });
    var f = byDate.find(function (c) { return o[c.id] && c.img; }) || byDate.find(function (c) { return c.img; });
    return f ? f.img : (w.img || '');
  }
  function save() { LS.set('ws', S.ws); LS.set('clips', S.clips); LS.set('markers', S.markers); }

  async function sync(force) {
    if (S.syncing) return; S.syncing = true; S.err = ''; renderStatus();
    try {
      var list = [], page = 1, total = null;
      while (true) {
        var d = await api('/api/project/me?page=' + page);
        var items = d.projects || []; list = list.concat(items); total = d.num_total_results != null ? d.num_total_results : total;
        if (!items.length || (total != null && list.length >= total)) break; page++;
      }
      S.ws = list.map(function (w) { return { id: w.id, name: w.name || 'Sans nom', img: w.image_url || '', n: w.clip_count || 0, upd: (w.last_updated_clip && w.last_updated_clip.created_at) || w.updated_at || w.created_at || '', marker: JSON.stringify(w.last_updated_clip == null ? null : w.last_updated_clip) + '|' + (w.clip_count || 0) }; });
      renderWs(); save();
      var todo = S.ws.filter(function (w) { return force || !S.clips[w.id] || S.markers[w.id] !== w.marker; });
      todo.sort(function (a, b) { return (b.id === S.cur) - (a.id === S.cur); });
      for (var i = 0; i < todo.length; i++) {
        var w = todo[i];
        try { S.clips[w.id] = await fetchClips(w.id); S.markers[w.id] = w.marker; } catch (e) {}
        S.syncInfo = (i + 1) + '/' + todo.length; renderStatus();
        if (w.id === S.cur) renderTracks();
        if (i % 5 === 4) { renderWs(); save(); }
      }
      save(); renderWs(); renderTracks();
    } catch (e) { S.err = '' + (e.message || e); }
    S.syncing = false; S.syncInfo = ''; renderStatus();
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

  /* ---------------------------------------------------------------- Suno's own player */
  function audio() { var as = document.querySelectorAll('audio'); for (var i = 0; i < as.length; i++) if (as[i].src && as[i].src.indexOf('blob:') === 0) return as[i]; return null; }
  function btn(label) { var bs = document.querySelectorAll('button[aria-label]'); for (var i = 0; i < bs.length; i++) if (bs[i].getAttribute('aria-label') === label) return bs[i]; return null; }
  var playToken = 0;
  async function playIdx(i) {
    if (i < 0 || i >= S.queue.length) return;
    S.idx = i; var c = S.queue[i]; S.playing = c; var my = ++playToken;
    S.loading = true; renderPlayer(); renderTracks(); loadLyrics(c);
    var a0 = audio(); if (a0 && !a0.paused) a0.pause();
    if (location.pathname.indexOf(c.id) < 0) {
      try { window.next.router.push('/song/' + c.id); } catch (e) { location.href = '/song/' + c.id; return; }
    }
    for (var t = 0; t < 80 && my === playToken; t++) {          // up to 40 s
      await sleep(500);
      if (location.pathname.indexOf(c.id) < 0) continue;
      var a = audio(), title = navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title;
      if (a && !a.paused && a.currentTime > 0 && (!title || title === c.title || t > 12)) { S.loading = false; renderPlayer(); return; }
      var b = btn('Play');
      if (b && t % 8 === 1) b.click();
    }
    if (my === playToken) { S.loading = false; toast('Suno n\'a pas lancé « ' + c.title + ' » — titre suivant'); next(true); }
  }
  function startQueue(cs, i, shuffle) {
    var list = cs.slice();
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
  function toggle() { var a = audio(); if (!a) { if (S.queue.length) playIdx(Math.max(0, S.idx)); return; } if (a.paused) a.play(); else a.pause(); }
  document.addEventListener('ended', function (e) { if (e.target === audio() && S.playing && location.pathname.indexOf(S.playing.id) >= 0) next(true); }, true);
  ['play', 'pause', 'playing'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.target === audio()) renderPlayer(); }, true); });
  document.addEventListener('timeupdate', function (e) { if (e.target === audio()) tick(); }, true);

  /* ---------------------------------------------------------------- lyrics + karaoke */
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
    else el.innerHTML = L.text ? '<div class="sdl-ly static">' + esc(L.text).replace(/\n/g, '<br>') + '</div>' : '<div class="sdl-muted">Pas de paroles</div>';
  }
  function lyrTick(t) {
    var L = S.lyr, el = $('#sdl-lyr-body'); if (!L || !L.lines || !el || !S.showLyr) return;
    var k = -1; for (var i = 0; i < L.lines.length; i++) { if (t >= L.lines[i].s - 0.12) k = i; else break; }
    if (k !== lyrCur) {
      el.querySelectorAll('.sdl-ly').forEach(function (n, i) { n.classList.toggle('past', i < k); n.classList.toggle('on', i === k); if (i !== k) n.querySelectorAll('.w').forEach(function (w) { w.classList.toggle('sung', i < k); }); });
      lyrCur = k; var n = el.querySelector('.sdl-ly.on');
      if (n && follow) { followUntil = Date.now() + 900; el.scrollTo({ top: n.offsetTop - el.clientHeight / 2 + n.clientHeight / 2, behavior: 'smooth' }); }
    }
    var line = L.lines[k], ln = el.querySelector('.sdl-ly.on');
    if (line && line.words && ln) ln.querySelectorAll('.w').forEach(function (w) { var wd = line.words[+w.dataset.j]; w.classList.toggle('sung', !!wd && t >= wd.s - 0.05); });
  }

  /* ---------------------------------------------------------------- UI */
  var root = document.createElement('div'); root.id = 'sdl-root';
  root.innerHTML =
    '<style>' +
    '#sdl-root{--bg:#0d0d12;--panel:#15151d;--panel2:#1c1c26;--line:#262633;--txt:#ecebf3;--mut:#8e8ca3;--acc:#ff4f8b;--acc2:#8a5cff;--gold:#e3b341;' +
    'position:fixed;inset:0;z-index:2147483000;background:var(--bg);color:var(--txt);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:grid;grid-template-columns:300px 1fr;grid-template-rows:1fr auto;}' +
    '#sdl-root.hide{display:none}#sdl-root *{box-sizing:border-box}#sdl-root button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}' +
    '.sdl-side{grid-row:1;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;background:var(--panel)}' +
    '.sdl-brand{display:flex;align-items:center;gap:8px;padding:16px 16px 8px;font-weight:800;font-size:18px;letter-spacing:.3px}' +
    '.sdl-brand b{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.sdl-brand .sp{flex:1}.sdl-ic{width:34px;height:34px;border-radius:50%;display:inline-grid;place-items:center;font-size:16px}.sdl-ic:hover{background:var(--panel2)}' +
    '.sdl-search{margin:6px 12px 10px;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--txt);outline:none;width:calc(100% - 24px)}' +
    '.sdl-search:focus{border-color:var(--acc)}' +
    '.sdl-wslist{overflow:auto;flex:1;padding:0 8px 12px}.sdl-ws{display:flex;gap:10px;align-items:center;padding:7px 8px;border-radius:10px;width:100%;text-align:left}' +
    '.sdl-ws:hover{background:var(--panel2)}.sdl-ws.on{background:linear-gradient(90deg,rgba(255,79,139,.18),rgba(138,92,255,.10))}' +
    '.sdl-ws img,.sdl-ws .ph{width:42px;height:42px;border-radius:8px;object-fit:cover;flex:none;background:var(--panel2)}' +
    '.sdl-ws .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-ws .ct{color:var(--mut);font-size:12px}' +
    '.sdl-status{padding:8px 16px;color:var(--mut);font-size:12px;border-top:1px solid var(--line)}.sdl-status.err{color:#ff7a7a}' +
    '.sdl-main{grid-row:1;overflow:auto;min-width:0;display:flex}.sdl-mainin{flex:1;min-width:0}' +
    '.sdl-hero{display:flex;gap:24px;align-items:flex-end;padding:32px 32px 20px;background:linear-gradient(180deg,rgba(138,92,255,.25),transparent)}' +
    '.sdl-hero img,.sdl-hero .ph{width:180px;height:180px;border-radius:14px;object-fit:cover;box-shadow:0 12px 40px rgba(0,0,0,.5);background:var(--panel2);flex:none}' +
    '.sdl-hero h1{margin:0 0 6px;font-size:40px;line-height:1.1;font-weight:800}.sdl-hero .meta{color:var(--mut)}' +
    '.sdl-acts{display:flex;gap:10px;margin-top:16px}.sdl-big{padding:10px 22px;border-radius:999px;font-weight:700;background:linear-gradient(90deg,var(--acc),var(--acc2))!important;color:#fff!important}' +
    '.sdl-ghost{padding:10px 18px;border-radius:999px;border:1px solid var(--line)!important;font-weight:600}.sdl-ghost:hover{border-color:var(--txt)!important}' +
    '.sdl-tracks{padding:4px 20px 30px}.sdl-tr{display:grid;grid-template-columns:36px 44px 1fr auto 56px;gap:12px;align-items:center;padding:6px 12px;border-radius:10px;width:100%;text-align:left}' +
    '.sdl-tr:hover{background:var(--panel)}.sdl-tr.on{background:var(--panel2)}.sdl-tr.on .tt{color:var(--acc)}' +
    '.sdl-tr .no{color:var(--mut);text-align:right;font-variant-numeric:tabular-nums}.sdl-tr img{width:44px;height:44px;border-radius:6px;object-fit:cover}' +
    '.sdl-tr .tt{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-tr .tg{color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sdl-tr .du{color:var(--mut);font-variant-numeric:tabular-nums;text-align:right}.sdl-tr .lk{color:var(--acc)}.sdl-star{color:var(--gold)}.sdl-orig .tt{color:var(--gold)}' +
    '.sdl-lyr{width:380px;flex:none;border-left:1px solid var(--line);display:flex;flex-direction:column;background:var(--panel);position:relative}.sdl-lyr[hidden]{display:none}' +
    '.sdl-lyr h3{margin:0;padding:14px 18px;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:1px}' +
    '#sdl-lyr-body{overflow:auto;flex:1;padding:10px 20px 50vh}.sdl-ly{padding:6px 0;font-size:20px;font-weight:700;color:#5d5b70;transition:color .2s}' +
    '.sdl-ly.past{color:#8e8ca3}.sdl-ly.on{color:#fff}.sdl-ly .w.sung{color:var(--acc)}.sdl-ly.sec{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:var(--acc2);padding-top:16px}' +
    '.sdl-ly.static{font-size:15px;font-weight:400;color:var(--txt)}#sdl-follow{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:var(--acc)!important;color:#fff!important;font-weight:700}' +
    '.sdl-muted{color:var(--mut)}' +
    '.sdl-bar{grid-column:1/3;display:grid;grid-template-columns:minmax(200px,1fr) minmax(320px,2fr) minmax(200px,1fr);gap:16px;align-items:center;padding:10px 18px;background:#09090d;border-top:1px solid var(--line)}' +
    '.sdl-now{display:flex;gap:12px;align-items:center;min-width:0}.sdl-now img{width:56px;height:56px;border-radius:8px;object-fit:cover;background:var(--panel2)}' +
    '.sdl-now .t{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-now .s{color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sdl-ctl{display:flex;flex-direction:column;gap:6px;align-items:center}.sdl-btns{display:flex;gap:14px;align-items:center}' +
    '.sdl-play{width:44px;height:44px;border-radius:50%;background:#fff!important;color:#000!important;font-size:18px;display:grid;place-items:center}' +
    '.sdl-tog.on{color:var(--acc)}.sdl-prog{display:flex;gap:10px;align-items:center;width:100%;font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}' +
    '.sdl-prog input,.sdl-vol input{flex:1;accent-color:var(--acc)}.sdl-right{display:flex;gap:8px;justify-content:flex-end;align-items:center}.sdl-vol{display:flex;align-items:center;gap:6px;width:150px}' +
    '.sdl-toast{position:fixed;bottom:96px;left:50%;transform:translateX(-50%);background:#fff;color:#000;padding:10px 16px;border-radius:10px;font-weight:600;z-index:2147483001}' +
    '#sdl-fab{position:fixed;right:18px;bottom:96px;z-index:2147483001;padding:10px 14px;border-radius:999px;border:0;font:700 13px system-ui;color:#fff;cursor:pointer;background:linear-gradient(90deg,#ff4f8b,#8a5cff);box-shadow:0 6px 20px rgba(0,0,0,.4)}' +
    '.sdl-spin{display:inline-block;animation:sdlspin 1s linear infinite}@keyframes sdlspin{to{transform:rotate(360deg)}}' +
    '</style>' +
    '<aside class="sdl-side"><div class="sdl-brand"><b>SUNODLAA</b><span class="sp"></span>' +
    '<button class="sdl-ic" id="sdl-sync" title="Actualiser depuis Suno">⟳</button><button class="sdl-ic" id="sdl-hide" title="Revenir à la page Suno (Échap)">✕</button></div>' +
    '<input class="sdl-search" id="sdl-wsq" placeholder="Rechercher un espace de travail…">' +
    '<div class="sdl-wslist" id="sdl-wslist"></div><div class="sdl-status" id="sdl-status"></div></aside>' +
    '<main class="sdl-main"><div class="sdl-mainin" id="sdl-mainin"></div>' +
    '<section class="sdl-lyr" id="sdl-lyr" hidden><h3>Paroles</h3><div id="sdl-lyr-body"></div><button id="sdl-follow" hidden>⤓ Suivre les paroles</button></section></main>' +
    '<footer class="sdl-bar"><div class="sdl-now" id="sdl-now"></div>' +
    '<div class="sdl-ctl"><div class="sdl-btns"><button class="sdl-ic sdl-tog" id="sdl-shuf" title="Aléatoire">🔀</button><button class="sdl-ic" id="sdl-prev" title="Précédent">⏮</button>' +
    '<button class="sdl-play" id="sdl-pp">▶</button><button class="sdl-ic" id="sdl-next" title="Suivant">⏭</button><button class="sdl-ic sdl-tog" id="sdl-rep" title="Répéter">🔁</button></div>' +
    '<div class="sdl-prog"><span id="sdl-t">0:00</span><input type="range" id="sdl-seek" min="0" max="1000" value="0"><span id="sdl-d">0:00</span></div></div>' +
    '<div class="sdl-right"><button class="sdl-ic sdl-tog" id="sdl-lyrbtn" title="Paroles / karaoké">🎤</button><div class="sdl-vol">🔊<input type="range" id="sdl-vol" min="0" max="100"></div></div></footer>';
  document.documentElement.appendChild(root);
  var fab = document.createElement('button'); fab.id = 'sdl-fab'; fab.textContent = '♪ SUNODLAA'; fab.hidden = true;
  document.documentElement.appendChild(fab);

  function show(on) { root.classList.toggle('hide', !on); fab.hidden = on; }
  function toggleUI() { show(root.classList.contains('hide')); }
  var toastT; function toast(m) { var t = $('.sdl-toast'); if (!t) { t = document.createElement('div'); t.className = 'sdl-toast'; document.documentElement.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 4000); }

  function renderStatus() {
    var el = $('#sdl-status'); el.className = 'sdl-status' + (S.err ? ' err' : '');
    var n = 0; for (var k in S.clips) n += S.clips[k].length;
    el.innerHTML = S.err ? esc(S.err) : S.syncing ? '<span class="sdl-spin">⟳</span> Synchro Suno… ' + esc(S.syncInfo || '') : S.ws.length + ' espaces · ' + n + ' titres';
  }
  function renderWs() {
    var q = norm(S.wsQ);
    var list = S.ws.filter(function (w) { return !q || norm(w.name).indexOf(q) >= 0; });
    $('#sdl-wslist').innerHTML = list.map(function (w) {
      var img = wsCover(w), n = (S.clips[w.id] || []).length || w.n;
      return '<button class="sdl-ws' + (w.id === S.cur ? ' on' : '') + '" data-ws="' + esc(w.id) + '">' + (img ? '<img loading="lazy" src="' + esc(img) + '">' : '<span class="ph"></span>') +
        '<span style="min-width:0"><div class="nm">' + esc(w.name) + '</div><div class="ct">' + n + ' titre' + (n > 1 ? 's' : '') + '</div></span></button>';
    }).join('') || '<div class="sdl-muted" style="padding:12px">' + (S.syncing ? 'Chargement…' : 'Aucun espace') + '</div>';
    renderStatus();
  }
  function curWs() { return S.ws.find(function (w) { return w.id === S.cur; }); }
  function viewClips() { return ordered(S.clips[S.cur] || []); }
  function renderTracks() {
    var w = curWs(), el = $('#sdl-mainin');
    if (!w) { el.innerHTML = '<div class="sdl-hero"><div><h1>Tes espaces de travail</h1><div class="meta">Choisis un espace à gauche.</div></div></div>'; return; }
    var cs = viewClips(), o = originals(cs), img = wsCover(w), tot = cs.reduce(function (s, c) { return s + (c.d || 0); }, 0);
    el.innerHTML = '<div class="sdl-hero">' + (img ? '<img src="' + esc(img) + '">' : '<span class="ph"></span>') +
      '<div style="min-width:0"><div class="meta">Espace de travail</div><h1>' + esc(w.name) + '</h1><div class="meta">' + cs.length + ' titres · ' + Math.round(tot / 60) + ' min</div>' +
      '<div class="sdl-acts"><button class="sdl-big" id="sdl-playall">▶ Lire</button><button class="sdl-ghost" id="sdl-shufall">🔀 Aléatoire</button></div></div></div>' +
      '<div class="sdl-tracks">' + (cs.length ? cs.map(function (c, i) {
        var on = S.playing && S.playing.id === c.id;
        return '<button class="sdl-tr' + (on ? ' on' : '') + (o[c.id] ? ' sdl-orig' : '') + '" data-i="' + i + '"><span class="no">' + (on ? (S.loading ? '<span class="sdl-spin">⟳</span>' : '♪') : String(i + 1).padStart(3, '0')) + '</span>' +
          (c.img ? '<img loading="lazy" src="' + esc(c.img) + '">' : '<span></span>') +
          '<span style="min-width:0"><div class="tt">' + (o[c.id] ? '<span class="sdl-star">★ </span>' : '') + esc(c.title) + '</div><div class="tg">' + esc(c.tags) + '</div></span>' +
          '<span class="lk">' + (c.liked ? '♥' : '') + '</span><span class="du">' + fmt(c.d) + '</span></button>';
      }).join('') : '<div class="sdl-muted" style="padding:20px">' + (S.syncing ? 'Chargement…' : 'Aucun titre') + '</div>') + '</div>';
  }
  function renderPlayer() {
    var c = S.playing, a = audio(), w = c && S.ws.find(function (x) { return (S.clips[x.id] || []).some(function (y) { return y.id === c.id; }); });
    $('#sdl-now').innerHTML = c ? '<img src="' + esc(c.img) + '"><div style="min-width:0"><div class="t">' + esc(c.title) + '</div><div class="s">' + esc(w ? w.name : '') + '</div></div>' : '<div class="sdl-muted">Rien en lecture</div>';
    $('#sdl-pp').innerHTML = S.loading ? '<span class="sdl-spin">⟳</span>' : (a && !a.paused ? '⏸' : '▶');
    $('#sdl-shuf').classList.toggle('on', S.shuffle);
    var r = $('#sdl-rep'); r.classList.toggle('on', S.repeat !== 'off'); r.textContent = S.repeat === 'one' ? '🔂' : '🔁';
    $('#sdl-lyrbtn').classList.toggle('on', S.showLyr); $('#sdl-lyr').hidden = !S.showLyr;
    if (a) $('#sdl-vol').value = Math.round(a.volume * 100);
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

  /* ---------------------------------------------------------------- events */
  root.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.dataset.ws) { S.cur = t.dataset.ws; LS.set('cur', S.cur); renderWs(); renderTracks(); $('#sdl-mainin').parentNode.scrollTop = 0;
      if (!S.clips[S.cur]) fetchClips(S.cur).then(function (cs) { S.clips[S.cur] = cs; save(); renderTracks(); renderWs(); }); return; }
    if (t.dataset.i != null && t.classList.contains('sdl-tr')) return startQueue(viewClips(), +t.dataset.i, S.shuffle);
    switch (t.id) {
      case 'sdl-playall': return startQueue(viewClips(), 0, false);
      case 'sdl-shufall': return startQueue(viewClips(), Math.floor(Math.random() * viewClips().length), true);
      case 'sdl-pp': return toggle();
      case 'sdl-next': return next(false);
      case 'sdl-prev': return prev();
      case 'sdl-shuf': S.shuffle = !S.shuffle; LS.set('shuffle', S.shuffle); return renderPlayer();
      case 'sdl-rep': S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off'; LS.set('repeat', S.repeat); return renderPlayer();
      case 'sdl-lyrbtn': S.showLyr = !S.showLyr; LS.set('showLyr', S.showLyr); renderPlayer(); renderLyrics(); return;
      case 'sdl-follow': follow = true; t.hidden = true; lyrCur = -1; return tick();
      case 'sdl-sync': return sync(true);
      case 'sdl-hide': return show(false);
    }
  });
  $('#sdl-lyr-body').addEventListener('click', function (e) { var n = e.target.closest('.sdl-ly'); var a = audio(); if (!n || !a || !S.lyr || !S.lyr.lines) return; var l = S.lyr.lines[+n.dataset.i]; if (l) { a.currentTime = Math.max(0, l.s - 0.05); follow = true; } });
  ['wheel', 'touchmove'].forEach(function (ev) { $('#sdl-lyr-body').addEventListener(ev, function () { if (Date.now() > followUntil) { follow = false; $('#sdl-follow').hidden = false; } }, { passive: true }); });
  $('#sdl-wsq').addEventListener('input', function (e) { S.wsQ = e.target.value; renderWs(); });
  var sk = $('#sdl-seek');
  sk.addEventListener('input', function () { seeking = true; var a = audio(); if (a && isFinite(a.duration)) $('#sdl-t').textContent = fmt(a.duration * sk.value / 1000); });
  sk.addEventListener('change', function () { var a = audio(); if (a && isFinite(a.duration)) a.currentTime = a.duration * sk.value / 1000; seeking = false; });
  $('#sdl-vol').addEventListener('input', function (e) { var a = audio(); if (a) a.volume = e.target.value / 100; LS.set('vol', +e.target.value); });
  fab.addEventListener('click', function () { show(true); });
  document.addEventListener('keydown', function (e) {
    if (root.classList.contains('hide') || e.target.matches('input,textarea')) return;
    if (e.key === 'Escape') { show(false); e.preventDefault(); }
    else if (e.code === 'Space') { toggle(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowRight' && e.shiftKey) next(false);
    else if (e.key === 'ArrowLeft' && e.shiftKey) prev();
  }, true);

  window.__sdlSkin = { toggle: toggleUI, sync: sync, state: S, render: function () { renderWs(); renderTracks(); renderPlayer(); } };
  if (!S.cur && S.ws[0]) S.cur = S.ws[0].id;
  renderWs(); renderTracks(); renderPlayer(); renderLyrics();
  sync(false);
})();
