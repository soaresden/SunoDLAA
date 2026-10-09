/* SUNODLAA for suno.com - a nicer player and library manager, as an overlay on top of suno.com.
   Runs inside YOUR suno.com tab (bookmark). Tracks are played BY SUNO'S OWN PLAYER: the overlay
   opens the song in the page and presses Play, then only uses play / pause / seek / volume. It
   never copies or downloads audio. Changes (rename, move, delete, like) use the same Suno calls
   as the site itself, with your own session. */
(function () {
  'use strict';
  var VERSION = '2.13.0';
  // The bookmark fetches this script at each click: same version already open -> show/hide it;
  // older version open -> remove it and start this one (versions before 2.12 need a page reload).
  var prevSkin = window.__sdlSkin;
  if (prevSkin && prevSkin.version === VERSION) { prevSkin.toggle(); return; }
  // Not on suno.com: go there (click the bookmark again to open the player).
  if (!/(^|\.)suno\.com$/.test(location.hostname)) { location.href = 'https://suno.com/'; return; }
  if (prevSkin) {
    if (!prevSkin.destroy) { alert('SUNODLAA v' + VERSION + ' : nouvelle version. La page va se recharger, reclique ensuite sur le favori.'); location.reload(); return; }
    prevSkin.destroy();
  }
  // Everything hooked outside the overlay, so a newer version can unplug this one.
  var offs = [];
  function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); offs.push(function () { t.removeEventListener(ev, fn, o); }); }

  var THEMES = [{"id":"holi","name":"Holi","dark":false,"bg":"#FFF9FC","panel":"#FFFFFF","panel2":"#FBEAF3","line":"#EED5E3","txt":"#1B1B1F","mut":"#6E5566","acc":"#E81E8C","acc2":"#009B8E","acc3":"#F57C00","gold":"#C98A00","deco":["#E81E8C","#FFC400","#009B8E","#3D7BFF","#8B3DFF"]},{"id":"suno","name":"Orange Suno","dark":false,"bg":"#FFF8F1","panel":"#FFFFFF","panel2":"#FFEEDF","line":"#F4DCC8","txt":"#26180F","mut":"#8A6B57","acc":"#FF6B00","acc2":"#FF9A3D","acc3":"#E04E00","gold":"#C98A00","deco":["#FF6B00","#FFB36B","#FFD9B0"]},{"id":"plage","name":"Plage","dark":false,"bg":"#FCF5E8","panel":"#FFFDF8","panel2":"#F3E8D2","line":"#E8D8BA","txt":"#17384A","mut":"#6A8494","acc":"#0FA3B1","acc2":"#FF8A5B","acc3":"#F2C14E","gold":"#C98A00","deco":["#7FD6E3","#F9D9A6","#FFB38A"]},{"id":"bleu","name":"Bleu","dark":false,"bg":"#F3F7FF","panel":"#FFFFFF","panel2":"#E5EEFF","line":"#D2E0F6","txt":"#10203A","mut":"#5A6F8E","acc":"#2F6FED","acc2":"#00A6E8","acc3":"#6C5CE7","gold":"#C98A00","deco":["#8FB8FF","#A6E4FF","#C9C2FF"]},{"id":"amour","name":"Amoureux","dark":false,"bg":"#FFF4F6","panel":"#FFFFFF","panel2":"#FFE4EC","line":"#F6CFDB","txt":"#3A1222","mut":"#99667A","acc":"#E5305B","acc2":"#FF8FB1","acc3":"#B5179E","gold":"#C98A00","deco":["#FF8FB1","#FFC2D4","#E5305B"]},{"id":"ocean","name":"Deep Ocean","dark":true,"bg":"#03111E","panel":"#06192B","panel2":"#0A2540","line":"#123552","txt":"#E2F3FF","mut":"#7FA2BC","acc":"#1FD1C1","acc2":"#3B82F6","acc3":"#8BE9FD","gold":"#E3B341","deco":["#0B4F6C","#01295F","#1FD1C1"]},{"id":"feu","name":"Feu","dark":true,"bg":"#140703","panel":"#1E0C06","panel2":"#2B140B","line":"#3E1D10","txt":"#FFF0E5","mut":"#C79C83","acc":"#FF5A1F","acc2":"#FFC23D","acc3":"#E8311A","gold":"#FFC23D","deco":["#FF5A1F","#FFC23D","#8A1C0B"]},{"id":"nuit","name":"Nuit","dark":true,"bg":"#0D0D12","panel":"#15151D","panel2":"#1C1C26","line":"#262633","txt":"#ECEBF3","mut":"#8E8CA3","acc":"#FF4F8B","acc2":"#8A5CFF","acc3":"#E3B341","gold":"#E3B341","deco":["#8A5CFF","#FF4F8B"]},{"id":"ouistreham","name":"Ouistreham","dark":false,"bg":"#FAF6EE","panel":"#FFFFFF","panel2":"#F1EADB","line":"#D8CCB2","txt":"#1D2B44","mut":"#5B6A80","acc":"#1D4E89","acc2":"#C8102E","acc3":"#2C7DA0","gold":"#B8860B","deco":["#1D4E89","#C8102E","#2C7DA0","#FFD166"]},{"id":"violon","name":"Violon","dark":false,"bg":"#FBF5EC","panel":"#FFFDF9","panel2":"#F2E4CF","line":"#E3CBA8","txt":"#2B1A10","mut":"#7E6450","acc":"#A0461B","acc2":"#6B3E26","acc3":"#D99A3E","gold":"#B8860B","deco":["#D99A3E","#A0461B","#F2D3A1"]},{"id":"valse","name":"Valse","dark":false,"bg":"#FBF7F0","panel":"#FFFFFF","panel2":"#F3EAD9","line":"#E6D8BE","txt":"#2E2433","mut":"#7D6E80","acc":"#8E5BA8","acc2":"#C9A227","acc3":"#7FA7C9","gold":"#B8901C","deco":["#E8C9D6","#C9A227","#A9C4E0"]},{"id":"classique","name":"Classique","dark":false,"bg":"#FAF7F0","panel":"#FFFFFF","panel2":"#F1ECE0","line":"#E0D7C4","txt":"#1E1B16","mut":"#6F6758","acc":"#7A1F2B","acc2":"#1F3B5C","acc3":"#B08D3C","gold":"#A8842C","deco":["#E7D9B8","#7A1F2B","#1F3B5C"]},{"id":"country","name":"Country","dark":false,"bg":"#F7F0E3","panel":"#FFFDF8","panel2":"#EFE2CB","line":"#DCC8A6","txt":"#3B2A1A","mut":"#8A7158","acc":"#A0522D","acc2":"#6B8E23","acc3":"#C19A6B","gold":"#B8860B","deco":["#C19A6B","#A0522D","#6B8E23"]},{"id":"gameboy","name":"Game Boy","dark":false,"bg":"#9BBC0F","panel":"#B5CF4A","panel2":"#8BAC0F","line":"#6E8A0C","txt":"#0F380F","mut":"#306230","acc":"#0F380F","acc2":"#306230","acc3":"#9A2257","gold":"#306230","deco":["#306230","#8BAC0F","#0F380F"]},{"id":"retrowave","name":"Retro Wave","dark":true,"bg":"#120424","panel":"#1B0833","panel2":"#261047","line":"#3A1C66","txt":"#FCE9FF","mut":"#B79CD6","acc":"#FF2EA6","acc2":"#00E5FF","acc3":"#FFB800","gold":"#FFB800","deco":["#FF2EA6","#7B2CFF","#00E5FF","#FF6B35"]},{"id":"disco","name":"Disco","dark":true,"bg":"#140A1F","panel":"#1D0F2C","panel2":"#2A1640","line":"#3D2159","txt":"#FFF4FC","mut":"#C3A6D6","acc":"#FF3EC8","acc2":"#FFD23F","acc3":"#3DF5FF","gold":"#FFD23F","deco":["#FF3EC8","#FFD23F","#3DF5FF","#8A2BE2"]},{"id":"jazzy","name":"Jazzy","dark":true,"bg":"#15100C","panel":"#1E1712","panel2":"#2A2019","line":"#3B2E24","txt":"#F5E9D7","mut":"#B39C82","acc":"#D9A441","acc2":"#8C2F39","acc3":"#4F7CAC","gold":"#D9A441","deco":["#D9A441","#8C2F39","#2E4A6B"]},{"id":"lofi","name":"Lo-fi","dark":true,"bg":"#1B1A22","panel":"#23222C","panel2":"#2C2B37","line":"#3A3947","txt":"#EDE7F2","mut":"#A29CB0","acc":"#F2A7B4","acc2":"#9AD1D4","acc3":"#F6D186","gold":"#F6D186","deco":["#F2A7B4","#9AD1D4","#B8A9E3"]},{"id":"reggae","name":"Reggae","dark":true,"bg":"#0E120C","panel":"#161C12","panel2":"#1F2719","line":"#2E3A25","txt":"#F3F6EC","mut":"#A3AF92","acc":"#1FA34A","acc2":"#FCD116","acc3":"#E2231A","gold":"#FCD116","deco":["#1FA34A","#FCD116","#E2231A"]},{"id":"hardrock","name":"Hard Rock","dark":true,"bg":"#121212","panel":"#1C1A19","panel2":"#272320","line":"#3A332E","txt":"#F4EDE4","mut":"#A8998A","acc":"#D7261E","acc2":"#E8B04A","acc3":"#3B6EA8","gold":"#E8B04A","deco":["#D7261E","#E8B04A","#3B6EA8"]},{"id":"metal","name":"Metal","dark":true,"bg":"#0B0C0E","panel":"#141619","panel2":"#1C1F23","line":"#2C3036","txt":"#E8EBEF","mut":"#8D949E","acc":"#B3121D","acc2":"#AAB2BD","acc3":"#E4572E","gold":"#C9CFD6","deco":["#5A6270","#B3121D","#2A2F36"]},{"id":"punk","name":"Punk","dark":true,"bg":"#0C0C0C","panel":"#151515","panel2":"#1F1F1F","line":"#303030","txt":"#F5F5F5","mut":"#9E9E9E","acc":"#39FF14","acc2":"#FF1493","acc3":"#FFEA00","gold":"#FFEA00","deco":["#39FF14","#FF1493","#FFEA00"]},{"id":"emo","name":"Emo","dark":true,"bg":"#0A0A0A","panel":"#141414","panel2":"#1E1E1E","line":"#2E2E2E","txt":"#F2F2F2","mut":"#9A9A9A","acc":"#FF1F7A","acc2":"#7C3AED","acc3":"#9B5DE5","gold":"#FF8FB8","deco":["#FF1F7A","#7C3AED","#3A0CA3"]}];

  /* ================================================================ helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  var ALL = '__all__', EXP = '__explore__', CRE = '__create__';
  // Language of the computer/browser: French if it is French, English otherwise.
  var LANG = /^fr/i.test(navigator.language || '') ? 'fr' : 'en';
  var LOC = LANG === 'fr' ? 'fr-FR' : 'en-GB';
  function tr(fr, en) { return LANG === 'fr' ? fr : en; }
  function pl(n, fr1, frN, en1, enN) { return n + ' ' + (LANG === 'fr' ? (n > 1 ? frN : fr1) : (n === 1 ? en1 : enN)); }
  function fdate(iso, time) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' }) + (time ? ' ' + d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }) : ''); }
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('sdl_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('sdl_' + k, JSON.stringify(v, function (key, val) { return key === 'ws' && this && this.id && this.title !== undefined ? undefined : key === 'no' || key === '_i' || key === '_p' ? undefined : val; })); } catch (e) {} }
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
    /^\/api\/project\/[0-9a-f-]{36}\/metadata$/, /^\/api\/project\/trash$/, /^\/api\/project$/, /^\/api\/lyrics-projects$/, /^\/api\/lyrics-projects\/[0-9a-f-]{36}\/flush$/, /^\/api\/project\/([0-9a-f-]{36}|default)\/clips$/,
    /^\/api\/uploads\/audio\/$/, /^\/api\/uploads\/audio\/[0-9a-f-]{36}\/(upload-finish|initialize-clip)\/$/, /^\/api\/gen\/[0-9a-f-]{36}\/set_audio_description$/];
  async function write(path, body) {
    if (!WRITES.some(function (rx) { return rx.test(path); })) throw new Error('action non autorisée: ' + path);
    log('POST', path, JSON.stringify(body));
    return call('POST', path, body);
  }

  /* ================================================================ library (cached in this browser) */
  var S = {
    ws: LS.get('ws', []), clips: LS.get('clips', {}), par: LS.get('par', {}), parTried: LS.get('parTried', {}), markers: LS.get('markers', {}), pins: LS.get('pins', {}),
    cur: LS.get('cur', null) || '__all__', wsQ: '', tQ: '', filter: 'all', wsSort: LS.get('wsSort', 'recent'),
    queue: [], idx: -1, shuffle: LS.get('shuffle', false), repeat: LS.get('repeat', 'off'),
    playing: null, loading: false, lyr: null, showLyr: LS.get('showLyr', false), karaoke: false,
    exp: { feeds: [], cursor: 0, done: false, loading: false }, pls: {},
    sel: {}, syncing: false, err: '', theme: LS.get('theme', 'holi'), sort: LS.get('sort', 'no')
  };
  function slim(c) { var m = c.metadata || {}; return { id: c.id, title: c.title || tr('Sans titre', 'Untitled'), at: c.created_at || '', d: m.duration || 0, tags: m.tags || '', cover: m.cover_clip_id || '', img: c.image_url || '', imgL: c.image_large_url || c.image_url || '', liked: !!c.is_liked, ty: m.type || '', tk: m.task || '', ed: m.edited_clip_id || '', sf: m.stem_from_id || '', us: m.upsample_clip_id || '', op: m.overpainting_clip_id || '', hv: m.has_vocal === true ? true : (m.has_vocal === false || m.make_instrumental === true) ? false : null, prompt: m.prompt || '', author: c.display_name || c.handle || '', plays: c.play_count || 0 }; }
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
  var clipIdx = null;
  function findClip(id) {
    if (!clipIdx) { clipIdx = {}; for (var k0 in S.clips) S.clips[k0].forEach(function (x) { clipIdx[x.id] = x; }); }
    if (clipIdx[id]) return clipIdx[id];
    var f = function (x) { return x.id === id; }, c;
    for (var k in S.clips) { c = S.clips[k].find(f); if (c) return c; }
    for (var p in S.pls) { c = (S.pls[p].clips || []).find(f); if (c) return c; }
    for (var i = 0; i < S.exp.feeds.length; i++) { c = S.exp.feeds[i].clips.find(f); if (c) return c; }
    return null;
  }
  function isMine(c) { return !!wsOf(c.id); }
  // Voice or instrumental: Suno's own flag when it gives one, else its style ("Instrumental …") or empty / [Instrumental] lyrics.
  function isInstru(c) {
    if (c.hv === true) return false; if (c.hv === false) return true;
    return /\binstrumental\b/i.test(c.tags || '') || /^\s*(\[\s*instrumental\s*\])?\s*$/i.test(c.prompt || '');
  }
  function voiceIcon(c) { var i = isInstru(c); return '<span class="vx" title="' + (i ? tr('Instrumental', 'Instrumental') : tr('Avec voix', 'With vocals')) + '">' + (i ? '🎼' : '🗣️') + '</span>'; }
  // Pinned tracks are per workspace (Suno shows them on top of it).
  function isPinned(c, w) { w = w || c.ws || wsOf(c.id); return !!w && (S.pins[w.id] || []).indexOf(c.id) >= 0; }
  async function loadPins(id) {
    try { var d = await api('/api/project/' + id + '/pinned-clips'); S.pins[id] = (d.pinned_clips || []).map(function (c) { return c.id; }); LS.set('pins', S.pins); if (S.cur === id || S.cur === ALL) renderTracks(); }
    catch (e) { log('pins failed', id, e.message); }
  }

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
  /* ---- Create: a compact form that fills Suno's own Create page and presses its button ---- */
  var D = LS.get('draft', { title: '', style: '', exclude: '', lyrics: '' });
  function saveDraft() { LS.set('draft', D); }
  function setNative(el, v) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function sunoForm() {
    var vis = function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    var outside = function (e) { return !root.contains(e); };
    var inputs = $$('input[type=text]').filter(outside).filter(vis);
    var areas = $$('textarea').filter(outside).filter(vis);
    return {
      title: inputs.find(function (e) { return /titre|title/i.test(e.placeholder || ''); }),
      lyrics: $$('[contenteditable="true"][role="textbox"],[contenteditable="true"]').filter(outside).filter(vis)[0],
      style: areas.find(function (e) { return e.maxLength === 1000 && !/^(ton|tone)$/i.test(e.placeholder || ''); }),
      exclude: inputs.find(function (e) { return /exclu/i.test(e.placeholder || ''); }),
      create: $$('button').filter(outside).filter(vis).find(function (b) { return /^(cr[ée]er la chanson|create song|create)$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()); }),
      styles: $$('button[aria-label]').filter(outside).map(function (b) { var m = (b.getAttribute('aria-label') || '').match(/^(?:Ajouter le style|Add style)\s*:\s*(.+)$/i); return m ? { name: m[1], b: b } : null; }).filter(Boolean)
    };
  }
  async function waitForm() {
    if (location.pathname.indexOf('/create') !== 0 && window.next && window.next.router) window.next.router.push('/create');
    for (var i = 0; i < 40; i++) { var f = sunoForm(); if (f.style && f.lyrics) return f; await sleep(400); }
    var f2 = sunoForm(); log('create form not found', { title: !!f2.title, lyrics: !!f2.lyrics, style: !!f2.style, create: !!f2.create }); return f2;
  }
  function fillLyrics(el, text) {
    el.focus();
    try { document.execCommand('selectAll', false, null); } catch (e) {}
    var ok = false;
    try { var dt = new DataTransfer(); dt.setData('text/plain', text); ok = !el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) {}
    if (!ok || (el.innerText || '').trim() !== text.trim()) { try { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, text); } catch (e) {} }
    log('lyrics filled', (el.innerText || '').length, 'chars');
  }
  async function sendToSuno(press) {
    readCreate(); saveDraft();
    if (!D.style.trim() && !D.lyrics.trim()) return toast(tr('Mets au moins un style ou des paroles.', 'Add at least a style or lyrics.'));
    toast(tr('Remplissage du formulaire Suno…', 'Filling Suno\'s form…'));
    var f = await waitForm();
    if (!f.style || !f.lyrics) { toast(tr('Je ne trouve pas le formulaire de Suno (mode Avancé ?). Regarde la console (F12).', 'Can\'t find Suno\'s form (Advanced mode?). See the console (F12).'), 7000); return; }
    if (f.title) setNative(f.title, D.title);
    setNative(f.style, D.style);
    if (f.exclude) setNative(f.exclude, D.exclude);
    fillLyrics(f.lyrics, D.lyrics);
    await setVoiceOnSuno();
    await sleep(600);
    if (!press) { show(false); toast(tr('Formulaire rempli : vérifie et clique sur Créer chez Suno.', 'Form filled: check it and click Create on Suno.'), 6000); return; }
    f = sunoForm();
    if (!f.create) { show(false); toast(tr('Bouton Créer introuvable : clique dessus toi-même.', 'Create button not found: click it yourself.'), 7000); return; }
    log('click Create'); f.create.click();
    toast(tr('Création lancée chez Suno ✨', 'Creation started on Suno ✨'), 5000);
    setTimeout(function () { sync(false); }, 20000);
  }
  function readCreate() { ['title', 'style', 'exclude', 'lyrics'].forEach(function (k) { var e = $('#sdl-c-' + k); if (e) D[k] = e.value; }); }
  async function loadStyleIdeas() { if (!(await token())) return; var f = await waitForm(); S.styleIdeas = (f.styles || []).map(function (x) { return x.name; }); if (S.cur === CRE) renderCreate($('#sdl-mainin')); }
  /* style building blocks: label shown in the user's language, text sent to Suno in English (what Suno understands best) */
  var STYLE_BLOCKS = [
    [tr('Genre', 'Genre'), [['pop'], ['rock'], ['synthwave'], ['lo-fi'], ['jazz'], ['metal'], ['orchestral', tr('orchestral', 'orchestral')], ['chiptune'], ['hip-hop'], ['house'], ['ambient'], ['folk'], ['gospel'], ['reggae'], ['punk'], ['R&B'], ['electro swing'], ['bossa nova']]],
    [tr('Ambiance', 'Mood'), [['epic', tr('épique', 'epic')], ['melancholic', tr('mélancolique', 'melancholic')], ['uplifting', tr('joyeux', 'uplifting')], ['dark', tr('sombre', 'dark')], ['dreamy', tr('rêveur', 'dreamy')], ['energetic', tr('énergique', 'energetic')], ['romantic', tr('romantique', 'romantic')], ['chill', 'chill'], ['cinematic', tr('cinématique', 'cinematic')], ['nostalgic', tr('nostalgique', 'nostalgic')]]],
    [tr('Voix', 'Voice'), [['female vocals', tr('voix féminine', 'female vocals')], ['male vocals', tr('voix masculine', 'male vocals')], ['duet', tr('duo', 'duet')], ['choir', tr('chœur', 'choir')], ['whispered vocals', tr('voix chuchotée', 'whispered')], ['instrumental', tr('instrumental', 'instrumental')]]],
    [tr('Rythme & instruments', 'Tempo & instruments'), [['80 bpm'], ['110 bpm'], ['140 bpm'], ['piano'], ['violin', tr('violon', 'violin')], ['acoustic guitar', tr('guitare acoustique', 'acoustic guitar')], ['electric guitar', tr('guitare électrique', 'electric guitar')], ['strings', tr('cordes', 'strings')], ['808'], ['synth bass', tr('basse synthé', 'synth bass')], ['brass', tr('cuivres', 'brass')]]]
  ];
  var SECTIONS = [['[Intro]'], ['[Verse]', tr('Couplet', 'Verse')], ['[Pre-Chorus]', tr('Pré-refrain', 'Pre-chorus')], ['[Chorus]', tr('Refrain', 'Chorus')], ['[Bridge]', tr('Pont', 'Bridge')], ['[Instrumental]', tr('Instru', 'Instrumental')], ['[Outro]']];
  function styleHas(x) { return ('|' + D.style.split(',').map(function (t) { return norm(t).trim(); }).join('|') + '|').indexOf('|' + norm(x) + '|') >= 0; }
  function toggleStyle(x) {
    readCreate();
    var parts = D.style.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var k = parts.findIndex(function (t) { return norm(t) === norm(x); });
    if (k >= 0) parts.splice(k, 1); else parts.push(x);
    D.style = parts.join(', '); saveDraft(); renderCreate($('#sdl-mainin'));
  }
  // Suno's own saved lyrics ("Paroles enregistrées"): the same drafts on suno.com and here.
  async function loadDrafts() { try { var d = await api('/api/lyrics-projects?limit=50&sort=updated_at'); S.drafts = d.projects || []; } catch (e) { S.drafts = S.drafts || []; } if (S.cur === CRE) renderCreate($('#sdl-mainin')); }
  var flushT = null;
  function flushDraft() {
    clearTimeout(flushT); if (!D.pid) return;
    flushT = setTimeout(function () { write('/api/lyrics-projects/' + D.pid + '/flush', { lyrics: D.lyrics }).then(function () { var x = (S.drafts || []).find(function (p) { return p.id === D.pid; }); if (x) x.lyrics = D.lyrics; }).catch(function () {}); }, 1500);
  }
  async function newDraft() {
    readCreate();
    try { var r = await write('/api/lyrics-projects', { title: D.title || tr('Sans titre', 'Untitled') }); D.pid = r.id; if (D.lyrics) await write('/api/lyrics-projects/' + r.id + '/flush', { lyrics: D.lyrics }); saveDraft(); await loadDrafts(); toast(tr('Brouillon enregistré chez Suno', 'Draft saved on Suno')); }
    catch (e) { toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 6000); }
  }
  function renderCreate(el) {
    var cnt = function (id, v, m) { return '<span class="sdl-cnt" id="sdl-n-' + id + '">' + (v || '').length + ' / ' + m + '</span>'; };
    var voice = D.voice || 'auto';
    el.innerHTML = '<div class="sdl-create">' +
      // drafts
      '<aside class="sdl-card2 sdl-drafts"><div class="sdl-h2">📝 ' + tr('Mes paroles', 'My lyrics') + '</div>' +
        '<button class="sdl-ghost" data-act="dnew" style="width:100%;margin-bottom:8px">＋ ' + tr('Sauver le brouillon', 'Save draft') + '</button>' +
        '<div class="sdl-dlist">' + ((S.drafts || []).map(function (p) { return '<button class="sdl-draft' + (p.id === D.pid ? ' on' : '') + '" data-draft="' + p.id + '"><b>' + esc(p.title || tr('Sans titre', 'Untitled')) + '</b><span>' + esc((p.lyrics || '').replace(/\s+/g, ' ').slice(0, 70)) + '</span></button>'; }).join('') || '<div class="sdl-muted" style="font-size:13px">' + (S.drafts ? tr('Aucun brouillon. Ceux de « Paroles enregistrées » sur Suno apparaissent ici.', 'No draft yet. Your “Saved lyrics” on Suno show up here.') : '…') + '</div>') + '</div></aside>' +
      // form
      '<section class="sdl-card2 sdl-form">' +
        '<div class="sdl-step"><span class="n">1</span><div style="flex:1"><div class="sdl-h2">' + tr('Le titre', 'The title') + ' ' + cnt('title', D.title, 100) + '</div><input id="sdl-c-title" maxlength="100" value="' + esc(D.title) + '" placeholder="' + tr('Facultatif : Suno en trouve un sinon', 'Optional: Suno picks one otherwise') + '"></div></div>' +
        '<div class="sdl-step"><span class="n">2</span><div style="flex:1;min-width:0"><div class="sdl-h2">' + tr('Le style', 'The style') + ' ' + cnt('style', D.style, 1000) + '</div>' +
          '<textarea id="sdl-c-style" maxlength="1000" rows="2" placeholder="' + tr('Clique sur les étiquettes ci-dessous, ou écris librement', 'Click the tags below, or type freely') + '">' + esc(D.style) + '</textarea>' +
          STYLE_BLOCKS.map(function (g) { return '<div class="sdl-tagrow"><span>' + g[0] + '</span>' + g[1].map(function (x) { return '<button class="sdl-tag' + (styleHas(x[0]) ? ' on' : '') + '" data-style="' + esc(x[0]) + '">' + esc(x[1] || x[0]) + '</button>'; }).join('') + '</div>'; }).join('') +
          ((S.styleIdeas || []).length ? '<div class="sdl-tagrow"><span>' + tr('Idées Suno', 'Suno ideas') + '</span>' + S.styleIdeas.slice(0, 14).map(function (x) { return '<button class="sdl-tag' + (styleHas(x) ? ' on' : '') + '" data-style="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
          '<details class="sdl-more"><summary>' + tr('À éviter (facultatif)', 'Avoid (optional)') + '</summary><input id="sdl-c-exclude" maxlength="1000" value="' + esc(D.exclude) + '" placeholder="' + tr('ex. autotune, batterie', 'e.g. autotune, drums') + '"></details></div></div>' +
        '<div class="sdl-step"><span class="n">3</span><div style="flex:1"><div class="sdl-h2">' + tr('La voix', 'The voice') + '</div><div class="sdl-seg">' +
          [['auto', tr('Au choix de Suno', 'Suno decides')], ['f', tr('Femme', 'Female')], ['m', tr('Homme', 'Male')]].map(function (x) { return '<button class="' + (voice === x[0] ? 'on' : '') + '" data-voice="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
      '</section>' +
      // lyrics
      '<section class="sdl-card2 sdl-lyrics"><div class="sdl-h2" style="display:flex;align-items:center;gap:8px"><span class="n" style="position:static">4</span>' + tr('Les paroles', 'The lyrics') + ' ' + cnt('lyrics', D.lyrics, 5000) + '<span style="flex:1"></span>' + (D.pid ? '<span class="sdl-muted" style="font-size:12px">☁ ' + tr('synchronisé avec Suno', 'synced with Suno') + '</span>' : '') + '</div>' +
        '<div class="sdl-sec">' + SECTIONS.map(function (x) { return '<button class="sdl-tag" data-sec="' + x[0] + '">' + esc(x[1] || x[0].replace(/[\[\]]/g, '')) + '</button>'; }).join('') + '</div>' +
        '<textarea id="sdl-c-lyrics" maxlength="5000" placeholder="' + tr('Écris tes paroles ici.\nLes boutons au-dessus ajoutent [Couplet], [Refrain]… là où est ton curseur.\n\nLaisse vide pour un instrumental ou des paroles écrites par Suno.', 'Write your lyrics here.\nThe buttons above add [Verse], [Chorus]… where your cursor is.\n\nLeave empty for an instrumental or lyrics written by Suno.') + '">' + esc(D.lyrics) + '</textarea></section>' +
      // action bar
      '<div class="sdl-cbar"><span class="sdl-muted" style="font-size:13px;flex:1">' + tr('SUNODLAA remplit la page Créer de Suno (mode Avancé). Modèle, curseurs et espace cible : réglés sur leur page, ils restent.', 'SUNODLAA fills Suno\'s Create page (Advanced mode). Model, sliders and target workspace: set on their page, they stay.') + '</span>' +
        '<button class="sdl-ghost" data-act="clear">' + tr('Tout effacer', 'Clear all') + '</button><button class="sdl-ghost" data-act="fill">👀 ' + tr('Remplir et vérifier', 'Fill and check') + '</button><button class="sdl-big" data-act="create">✨ ' + tr('Créer', 'Create') + '</button></div>' +
      '</div>';
    ['title', 'style', 'exclude', 'lyrics'].forEach(function (k) { var e = $('#sdl-c-' + k); if (!e) return; e.oninput = function () { D[k] = e.value; saveDraft(); var n = $('#sdl-n-' + k); if (n) n.textContent = e.value.length + ' / ' + e.maxLength; if (k === 'lyrics') flushDraft(); if (k === 'style') $$('.sdl-tag[data-style]').forEach(function (b) { b.classList.toggle('on', styleHas(b.dataset.style)); }); }; });
    if (!S.drafts) loadDrafts();
  }
  function insertSection(tag) {
    var e = $('#sdl-c-lyrics'); if (!e) return;
    var a = e.selectionStart, b = e.selectionEnd, v = e.value, before = v.slice(0, a), ins = (before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? '\n' : '\n\n') : '') + tag + '\n';
    e.value = before + ins + v.slice(b); e.focus(); e.selectionStart = e.selectionEnd = a + ins.length; e.oninput();
  }
  async function setVoiceOnSuno() {
    if (!D.voice || D.voice === 'auto') return;
    var want = D.voice === 'f' ? /^(femme|female)$/i : /^(homme|male)$/i;
    var b = $$('button').filter(function (x) { return !root.contains(x); }).find(function (x) { return want.test((x.innerText || '').trim()); });
    if (b) { b.click(); log('voice set', D.voice); } else log('voice button not found');
  }
  function openView(id) { S.cur = id; S.tQ = ''; S.filter = 'all'; S.limit = 400; renderWs(); renderTracks(); $('#sdl-mainin').scrollTop = 0;
    if (id === EXP && !S.exp.feeds.length) loadExplore();
    if (id === CRE && !S.styleIdeas) loadStyleIdeas();
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
  function save() { numsCache = {}; sugCache = {}; genCache = {}; clipIdx = null; LS.set('ws', S.ws); LS.set('clips', S.clips); LS.set('markers', S.markers); LS.set('pins', S.pins); }

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
        try { S.clips[w.id] = await fetchClips(w.id); S.markers[w.id] = w.marker; if (w.id !== S.cur) await loadPins(w.id); } catch (e) { log('workspace failed', w.name, e.message); }
        S.syncInfo = (i + 1) + '/' + todo.length; renderStatus();
        if (w.id === S.cur) renderTracks();
        if (i % 5 === 4) { renderWs(); save(); }
      }
      save(); renderWs(); renderTracks();
      if (S.cur !== ALL && ids[S.cur]) loadPins(S.cur);
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
  // Suno's own playbar (bottom of suno.com): the track it holds, and its buttons ("Playbar: Next Song button"...).
  var UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  // The playbar = the block around its progress slider that holds a song link and the transport buttons (any site language).
  function barRoot() {
    var rs = $$('input[type=range]').filter(function (r) { return !root.contains(r); });
    for (var i = 0; i < rs.length; i++) for (var e = rs[i].parentElement, k = 0; e && k < 8; e = e.parentElement, k++) if (e.querySelector('a[href^="/song/"]') && e.querySelectorAll('button').length >= 4) return e;
    return null;
  }
  function barSongId() {
    var br = barRoot(), a = br && br.querySelector('a[href^="/song/"]');
    if (!a) a = $$('a[href^="/song/"]').filter(function (x) { return !root.contains(x); }).find(function (x) { return /^(playbar|barre|lecteur)/i.test(x.getAttribute('aria-label') || ''); });
    var m = a && (a.getAttribute('href') || '').match(UUID); return m ? m[0] : null;
  }
  // Transport buttons by label ("Playbar: Next Song button"...), else by place: shuffle, previous, play/pause, next, repeat.
  function barBtn(rx, pos) {
    var br = barRoot(), bs = br ? $$('button', br) : $$('button[aria-label]').filter(function (b) { return !root.contains(b) && /^(playbar|barre|lecteur)/i.test(b.getAttribute('aria-label') || ''); });
    return bs.find(function (b) { return rx.test((b.getAttribute('aria-label') || '').replace(/^[^:]*:\s*/, '')); }) || (br && bs.length >= 5 ? bs[pos] : null) || null;
  }
  // Suno -> SUNODLAA: whatever suno.com's player holds is shown here (title, cover, time, lyrics).
  var following = null;
  async function followSuno() {
    if (S.loading || following) return;
    var id = barSongId(); if (!id || (S.playing && S.playing.id === id)) return;
    following = id;
    var c = findClip(id);
    if (!c) { try { c = slim(await callPublic('GET', '/api/clip/' + id)); } catch (e) { var md = navigator.mediaSession && navigator.mediaSession.metadata; c = { id: id, title: (md && md.title) || '…', author: (md && md.artist) || '', img: md && md.artwork && md.artwork[0] ? md.artwork[0].src : '', imgL: '', d: 0, tags: '', at: '', prompt: '' }; } }
    following = null;
    if (S.loading || barSongId() !== id) return;
    var k = S.queue.findIndex(function (x) { return x.id === id; });
    if (k >= 0) { S.idx = k; S.ext = false; } else { S.queue = [c]; S.idx = 0; S.ext = true; }   // ext: started on suno.com, Suno's queue leads
    S.playing = c; log('following Suno player', c.title, id); loadLyrics(c); renderPlayer();
  }
  var playToken = 0;
  async function playIdx(i) {
    if (i < 0 || i >= S.queue.length) return;
    S.idx = i; var c = S.queue[i]; S.playing = c; S.ext = false; var my = ++playToken;
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
    if (S.ext) { if (!auto) { var nb = barBtn(/next|suivant/i, 3); if (nb) nb.click(); } return; }   // Suno moves on by itself
    if (!S.queue.length) return;
    if (auto && S.repeat === 'one') return playIdx(S.idx);
    var n = S.idx + 1;
    if (n >= S.queue.length) { if (S.repeat === 'all') n = 0; else { renderPlayer(); return; } }
    playIdx(n);
  }
  function prev() { var a = audio(); if (a && a.currentTime > 4) { a.currentTime = 0; return; } if (S.ext) { var pb = barBtn(/previous|pr[ée]c[ée]dent/i, 1); if (pb) pb.click(); return; } if (S.idx > 0) playIdx(S.idx - 1); }
  function toggle() {
    var a = audio(); if (!a || !S.playing) { if (S.queue.length) playIdx(Math.max(0, S.idx)); else startQueue(viewClips(), 0, S.shuffle); return; }
    var b = barBtn(/^(play|pause|lire|lecture|reprendre|mettre en pause)\b/i, 2);   // Suno's own button keeps its playbar in step
    if (b) b.click(); else if (a.paused) a.play(); else a.pause();
  }
  function applyVolume() { var a = audio(), v = LS.get('vol', null); if (a && v != null) a.volume = v / 100; }
  on(document, 'ended', function (e) { if (e.target === audio() && S.playing && !S.loading) next(true); }, true);
  ['play', 'pause', 'playing'].forEach(function (ev) { on(document, ev, function (e) { if (e.target === audio()) { renderPlayer(); if (ev !== 'pause') setTimeout(followSuno, 300); } }, true); });
  on(document, 'timeupdate', function (e) { if (e.target === audio()) tick(); }, true);

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
  function lrcTime(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), sec = t - m * 60; return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2); }
  async function saveLrc(c) {
    try {
      var lines = S.playing === c && S.lyr && S.lyr.lines ? S.lyr.lines : buildLines(await api('/api/gen/' + c.id + '/aligned_lyrics/v2/'));
      lines = lines.filter(function (l) { return !l.sec && l.t; });
      if (!lines.length) return toast(tr('Pas de paroles synchronisées pour ce titre', 'No synced lyrics for this track'), 5000);
      var head = ['[ti:' + c.title + ']', c.author ? '[ar:' + c.author + ']' : '', c.d ? '[length:' + fmt(c.d) + ']' : '', '[re:SUNODLAA v' + VERSION + ']'].filter(Boolean);
      var txt = head.concat(lines.map(function (l) { return '[' + lrcTime(l.s) + ']' + l.t; })).join('\r\n') + '\r\n';
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
      a.download = (c.title || 'paroles').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) + '.lrc';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast(tr('Paroles enregistrées : ', 'Lyrics saved: ') + a.download);
    } catch (e) { toast(tr('Paroles indisponibles : ', 'Lyrics unavailable: ') + e.message, 6000); }
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
        : '<div class="sdl-ly" data-i="' + i + '" title="' + tr('Aller à ', 'Jump to ') + fmt(l.s) + '"><span class="tc">' + fmt(l.s) + '</span>' + (l.words ? l.words.map(function (w, j) { return '<span class="w" data-j="' + j + '">' + esc(w.w) + '</span>'; }).join('') : esc(l.t)) + '</div>';
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

  /* ================================================================ title cleaning */
  function cleanTitle(t0) {
    var s = (t0 || '');
    s = s.replace(/^\s*(?:spoti\w*|y2mate|savefrom|mp3\w*)\.(?:io|com|cc|net|to)\s*-\s*/i, '');   // download sites
    s = s.replace(/\s*\(?[\w-]+\.(?:cc|io|com|net|to)\)?\s*$/i, '').replace(/\s*\[\s*\w*mp3\w*[^\]]*\]?/gi, '');
    s = s.replace(/\s*\((?:(?:clip|vid[ée]o)\s*)?officiel+e?\)|\s*\(official[^)]*\)|\s*\((?:lyrics?|paroles|audio|hd|hq)\)|\s*\(remaster(?:ed)?\)|\s*\(add vocal\)|\s*\(mashup\)/gi, '');
    s = s.replace(/^\s*\[temp\]\s*-\s*/i, '');
    s = s.replace(/^\s*\d{1,2}-\d{2,3}\s*(?:-\s*)?(?=\S)/, '');
    s = s.replace(/(^|[_\s-])(?:dur[ée]e|duration)?[_\s-]?\d{1,2}m\d{1,2}s(?=[_\s-]|\(|$)/gi, ' ');
    s = s.replace(/(^|[_\s-])x\d+(?:[.,]\d+)?(?=[_\s-]|\(|$)/gi, ' ');
    s = s.replace(/\s*\((?:edit|edited|clean|temp)\)/gi, '');
    s = s.replace(/^[\s_]*\d{1,2}-\d{2,3}\s*(?:-\s*)?(?=\S)/, '');
    s = s.replace(/(\s(?:x|&|-|\+|vs\.?)\s+)\d{2}-\d{3}\s+(?=\S)/gi, '$1');
    s = s.replace(STEM_RX, '').replace(/^\s*!+/, '');
    s = s.replace(/_+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—.,]+|[\s\-–—.,]+$/g, '').trim();
    return s || (t0 || '');
  }
  var STEM_RX = /\s*(?:\((woodwinds|brass|fx|synth|strings|percussion|drums|bass|vocals|backing vocals|guitar|keyboard|piano|other)\)|-\s*(vocals|instrumental))\s*$/i;
  function badTitle(t) { return !t || /^[a-z]:\\/i.test(t) || /^(untitled|sans titre|replace \d)/i.test(t); }

  /* ---- what kind of track: Suno's metadata.type / task. One fixed hue each, lightness follows the theme. */
  var CATS = {
    create: [42, 'Création', 'Creation'], cover: [205, 'Cover', 'Cover'], vcover: [218, 'Cover voix', 'Voice Cover'], edit: [275, 'Edit', 'Edit'],
    upload: [162, 'Upload', 'Upload'], stem: [22, 'Stem', 'Stem'], sfx: [0, 'SFX', 'SFX'], extend: [125, 'Extend', 'Extend'],
    full: [240, 'Complet', 'Full'], remaster: [186, 'Remaster', 'Remaster'], inspo: [300, 'Inspo', 'Inspo'], mashup: [330, 'Mashup', 'Mashup'], fix: [85, 'Retouche', 'Fix']
  };
  function catOf(c) {
    var ty = c.ty, tk = c.tk;
    if (ty === undefined) return c.cover ? 'cover' : null;   // cached before 2.13, until the next sync
    if (ty === 'upload') return 'upload'; if (ty === 'edit_v3_export') return 'edit'; if (ty === 'stem') return 'stem'; if (ty === 'upsample') return 'remaster';
    if (ty === 'concat' || ty === 'concat_infilling') return 'full'; if (ty === 'rendered_context_window') return 'fix';
    return { cover: 'cover', '': 'create', gen_stem: 'stem', sound: 'sfx', extend: 'extend', upload_extend: 'extend', playlist_condition: 'inspo',
      mashup_condition: 'mashup', fixed_infill: 'fix', overpainting: 'fix', vox_cover: 'vcover' }[tk] || (ty === 'gen' ? 'create' : null);
  }
  function fixLabel(c) { return { fixed_infill: 'Replace', overpainting: 'Add Vocal' }[c.tk] || (c.ty === 'rendered_context_window' ? 'Section' : ''); }
  function catLabel(k, lang) { var d = CATS[k]; return d ? ((lang || LANG) === 'fr' ? d[1] : d[2]) : ''; }
  // Where a track comes from: up the cover / edit / stem / remaster links to the first track (parents no longer in the library are fetched once).
  function parentIds(c) { return [c.cover, c.ed, c.sf, c.us, c.op].filter(function (x) { return x && x !== c.id; }); }
  function clipOrPar(id) { return findClip(id) || S.par[id] || null; }
  function rootOf(c) {
    for (var i = 0, cur = c; i < 12; i++) {
      var ps = parentIds(cur), nx = null;
      for (var j = 0; j < ps.length && !nx; j++) nx = clipOrPar(ps[j]);
      if (!nx) return { c: cur, lost: ps.length > 0 };
      cur = nx;
    }
    return { c: cur, lost: false };
  }
  function originOf(c) { var r = rootOf(c), k = r.lost ? null : catOf(r.c); return k === 'create' ? 'prompt' : k === 'upload' ? 'upload' : null; }
  async function fetchParents() {
    var miss = {}; Object.keys(S.clips).forEach(function (k) { S.clips[k].forEach(function (c) { parentIds(c).forEach(function (id) { if (!clipOrPar(id)) miss[id] = 1; }); }); });
    var ids = Object.keys(miss).filter(function (id) { return !S.parTried[id]; }); if (!ids.length) return;
    log('fetching', ids.length, 'source tracks no longer in the library');
    for (var i = 0; i < ids.length; i++) {
      S.parTried[ids[i]] = 1;
      try { var x = slim(await api('/api/clip/' + ids[i])); S.par[x.id] = { id: x.id, title: x.title, ty: x.ty, tk: x.tk, cover: x.cover, ed: x.ed, sf: x.sf, us: x.us, op: x.op, at: x.at }; } catch (e) {}
      if (i % 20 === 19) { LS.set('par', S.par); renderTracks(); }
      await sleep(150);
    }
    LS.set('par', S.par); LS.set('parTried', S.parTried); sugCache = {}; renderTracks();
  }
  function catBadge(c) {
    var k = catOf(c); if (!k) return '';
    var o = originOf(c), r = rootOf(c).c, lab = k === 'fix' ? (fixLabel(c) || catLabel(k)) : catLabel(k);
    var tip = catLabel(k) + (r !== c ? tr(' · issu de « ', ' · from "') + r.title + tr(' »', '"') : '') + (o === 'prompt' ? tr(' · création au prompt', ' · prompt creation') : o === 'upload' ? tr(' · à partir d\'un upload', ' · from an upload') : '');
    return '<span class="sdl-cat" style="--h:' + CATS[k][0] + '" title="' + esc(tip) + '">' + (o === 'prompt' && k !== 'create' ? '✨' : '') + esc(lab) + '</span>';
  }

  /* ---- naming rules (adjustable in the renamer, saved in this browser) */
  var RULES = (function () {
    var d = { lang: LANG, sep: ' - ', style: 32, num: true, types: {} };
    Object.keys(CATS).forEach(function (k) { d.types[k] = k !== 'create'; });
    var r = LS.get('rules', null); if (r) { for (var k in r) if (k !== 'types') d[k] = r[k]; for (var t in (r.types || {})) d.types[t] = r.types[t]; }
    return d;
  })();
  function saveRules() { LS.set('rules', RULES); sugCache = {}; }
  var sugCache = {}, genCache = {};
  // Suno creates tracks two by two: tracks of a workspace created within 20 s of each other = one generation.
  function gens(wsId) {
    if (genCache[wsId]) return genCache[wsId];
    var cs = (S.clips[wsId] || []).slice().sort(function (a, b) { return a.at.localeCompare(b.at) || (a.id < b.id ? -1 : 1); }), out = {}, cur = null;
    cs.forEach(function (c) {
      var t = Date.parse(c.at) || 0;
      if (!cur || !t || t - cur.t > 20000) cur = { t: t, list: [] };
      cur.list.push(c); out[c.id] = cur;
    });
    return (genCache[wsId] = out);
  }
  function genOf(c) { var w = c.ws || wsOf(c.id), g = w && gens(w.id)[c.id]; return g && g.list.length > 1 ? g : null; }
  function styleShort(tags, n) {
    n = n == null ? 32 : n; if (!n) return '';
    var t = String(tags || '').split(/[,;.]/)[0].replace(/^\s*(?:this is |it's |a |an |the )+/i, '').replace(/\s+(?:featuring|with|led by|built on|driven by)\b.*$/i, '').replace(/\s+/g, ' ').trim();
    if (t.length > n) { t = t.slice(0, n + 1); var sp = t.lastIndexOf(' '); t = t.slice(0, sp > 12 ? sp : n); }
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  // "<original title><sep><type> <style or stem part> #n", following RULES.
  function nameOf(c, R, wsName) {
    var k = catOf(c), own = k === 'create' || k === 'sfx' || k === 'mashup' || !k;
    var base = cleanTitle(own ? c.title : rootOf(c).c.title);
    if (badTitle(base)) base = cleanTitle(c.title); if (badTitle(base)) base = wsName || base;
    var detail = '';
    if (k === 'cover' || k === 'vcover' || k === 'inspo') { var st = styleShort(c._st != null ? c._st : c.tags, R.style); if (st && norm(base).indexOf(norm(st)) < 0) detail = st; }
    else if (k === 'stem') { var m = String(c.title || '').match(STEM_RX); detail = m ? (m[1] || m[2]).replace(/\b\w/g, function (x) { return x.toUpperCase(); }) : ''; }
    else if (k === 'fix') detail = fixLabel(c);
    var lab = k && R.types[k] ? (k === 'fix' ? '' : catLabel(k, R.lang)) : '';
    if (k === 'fix' && !R.types.fix) detail = '';
    var tail = [lab, detail].filter(Boolean).join(' ');
    return (base + (tail ? R.sep + tail : '')).slice(0, 76);
  }
  // Names for a whole workspace: a generation shares its first track's name (not stems: one per instrument), then #1 #2…
  function names(wsId, R) {
    var key = function (t) { return norm(t).trim(); };
    var cs = S.clips[wsId] || [], g = gens(wsId), w = S.ws.find(function (x) { return x.id === wsId; }), out = {}, groups = {};
    cs.forEach(function (c) {
      var gg = g[c.id], first = gg && gg.list.length > 1 && catOf(c) !== 'stem' ? gg.list.find(function (x) { return catOf(x) === catOf(c) && x.tk === c.tk; }) || c : c;
      var n = first === c ? nameOf(c, R, w && w.name) : (out[first.id] || nameOf(first, R, w && w.name));
      out[c.id] = n;
    });
    cs.forEach(function (c) { (groups[key(out[c.id])] = groups[key(out[c.id])] || []).push(c); });
    Object.keys(groups).forEach(function (k) {
      var list = groups[k]; if (!R.num || list.length < 2) return;
      list.sort(function (a, b) { return a.at.localeCompare(b.at) || (a.id < b.id ? -1 : 1); }).forEach(function (c, i) { out[c.id] = out[c.id] + ' #' + (i + 1); });
    });
    return out;
  }
  // 💡 one-click suggestion: only for messy names (3m39s_01-001 Loca_x3 (Edit)) or names shared in the workspace. Originals (★) keep theirs.
  function suggestions(wsId) {
    if (sugCache[wsId]) return sugCache[wsId];
    var cs = S.clips[wsId] || [], o = originals(cs), count = {}, all = names(wsId, RULES), out = {};
    var key = function (t) { return norm(t).trim(); };
    cs.forEach(function (c) { count[key(c.title)] = (count[key(c.title)] || 0) + 1; });
    cs.forEach(function (c) { if (o[c.id] || (count[key(c.title)] < 2 && cleanTitle(c.title) === c.title)) return; if (all[c.id] !== c.title) out[c.id] = all[c.id]; });
    return (sugCache[wsId] = out);
  }
  function sugFor(c) {
    var w = c.ws || wsOf(c.id);
    if (w) return suggestions(w.id)[c.id] || null;
    var t = cleanTitle(c.title); return t !== c.title ? t : null;
  }

  /* ================================================================ themes */
  function hexA(h, a) { var n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  // try = preview only (theme menu): saved when the user keeps it.
  function applyTheme(id, tryOnly) {
    var th = THEMES.find(function (t) { return t.id === id; }) || THEMES[0]; if (!th) return;
    S.theme = th.id; if (!tryOnly) LS.set('theme', th.id);
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
    '.sdl-cat{display:inline-block;font-size:10.5px;font-weight:700;line-height:16px;border-radius:6px;padding:0 6px;margin-right:7px;vertical-align:1px;background:hsla(var(--h),75%,50%,.15);color:hsl(var(--h),70%,30%);border:1px solid hsla(var(--h),75%,45%,.35)}#sdl-root.dark .sdl-cat{color:hsl(var(--h),80%,74%);background:hsla(var(--h),75%,55%,.16)}' +
    '.sdl-rnset{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:13px;padding:8px 0 10px;border-bottom:1px solid var(--line)}.sdl-rnset input,.sdl-rnset select{font:inherit;color:var(--txt);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:3px 6px}.sdl-rnset .sdl-cat{cursor:pointer;opacity:.35}.sdl-rnset .sdl-cat.on{opacity:1}' +
    '.sdl-tr .dt{color:var(--mut);font-size:12px;white-space:nowrap}.sdl-gen{font-size:11px;font-weight:700;color:var(--acc2,var(--acc));border:1px solid currentColor;border-radius:6px;padding:0 5px;margin-left:4px;opacity:.8}' +
    '.sdl-tracks{padding:4px 20px 30px}.sdl-tr{display:grid;grid-template-columns:22px 58px 44px 1fr 110px auto 52px 34px;gap:10px;align-items:center;padding:6px 10px;border-radius:10px;width:100%;text-align:left;cursor:pointer}' +
    '.sdl-tr:hover{background:var(--glass)}.sdl-tr.on{background:var(--panel2)}.sdl-tr.on .tt{color:var(--acc)}.sdl-tr.sel{background:' + 'var(--panel2)}' +
    '.sdl-tr input{width:16px;height:16px;accent-color:var(--acc);opacity:.35}.sdl-tr:hover input,.sdl-tr input:checked,.sdl-anysel .sdl-tr input{opacity:1}' +
    '.sdl-tr .no{color:var(--mut);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.sdl-tr .no .vx{font-size:12px;margin-right:5px;opacity:.85}.sdl-tr img{width:44px;height:44px;border-radius:6px;object-fit:cover}' +
    '.sdl-sug{font:inherit;font-size:12px;font-weight:600;color:var(--acc);background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:1px 9px;margin-right:6px;cursor:pointer}.sdl-sug:hover{border-color:var(--acc)}' +
    '.sdl-tr .tt{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdl-tr .tg{color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sdl-tr .du{color:var(--mut);font-variant-numeric:tabular-nums;text-align:right}.sdl-tr .lk{color:var(--acc);font-size:16px;width:28px;height:28px;border-radius:50%}.sdl-tr .lk.off{color:var(--mut);opacity:0}.sdl-tr:hover .lk.off{opacity:.7}' +
    '.sdl-tr .dots{width:30px;height:30px;border-radius:50%;opacity:0}.sdl-tr:hover .dots{opacity:1}.sdl-tr .dots:hover{background:var(--panel)}' +
    '.sdl-star{color:var(--gold)}.sdl-orig .tt{color:var(--gold)}' +
    '.sdl-lyr{width:380px;flex:none;border-left:1px solid var(--line);display:flex;flex-direction:column;background:var(--glass);backdrop-filter:blur(14px);position:relative}.sdl-lyr[hidden]{display:none}' +
    '.sdl-lyr h3{margin:0;padding:12px 10px 12px 18px;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center}' +
    '#sdl-lyr-body{overflow:auto;flex:1;padding:10px 20px 50vh}.sdl-ly{padding:6px 0;font-size:20px;font-weight:700;color:var(--mut);opacity:.55;transition:color .2s,opacity .2s;cursor:pointer}' +
    '.sdl-ly .tc{font-size:11px;font-weight:600;color:var(--mut);margin-right:10px;font-variant-numeric:tabular-nums;vertical-align:middle}.sdl-ly:not(.sec):hover{opacity:1;color:var(--txt)}.sdl-ly:not(.sec):hover .tc{color:var(--acc)}#sdl-root.kara .sdl-ly .tc{display:none}' +
    '.sdl-ly.past{opacity:.8}.sdl-ly.on{color:var(--txt);opacity:1}.sdl-ly .w.sung{color:var(--acc)}.sdl-ly.sec{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:var(--acc2);opacity:1;padding-top:16px;cursor:default}' +
    '.sdl-ly.static{font-size:15px;font-weight:400;color:var(--txt);opacity:1;cursor:default}#sdl-follow{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:var(--acc)!important;color:#fff!important;font-weight:700}' +
    '#sdl-root.kara .sdl-lyr{position:fixed;inset:0 0 86px 0;width:auto;z-index:5;border:0;background:var(--deco)}#sdl-root.kara #sdl-lyr-body{padding:20vh 10vw 50vh;text-align:center}' +
    '#sdl-root.kara .sdl-ly{font-size:38px;line-height:1.25}#sdl-root.kara .sdl-ly.sec{font-size:15px}' +
    '.sdl-kbg{display:none}#sdl-root.kara .sdl-kbg{display:block;position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(40px) saturate(1.3);opacity:.35;pointer-events:none}' +
    '.sdl-muted{color:var(--mut)}' +
    '.sdl-create{display:grid;grid-template-columns:210px minmax(380px,1.25fr) minmax(320px,1fr);grid-template-rows:1fr auto;gap:16px;padding:20px 24px;height:100%;box-sizing:border-box}' +
    '.sdl-card2{background:var(--glass);backdrop-filter:blur(12px);border:1px solid var(--line);border-radius:18px;padding:16px;min-height:0;display:flex;flex-direction:column;box-shadow:var(--shadow)}' +
    '.sdl-h2{font-weight:800;font-size:15px;margin:0 0 8px;display:flex;align-items:center;gap:8px}.sdl-cnt{font-weight:600;font-size:11px;color:var(--mut);margin-left:auto}' +
    '.sdl-create textarea,.sdl-create input{font:inherit;color:var(--txt);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px;outline:none;resize:none;width:100%;box-sizing:border-box}' +
    '.sdl-create textarea:focus,.sdl-create input:focus{border-color:var(--acc);box-shadow:0 0 0 3px ' + 'var(--panel2)}' +
    '.sdl-form{overflow:auto;gap:10px}.sdl-step{display:flex;gap:12px;align-items:flex-start}.sdl-step .n,.sdl-lyrics .n{width:28px;height:28px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2))}' +
    '.sdl-tagrow{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:6px}.sdl-tagrow>span{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--mut);margin-right:4px}' +
    '.sdl-tag{padding:3px 9px!important;border-radius:999px;border:1px solid var(--line)!important;background:var(--panel)!important;font-size:12px;line-height:1.4}.sdl-tag:hover{border-color:var(--acc)!important}.sdl-tag.on{background:var(--acc)!important;border-color:var(--acc)!important;color:#fff!important}' +
    '.sdl-more{margin-top:10px}.sdl-more summary{cursor:pointer;color:var(--mut);font-size:13px;margin-bottom:6px}' +
    '.sdl-seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px;background:var(--panel)}.sdl-seg button{padding:7px 14px!important;border-radius:999px;font-weight:600;font-size:13px}.sdl-seg button.on{background:var(--acc)!important;color:#fff!important}' +
    '.sdl-lyrics{min-width:0}.sdl-sec{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}#sdl-c-lyrics{flex:1;font-size:15px;line-height:1.6;min-height:200px}' +
    '.sdl-drafts{overflow:hidden}.sdl-dlist{overflow:auto;flex:1;display:flex;flex-direction:column;gap:6px}.sdl-draft{text-align:left;padding:8px 10px!important;border-radius:10px;border:1px solid transparent!important;display:flex;flex-direction:column;gap:2px}' +
    '.sdl-draft:hover{background:var(--panel)!important}.sdl-draft.on{border-color:var(--acc)!important;background:var(--panel)!important}.sdl-draft b{font-size:13px}.sdl-draft span{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sdl-cbar{grid-column:1/4;display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:16px;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow)}' +
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
    '.sdl-themes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px;max-height:62vh;overflow:auto}.sdl-th{display:flex;gap:8px;align-items:center;padding:8px;border-radius:10px;border:2px solid transparent!important;text-align:left}' +
    '.sdl-th.on{border-color:var(--acc)!important}.sdl-th .sw{width:34px;height:34px;border-radius:8px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}' +
    '#sdl-fab{position:fixed;right:18px;bottom:96px;z-index:2147483001;padding:10px 14px;border-radius:999px;border:0;font:700 13px system-ui;color:#fff;cursor:pointer;background:linear-gradient(90deg,#E81E8C,#F57C00);box-shadow:0 6px 20px rgba(0,0,0,.3)}' +
    '</style>' +
    '<aside class="sdl-side"><div class="sdl-brand"><b>SUNODLAA</b><span class="sp"></span>' +
    '<button class="sdl-ic" id="sdl-spy" title="' + tr("Mouchard : enregistrer ce que fait suno.com", "Spy: record what suno.com does") + '">🕵</button><button class="sdl-ic" id="sdl-theme" title="' + tr("Thème", "Theme") + '">🎨</button><button class="sdl-ic" id="sdl-sync" title="' + tr("Actualiser depuis Suno", "Refresh from Suno") + '">⟳</button><button class="sdl-ic" id="sdl-hide" title="' + tr("Fermer (Échap) : revenir à la page Suno", "Close (Esc): back to the Suno page") + '">✕</button></div>' +
    '<input class="sdl-search" id="sdl-wsq" placeholder="' + tr("Rechercher un espace de travail…", "Search a workspace…") + '">' +
    '<div class="sdl-wsbar"><button class="sdl-chip" data-act="newws" title="' + tr('Nouvel espace de travail', 'New workspace') + '">＋</button><button class="sdl-chip" data-wsort="recent">' + tr("Récents", "Recent") + '</button><button class="sdl-chip" data-wsort="az">A → Z</button><button class="sdl-chip" data-wsort="size">' + tr("Taille", "Size") + '</button></div>' +
    '<div class="sdl-wslist" id="sdl-wslist"></div><div class="sdl-status" id="sdl-status"></div></aside>' +
    '<main class="sdl-main"><div class="sdl-mainin" id="sdl-mainin"></div>' +
    '<section class="sdl-lyr" id="sdl-lyr" hidden><div class="sdl-kbg" id="sdl-kbg"></div><h3><span style="flex:1">' + tr("Paroles", "Lyrics") + '</span><button class="sdl-ic" id="sdl-lrc" title="' + tr("Télécharger les paroles synchronisées (.lrc)", "Download synced lyrics (.lrc)") + '">⬇</button><button class="sdl-ic" id="sdl-lyredit" title="' + tr("Modifier le titre et les paroles", "Edit title and lyrics") + '">✏️</button><button class="sdl-ic" id="sdl-kara" title="' + tr("Karaoké plein écran", "Full-screen karaoke") + '">⤢</button></h3><div id="sdl-lyr-body"></div><button id="sdl-follow" hidden>⤓ ' + tr("Suivre les paroles", "Follow the lyrics") + '</button></section></main>' +
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
  pill.innerHTML = '<b>♪ SUNODLAA</b><span>v' + VERSION + '</span>';
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
  // suno.com may rebuild the page right after it loads and drop the overlay: put it back.
  var beat = setInterval(function () { if (!root.isConnected) document.documentElement.appendChild(root); placePill(); followSuno(); }, 1500);
  offs.push(function () { clearInterval(beat); });

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
  on(document, 'mousedown', function (e) { if (!e.target.closest || !e.target.closest('#sdl-menu')) closeMenu(); }, true);

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
      '<button class="sdl-ws' + (S.cur === CRE ? ' on' : '') + '" data-ws="' + CRE + '"><span class="ph" style="display:grid;place-items:center;font-size:20px;background:linear-gradient(135deg,var(--acc3),var(--acc))">✨</span>' +
      '<span style="min-width:0"><div class="nm">' + tr('Créer', 'Create') + '</div><div class="ct">' + tr('tout sur un écran', 'all on one screen') + '</div></span></button>' +
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
    if (S.cur === EXP || S.cur === CRE) return [];
    if (S.cur === ALL) {
      var wl = S.ws.slice().sort(function (a, b) { return collator.compare(a.name, b.name); });
      wl.forEach(function (w) { ordered(S.clips[w.id] || []).forEach(function (c) { c.ws = w; base.push(c); }); });
    } else { var w0 = curWs(); base = ordered(S.clips[S.cur] || []); base.forEach(function (c) { c.ws = w0; }); }
    base.forEach(function (c) { c.no = c.ws ? nums(c.ws.id)[c.id] : 0; });
    var out = base.filter(function (c) {
      if (S.filter === 'fav' && !c.liked) return false;
      if (S.filter === 'pin' && !isPinned(c)) return false;
      if (S.filter === 'orig' && originOf(c) !== 'prompt') return false;
      return !q || norm(c.title).indexOf(q) >= 0 || norm(c.tags).indexOf(q) >= 0 || (S.cur === ALL && c.ws && norm(c.ws.name).indexOf(q) >= 0);
    });
    var by = {
      new: function (a, b) { return b.at.localeCompare(a.at); }, old: function (a, b) { return a.at.localeCompare(b.at); },
      az: function (a, b) { return collator.compare(a.title, b.title); }, long: function (a, b) { return (b.d || 0) - (a.d || 0); },
      plays: function (a, b) { return (b.plays || 0) - (a.plays || 0) || b.at.localeCompare(a.at); }
    }[S.sort];
    if (by) out.sort(by);
    // pinned tracks on top of their workspace (in "All tracks", only when grouped by workspace)
    if (S.cur !== ALL || S.sort === 'no') {
      out.forEach(function (c, i) { c._i = i; c._p = isPinned(c) ? 0 : 1; });
      out.sort(function (a, b) { return (S.cur === ALL && a.ws !== b.ws ? a._i - b._i : a._p - b._p) || a._i - b._i; });
    }
    return out;
  }
  function selList() { var out = []; for (var k in S.clips) S.clips[k].forEach(function (c) { if (S.sel[c.id]) out.push(c); }); return out; }
  function renderTracks() {
    if (S.cur === EXP) return renderExplore($('#sdl-mainin'));
    if (S.cur === CRE) return renderCreate($('#sdl-mainin'));
    if (S.cur.indexOf('pl:') === 0) return renderPlaylist($('#sdl-mainin'), S.cur.slice(3));
    var w = S.cur === ALL ? { id: ALL, name: tr('Tous les titres', 'All tracks'), all: true } : curWs(), el = $('#sdl-mainin');
    if (!w) { el.innerHTML = '<div class="sdl-hero"><div><h1>' + tr('Tes espaces de travail', 'Your workspaces') + '</h1><div class="meta">' + (S.syncing ? tr('Chargement…', 'Loading…') : tr('Choisis un espace à gauche.', 'Pick a workspace on the left.')) + '</div></div></div>'; return; }
    var all = [];
    if (w.all) S.ws.forEach(function (x) { all = all.concat(S.clips[x.id] || []); }); else all = S.clips[S.cur] || [];
    var cs = viewClips(), o = originals(all), img = w.all ? '' : wsCover(w), tot = all.reduce(function (s, c) { return s + (c.d || 0); }, 0);
    var r = w.all ? null : wsRange(w);
    var ugly = (w.all ? S.ws : [w]).reduce(function (n, x) { return n + Object.keys(suggestions(x.id)).length; }, 0), sel = selList();
    var scroll = el.scrollTop;
    el.innerHTML = '<div class="sdl-hero">' + (img ? '<img src="' + esc(img) + '">' : '<span class="ph"></span>') +
      '<div style="min-width:0"><div class="meta">' + (w.all ? tr('Toute ta bibliothèque', 'Your whole library') : tr('Espace de travail', 'Workspace')) + '</div><h1>' + esc(w.name) + '</h1><div class="meta">' + pl(all.length, 'titre', 'titres', 'track', 'tracks') + ' · ' + Math.round(tot / 60) + ' min' +
      (r && r.first ? ' · ' + esc(fdate(r.first) === fdate(r.last) ? fdate(r.first) : tr('du ', 'from ') + fdate(r.first) + tr(' au ', ' to ') + fdate(r.last)) : '') + '</div>' +
      '<div class="sdl-acts"><button class="sdl-big" data-act="playall">▶ ' + tr("Lire", "Play") + '</button><button class="sdl-ghost" data-act="shufall">🔀 ' + tr("Aléatoire", "Shuffle") + '</button>' +
      '<button class="sdl-ghost" data-act="upload" title="' + tr("Importer un fichier audio dans un espace", "Upload an audio file into a workspace") + '">⬆ ' + tr("Importer", "Upload") + '</button>' +
      (w.all ? '' : '<button class="sdl-ghost" data-act="wsrename">✏️ ' + tr("Renommer", "Rename") + '</button>') + '<button class="sdl-ghost" data-act="tidy" title="' + tr("Trouver les titres rangés dans le mauvais espace (paroles d'un autre morceau…)", "Find tracks filed in the wrong workspace (lyrics of another song…)") + '">🧭 ' + tr("Vérifier le rangement", "Check filing") + '</button>' + '<button class="sdl-ghost" data-act="renamer" title="' + tr("Renommer tous les titres affichés selon des règles", "Rename all shown tracks with rules") + '">🏷 ' + tr("Renommer en masse", "Bulk rename") + '</button>' +
      (ugly ? '<button class="sdl-ghost" data-act="clean">✨ ' + tr('Nettoyer ', 'Clean ') + pl(ugly, 'titre', 'titres', 'title', 'titles') + '</button>' : '') +
      (w.all ? '' : '<button class="sdl-ghost danger" data-act="wsdelete" title="' + tr("Mettre l\'espace à la corbeille Suno", "Send the workspace to Suno's trash") + '">🗑</button>') + '</div></div></div>' +
      '<div class="sdl-tools"><input class="sdl-tq" id="sdl-tq" placeholder="' + tr("Rechercher un titre, un style…", "Search a title, a style…") + '" value="' + esc(S.tQ) + '">' +
      '<button class="sdl-chip' + (S.filter === 'all' ? ' on' : '') + '" data-filter="all">' + tr("Tous", "All") + '</button><button class="sdl-chip' + (S.filter === 'fav' ? ' on' : '') + '" data-filter="fav">♥ ' + tr("Favoris", "Favorites") + '</button>' +
      '<button class="sdl-chip' + (S.filter === 'pin' ? ' on' : '') + '" data-filter="pin">📌 ' + tr("Épinglés", "Pinned") + '</button>' +
      '<button class="sdl-chip' + (S.filter === 'orig' ? ' on' : '') + '" data-filter="orig" title="' + tr("Tes créations au prompt (sans upload) et ce qui en découle", "Your prompt creations (no upload) and what comes from them") + '">✨ ' + tr("Mes créations", "My creations") + '</button>' +
      '<span class="sdl-muted" style="margin-left:8px">' + tr('Tri', 'Sort') + '</span>' + [['no', 'N°'], ['new', tr('Récents', 'Newest')], ['old', tr('Anciens', 'Oldest')], ['az', 'A → Z'], ['long', tr('Durée', 'Length')], ['plays', '▶ ' + tr('Écoutes', 'Plays')]].map(function (x) { return '<button class="sdl-chip' + (S.sort === x[0] ? ' on' : '') + '" data-sort="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
      '<button class="sdl-chip" data-act="selall" style="margin-left:auto">☑ ' + tr("Tout sélectionner", "Select all") + '</button></div>' +
      (sel.length ? '<div class="sdl-selbar"><b>' + pl(sel.length, 'sélectionné', 'sélectionnés', 'selected', 'selected') + '</b><span class="sp"></span><button data-act="bmove">📁 ' + tr("Déplacer", "Move") + '</button><button data-act="bpin">📌 ' + (sel.every(function (c) { return isPinned(c); }) ? tr("Désépingler", "Unpin") : tr("Épingler", "Pin")) + '</button><button data-act="bclean">🏷 ' + tr("Renommer", "Rename") + '</button><button data-act="bdelete">🗑 ' + tr("Supprimer", "Delete") + '</button><button data-act="bnone">✕</button></div>' : '') +
      '<div class="sdl-tracks' + (sel.length ? ' sdl-anysel' : '') + '">' + (cs.length ? cs.slice(0, S.limit || 400).map(function (c, i) {
        var on = S.playing && S.playing.id === c.id, head = '', sg = sugFor(c), gn = genOf(c);
        if (w.all && S.sort === 'no' && (i === 0 || cs[i - 1].ws !== c.ws)) head = '<div class="sdl-grp" data-ws="' + esc(c.ws.id) + '">' + esc(c.ws.name) + ' <span class="sdl-muted">· ' + (S.clips[c.ws.id] || []).length + '</span></div>';
        return head + '<div class="sdl-tr' + (on ? ' on' : '') + (o[c.id] ? ' sdl-orig' : '') + (S.sel[c.id] ? ' sel' : '') + '" data-i="' + i + '" data-id="' + c.id + '">' +
          '<input type="checkbox" data-selid="' + c.id + '"' + (S.sel[c.id] ? ' checked' : '') + '>' +
          '<span class="no">' + voiceIcon(c) + (on ? (S.loading ? '<span class="sdl-spin">⟳</span>' : '♪') : String(c.no).padStart(3, '0')) + '</span>' +
          (c.img ? '<img loading="lazy" src="' + esc(c.img) + '">' : '<span></span>') +
          '<span style="min-width:0"><div class="tt">' + (isPinned(c) ? '<span title="' + tr('Épinglé', 'Pinned') + '">📌 </span>' : '') + (o[c.id] ? '<span class="sdl-star">★ </span>' : '') + catBadge(c) + esc(c.title) + (gn ? ' <span class="sdl-gen" title="' + esc(tr('Générés ensemble le ', 'Made together on ') + fdate(gn.list[0].at, true)) + '">⧉ ' + 'ABCDEFGH'.charAt(gn.list.indexOf(c)) + '</span>' : '') + '</div><div class="tg">' + (sg ? '<button class="sdl-sug" data-sug="' + c.id + '" title="' + tr('Cliquer pour renommer ainsi sur Suno', 'Click to rename it like this on Suno') + '">💡 ' + esc(sg) + '</button>' : '') + (w.all && S.sort !== 'no' && c.ws ? '<b>' + esc(c.ws.name) + '</b> · ' : '') + esc(c.tags) + '</div></span>' +
          '<span class="dt" title="' + esc(fdate(c.at, true) + ' · ' + pl(c.plays || 0, 'écoute', 'écoutes', 'play', 'plays')) + '">' + (S.sort === 'plays' ? '▶ ' + (c.plays || 0) : esc(fdate(c.at))) + '</span>' +
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
    var sug = sugFor(c) || c.title;
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
  function editDetails(c) {
    var box = 'width:100%;font:inherit;color:var(--txt);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px;outline:none';
    modal(tr('Titre et paroles', 'Title and lyrics'),
      '<input type="text" id="sdl-ed-t" maxlength="100" style="' + box + '" value="' + esc(c.title) + '">' +
      '<textarea id="sdl-ed-l" maxlength="5000" rows="16" style="' + box + ';margin-top:10px;resize:vertical;min-height:40vh">' + esc(c.prompt || '') + '</textarea>' +
      '<div class="sdl-muted" style="font-size:12px;margin-top:6px">' + tr('Le karaoké garde le placement calculé par Suno : il peut être décalé si tu changes beaucoup le texte.', 'Karaoke keeps the timing Suno computed: it may drift if you change the text a lot.') + '</div>',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Enregistrer', 'Save'), cls: 'primary', onclick: async function () {
        var t = $('#sdl-ed-t').value.trim() || c.title, l = $('#sdl-ed-l').value;
        if (t === c.title && l === (c.prompt || '')) return closeModal();
        setButtons([{ label: '…' }]);
        try {
          await write('/api/gen/' + c.id + '/set_metadata/', { title: t, lyrics: l });
          c.title = t; c.prompt = l; closeModal(); refreshAll();
          if (S.playing && S.playing.id === c.id) loadLyrics(c);
          toast(tr('Enregistré sur Suno', 'Saved on Suno'));
        } catch (e) { closeModal(); toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }
      } }]);
    setTimeout(function () { var i = $('#sdl-ed-l'); if (i) i.focus(); }, 30);
  }
  async function toggleLike(c) {
    var want = !c.liked;
    try { await write('/api/gen/' + c.id + '/update_reaction_type/', { reaction: want ? 'LIKE' : null }); c.liked = want; refreshAll(); }
    catch (e) { toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 6000); }
  }
  // Same call as suno.com's "Pin clip to workspace" button, one call per workspace.
  async function setPinned(cs, want) {
    var byWs = {}; cs.forEach(function (c) { var w = wsOf(c.id); if (w && isPinned(c, w) !== want) (byWs[w.id] = byWs[w.id] || []).push(c.id); });
    var n = 0, err = null;
    for (var wid in byWs) {
      var ids = byWs[wid];
      try { await write('/api/project/' + wid + '/clips', { update_type: 'pinned', metadata: { clip_ids: ids, pinned: want } }); }
      catch (e) { err = e; break; }
      var rest = (S.pins[wid] || []).filter(function (id) { return ids.indexOf(id) < 0; });
      S.pins[wid] = want ? ids.concat(rest) : rest; n += ids.length;
    }
    refreshAll();
    toast(err ? tr('Suno a refusé : ', 'Suno refused: ') + err.message : want ? tr(pl(n, 'titre épinglé', 'titres épinglés', '', ''), pl(n, 'track', 'tracks', 'track', 'tracks') + ' pinned') : tr(pl(n, 'titre désépinglé', 'titres désépinglés', '', ''), pl(n, 'track', 'tracks', 'track', 'tracks') + ' unpinned'), 5000);
  }
  /* ---- Upload: one of your audio files into a workspace, with suno.com's own upload steps.
     The file is sent as it is; Suno's own checks apply (a refused file stays refused). ---- */
  var UPLOAD_TYPES = 'audio/wav,audio/flac,audio/x-flac,audio/mpeg,audio/mp3,audio/ogg,audio/opus,audio/webm,audio/mp4,audio/x-m4a,audio/aac';
  async function sendUpload(f, title, wid, st) {
    var ext = ((f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'mp3').toLowerCase();
    st(tr('Préparation…', 'Preparing…'));
    var up = await write('/api/uploads/audio/', { extension: ext, upload_type: 'file_upload' });
    if (!up || !up.id || !/^https:\/\/[a-z0-9.-]+\.amazonaws\.com\//.test(up.url || '')) throw new Error(tr('réponse inattendue de Suno', 'unexpected answer from Suno'));
    st(tr('Envoi du fichier…', 'Sending the file…'));
    var fd = new FormData(); Object.keys(up.fields || {}).forEach(function (k) { fd.append(k, up.fields[k]); }); fd.append('file', f);
    var r = await (window.__sdlRealFetch || fetch)(up.url, { method: 'POST', body: fd });   // Suno's storage: no Suno token sent there
    if (!r.ok) throw new Error(tr('envoi refusé', 'upload refused') + ' (HTTP ' + r.status + ')');
    await write('/api/uploads/audio/' + up.id + '/upload-finish/', { upload_type: 'file_upload', upload_filename: f.name, agreed_to_vip_upload_terms: false });
    st(tr('Vérification par Suno…', 'Suno is checking it…'));
    var init = null, err = null;
    for (var i = 0; i < 20 && !init; i++) {   // while Suno is still processing the file, try again (up to ~1 min)
      try { init = await write('/api/uploads/audio/' + up.id + '/initialize-clip/', { user_reviewed_tags: true }); }
      catch (e) { err = e; if (!/process|pending|progress|ready|wait/i.test(e.message || '')) throw e; await sleep(3000); }
    }
    if (!init || !init.clip_id) throw err || new Error(tr('Suno n\'a pas créé le titre', 'Suno did not create the track'));
    var id = init.clip_id;
    st(tr('Titre et rangement…', 'Title and workspace…'));
    var c = await api('/api/clip/' + id);
    await write('/api/gen/' + id + '/set_metadata/', { title: title || c.title, image_url: c.image_url, is_audio_upload_tos_accepted: true });
    try { await write('/api/gen/' + id + '/set_audio_description', { gemini_description_accepted: true }); } catch (e) { log('audio description', e.message); }
    await write('/api/project/' + wid + '/clips', { update_type: 'add', metadata: { clip_ids: [id] } });
    try { c = await api('/api/clip/' + id); } catch (e) {}
    var out = slim(c); if (title) out.title = title; return out;
  }
  function uploadAudio(w0) {
    var list = S.ws.slice().sort(function (a, b) { return collator.compare(a.name, b.name); });
    var def = w0 ? w0.id : ((S.ws.find(function (w) { return w.id === 'default'; }) || list[0] || {}).id);
    modal(tr('Importer un fichier audio', 'Upload an audio file'),
      '<input type="file" id="sdl-upf" accept="' + UPLOAD_TYPES + '" style="width:100%">' +
      '<div style="margin-top:12px">' + tr('Titre', 'Title') + '<input type="text" id="sdl-upt" style="width:100%"></div>' +
      '<div style="margin-top:12px">' + tr('Espace de travail', 'Workspace') + '<select id="sdl-upw" style="width:100%;padding:8px;border-radius:10px;background:var(--panel2);color:var(--txt);border:1px solid var(--line)">' +
      list.map(function (w) { return '<option value="' + esc(w.id) + '"' + (w.id === def ? ' selected' : '') + '>' + esc(w.name) + '</option>'; }).join('') + '</select></div>' +
      '<label class="sdl-row" style="margin-top:12px;border:0"><input type="checkbox" id="sdl-upok"><span style="font-size:13px">' + tr('J\'ai les droits sur ce morceau et j\'accepte les conditions d\'import audio de Suno.', 'I own the rights to this audio and accept Suno\'s audio upload terms.') + '</span></label>' +
      '<div id="sdl-upst" style="font-size:13px;margin-top:8px"></div>',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Importer', 'Upload'), cls: 'primary', onclick: async function () {
        var f = $('#sdl-upf').files[0], wid = $('#sdl-upw').value, title = $('#sdl-upt').value.trim().slice(0, 100);
        if (!f) return toast(tr('Choisis un fichier', 'Pick a file'));
        if (!wid) return toast(tr('Choisis un espace', 'Pick a workspace'));
        if (!$('#sdl-upok').checked) return toast(tr('Coche la case des droits pour continuer', 'Tick the rights box to continue'));
        var m = $('#sdl-modal'); m.dataset.busy = 1; $$('#sdl-modal input, #sdl-modal select').forEach(function (i) { i.disabled = true; });
        setButtons([{ label: '…' }]);
        var st = function (t) { var e = $('#sdl-upst'); if (e) e.innerHTML = '<span class="sdl-spin">⟳</span> ' + esc(t); };
        try {
          var c = await sendUpload(f, title, wid, st), w = S.ws.find(function (x) { return x.id === wid; });
          S.clips[wid] = (S.clips[wid] || []).concat([c]); if (w) w.n = (w.n || 0) + 1;
          delete m.dataset.busy; closeModal(); refreshAll();
          toast(tr('« ' + c.title + ' » importé dans « ' + (w ? w.name : '') + ' »', '"' + c.title + '" uploaded to "' + (w ? w.name : '') + '"'), 6000);
        } catch (e) {
          delete m.dataset.busy; $('#sdl-upst').textContent = tr('Suno a refusé : ', 'Suno refused: ') + (e.message || e);
          setButtons([{ label: 'OK', cls: 'primary', onclick: closeModal }]);
        }
      } }]);
    $('#sdl-upf').onchange = function () { var f = this.files[0]; if (f && !$('#sdl-upt').value) $('#sdl-upt').value = f.name.replace(/\.[^.]+$/, '').slice(0, 100); };
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
  /* ---- 🧭 tidy check: tracks that look like they belong to another workspace.
     1) its lyrics are (almost) those of a song in another workspace, and not those of its own workspace;
     2) or the track it comes from (cover, edit, stem…) lives in another workspace. */
  function lyricPairs(t) {
    var w = norm(String(t || '').replace(/\[[^\]]*\]/g, ' ')).replace(/[^a-z0-9'À-￿]+/g, ' ').split(' ').filter(function (x) { return x.length > 2; });
    if (w.length < 12) return null;
    var set = {}, n = 0; for (var i = 0; i < w.length - 1; i++) { var k = w[i] + ' ' + w[i + 1]; if (!set[k]) { set[k] = 1; n++; } }
    return { set: set, n: n };
  }
  function overlap(a, b) { var s1 = a.n <= b.n ? a : b, s2 = s1 === a ? b : a, hit = 0; for (var k in s1.set) if (s2.set[k]) hit++; return hit / s1.n; }
  function tidyCheck() {
    var texts = {}, tracks = [];   // same lyrics text = computed once
    S.ws.forEach(function (w) { (S.clips[w.id] || []).forEach(function (c) {
      c.ws = w; tracks.push(c);
      var t = String(c.prompt || '').trim(); if (t.length < 60 || /^\[?\s*instrumental\s*\]?$/i.test(t)) return;
      var e = texts[t] || (texts[t] = { fp: lyricPairs(t), where: {} }); if (!e.fp) return;
      (e.where[w.id] = e.where[w.id] || []).push(c); c._lt = t;
    }); });
    var keys = Object.keys(texts).filter(function (t) { return texts[t].fp; }), simCache = {};
    function sims(t) {   // best match of a lyrics text in each workspace
      if (simCache[t]) return simCache[t];
      var out = {}, a = texts[t].fp;
      keys.forEach(function (u) { var v = u === t ? 1 : overlap(a, texts[u].fp); if (v < 0.3) return; Object.keys(texts[u].where).forEach(function (wid) { if (!out[wid] || out[wid].v < v) out[wid] = { v: v, c: texts[u].where[wid][0] }; }); });
      return (simCache[t] = out);
    }
    var found = [];
    tracks.forEach(function (c) {
      var w = c.ws, why = null, target = null;
      if (c._lt) {
        var sm = sims(c._lt), best = null;
        // own workspace: best match among the OTHER tracks of it
        var own, ow =(S.clips[w.id] || []).filter(function (x) { return x !== c && x._lt; });
        own = ow.reduce(function (m, x) { return Math.max(m, x._lt === c._lt ? 1 : overlap(texts[c._lt].fp, texts[x._lt].fp)); }, 0);
        Object.keys(sm).forEach(function (wid) { if (wid !== w.id && (!best || sm[wid].v > best.v)) best = { v: sm[wid].v, wid: wid, c: sm[wid].c }; });
        if (best && best.v >= 0.6 && own < 0.3 && (ow.length || best.v >= 0.7)) {
          target = best.wid; why = tr('paroles de « ', 'lyrics of "') + best.c.title + tr(' » (', '" (') + Math.round(best.v * 100) + '%)' + (ow.length ? tr(', rien de pareil dans cet espace', ', nothing alike in this workspace') : '');
        }
      }
      if (!why) {
        var ps = parentIds(c).map(findClip).filter(Boolean)[0], pw = ps && wsOf(ps.id);
        if (pw && pw.id !== w.id) { target = pw.id; why = tr('issu de « ', 'comes from "') + ps.title + tr(' », rangé dans « ', '", kept in "') + pw.name + tr(' »', '"'); }
      }
      if (why) found.push({ c: c, from: w, to: target, why: why });
    });
    tracks.forEach(function (c) { delete c._lt; });
    return found;
  }
  function tidyScreen(onlyWs) {
    modal(tr('Vérifier le rangement', 'Check the filing'), '<div class="sdl-muted"><span class="sdl-spin">⟳</span> ' + tr('Je compare les paroles et les liens de tous tes titres…', 'Comparing lyrics and links of all your tracks…') + '</div>', [{ label: tr('Fermer', 'Close'), onclick: closeModal }]);
    setTimeout(function () {
      var list = tidyCheck().filter(function (x) { return !onlyWs || x.from.id === onlyWs || x.to === onlyWs; });
      var wsSorted = S.ws.slice().sort(function (a, b) { return collator.compare(a.name, b.name); });
      var body = $('#sdl-modal .sdl-mbody'); if (!body) return;
      if (!list.length) { body.innerHTML = '<div>' + tr('Tout semble bien rangé 👍', 'Everything looks well filed 👍') + '</div>'; return; }
      body.innerHTML = '<div class="sdl-muted" style="font-size:13px;margin-bottom:8px">' + pl(list.length, 'titre semble mal rangé', 'titres semblent mal rangés', 'track looks misfiled', 'tracks look misfiled') + tr('. Vérifie, change la destination si besoin, décoche ce qui est voulu.', '. Check, change the destination if needed, untick what is on purpose.') + '</div>' +
        '<div id="sdl-prog" hidden><div class="sdl-pbar"><i id="sdl-pbar"></i></div><div id="sdl-ptxt" style="font-size:13px"></div></div>' +
        list.map(function (x, i) {
          return '<label class="sdl-row" data-i="' + i + '"><input type="checkbox" checked><div style="flex:1;min-width:0"><div>' + catBadge(x.c) + '<b>' + esc(x.c.title) + '</b></div>' +
            '<div class="sdl-muted" style="font-size:12px">' + tr('dans « ', 'in "') + esc(x.from.name) + tr(' » : ', '": ') + esc(x.why) + '</div>' +
            '<div style="font-size:13px;margin-top:3px">→ <select style="max-width:100%;font:inherit;color:var(--txt);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:2px 6px">' +
            wsSorted.map(function (w) { return '<option value="' + esc(w.id) + '"' + (w.id === x.to ? ' selected' : '') + '>' + esc(w.name) + '</option>'; }).join('') + '</select></div></div><span class="st"></span></label>';
        }).join('');
      $('#sdl-modal .sdl-mbox').style.maxWidth = '820px';
      setButtons([{ label: tr('Fermer', 'Close'), onclick: closeModal }, { label: tr('Déplacer la sélection', 'Move the selection'), cls: 'primary', onclick: async function () {
        var todo = $$('#sdl-modal .sdl-row').map(function (r) { var x = list[+r.dataset.i]; return { r: r, on: $('input[type=checkbox]', r).checked, x: x, to: $('select', r).value }; }).filter(function (y) { return y.on && y.to && y.to !== y.x.from.id; });
        if (!todo.length) return closeModal();
        $('#sdl-modal').dataset.busy = 1; $('#sdl-prog').hidden = false; setButtons([{ label: '…' }]);
        var ok = 0, bad = 0;
        for (var i = 0; i < todo.length; i++) {
          var y = todo[i], sid = y.x.from.id, tw = S.ws.find(function (w) { return w.id === y.to; });
          $('#sdl-ptxt').textContent = (i + 1) + ' / ' + todo.length + ' — ' + y.x.c.title + ' → ' + (tw ? tw.name : ''); $('#sdl-pbar').style.width = (100 * i / todo.length) + '%';
          try {
            await write('/api/project/' + sid + '/clips', { update_type: 'move', metadata: { clip_ids: [y.x.c.id], target_project_id: y.to } });
            S.clips[sid] = (S.clips[sid] || []).filter(function (c) { return c !== y.x.c; }); S.clips[y.to] = (S.clips[y.to] || []).concat([y.x.c]);
            ok++; $('.st', y.r).textContent = '✅'; y.r.classList.add('done');
          } catch (e) { bad++; $('.st', y.r).textContent = '❌'; $('.st', y.r).title = e.message; y.r.classList.add('fail'); }
          await sleep(250);
        }
        $('#sdl-pbar').style.width = '100%'; $('#sdl-ptxt').textContent = tr(pl(ok, 'déplacé', 'déplacés', '', ''), ok + ' moved') + (bad ? tr(', ' + bad + ' en échec', ', ' + bad + ' failed') : '');
        delete $('#sdl-modal').dataset.busy; refreshAll(); setButtons([{ label: 'OK', cls: 'primary', onclick: closeModal }]);
      } }]);
    }, 30);
  }
  var cleanStop = false;
  function cleanTitles(cs) { return renamer(cs, true); }
  // Bulk renamer. onlyMessy: just the 💡 suggestions (messy or duplicate names); else every track of the list, by the rules.
  function renamer(cs0, onlyMessy) {
    var R = JSON.parse(JSON.stringify(RULES)), list = [];
    function compute() {
      var byWs = {}; cs0.forEach(function (c) { var w = c.ws || wsOf(c.id); if (w) (byWs[w.id] = byWs[w.id] || []).push(c); });
      list = [];
      Object.keys(byWs).forEach(function (wid) {
        var all = names(wid, R), sug = onlyMessy ? suggestions(wid) : null;
        byWs[wid].forEach(function (c) { var v = onlyMessy ? sug[c.id] : all[c.id]; if (v && v !== c.title) list.push({ c: c, v: v }); });
      });
    }
    function settings() {
      return '<div class="sdl-rnset">' +
        '<label>' + tr('Libellés', 'Labels') + ' <select id="sdl-rn-lang"><option value="fr"' + (R.lang === 'fr' ? ' selected' : '') + '>Français</option><option value="en"' + (R.lang === 'en' ? ' selected' : '') + '>English</option></select></label>' +
        '<label>' + tr('Séparateur', 'Separator') + ' <input id="sdl-rn-sep" size="3" value="' + esc(R.sep) + '"></label>' +
        '<label>' + tr('Style (lettres, 0 = sans)', 'Style (letters, 0 = none)') + ' <input id="sdl-rn-style" type="number" min="0" max="60" style="width:56px" value="' + R.style + '"></label>' +
        '<label><input id="sdl-rn-num" type="checkbox"' + (R.num ? ' checked' : '') + '> #1 #2 ' + tr('sur les doublons', 'on duplicates') + '</label>' +
        '<div style="width:100%;display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span class="sdl-muted">' + tr('Ajouter le type :', 'Add the type:') + '</span>' +
        Object.keys(CATS).map(function (k) { return '<span class="sdl-cat' + (R.types[k] ? ' on' : '') + '" data-rntype="' + k + '" style="--h:' + CATS[k][0] + '">' + esc(catLabel(k, R.lang)) + '</span>'; }).join('') + '</div></div>';
    }
    function rows() {
      compute();
      $('#sdl-rn-count').textContent = list.length ? pl(list.length, 'titre à renommer', 'titres à renommer', 'track to rename', 'tracks to rename') + tr(' sur ', ' of ') + cs0.length : tr('Rien à renommer avec ces règles.', 'Nothing to rename with these rules.');
      $('#sdl-rn-list').innerHTML = list.slice(0, 1500).map(function (x, i) {
        return '<label class="sdl-row" data-i="' + i + '"><input type="checkbox" checked><div style="flex:1;min-width:0"><div class="from">' + catBadge(x.c) + esc(x.c.title) + '</div><input type="text" value="' + esc(x.v) + '"></div><span class="st"></span></label>';
      }).join('');
    }
    modal(tr('Renommer ', 'Rename ') + pl(cs0.length, 'titre', 'titres', 'track', 'tracks'),
      settings() + '<div class="sdl-muted" style="font-size:13px;margin:8px 0">' + tr('Change les règles : l\'aperçu suit. Corrige un nom à la main ou décoche une ligne pour la garder telle quelle.', 'Change the rules: the preview follows. Fix a name by hand or untick a row to keep it as it is.') + ' <b id="sdl-rn-count"></b></div>' +
      '<div id="sdl-prog" hidden><div class="sdl-pbar"><i id="sdl-pbar"></i></div><div id="sdl-ptxt" style="font-size:13px"></div></div><div id="sdl-rn-list"></div>',
      [{ label: tr('Annuler', 'Cancel'), onclick: closeModal }, { label: tr('Renommer sur Suno', 'Rename on Suno'), cls: 'primary', onclick: async function () {
        var todo = $$('#sdl-rn-list .sdl-row').map(function (r) { var x = list[+r.dataset.i]; return { r: r, on: $('input[type=checkbox]', r).checked, c: x.c, v: $('input[type=text]', r).value.trim().slice(0, 100) }; })
          .filter(function (x) { return x.on && x.v && x.v !== x.c.title; });
        if (!todo.length) return closeModal();
        RULES = R; saveRules();
        $('#sdl-modal').dataset.busy = 1; $('#sdl-prog').hidden = false; $$('#sdl-modal input, #sdl-modal select').forEach(function (i) { i.disabled = true; });
        cleanStop = false; setButtons([{ label: tr('Arrêter', 'Stop'), onclick: function () { cleanStop = true; } }]);
        var ok = 0, bad = 0;
        for (var i = 0; i < todo.length && !cleanStop; i++) {
          var x = todo[i]; $('#sdl-ptxt').textContent = (i + 1) + ' / ' + todo.length + ' — ' + x.v; $('#sdl-pbar').style.width = (100 * i / todo.length) + '%';
          $('.st', x.r).textContent = '⏳'; x.r.scrollIntoView({ block: 'center' });
          try { await setTitle(x.c, x.v); ok++; x.r.classList.add('done'); $('.st', x.r).textContent = '✅'; }
          catch (e) { bad++; x.r.classList.add('fail'); $('.st', x.r).textContent = '❌'; $('.st', x.r).title = e.message; if (/429|too many/i.test(e.message)) await sleep(5000); }
          if (i % 25 === 24) save();
          await sleep(250);
        }
        $('#sdl-pbar').style.width = '100%'; $('#sdl-ptxt').textContent = tr(pl(ok, 'renommé', 'renommés', '', ''), ok + ' renamed') + (bad ? tr(', ' + bad + ' en échec', ', ' + bad + ' failed') : '') + (cleanStop ? tr(' — arrêté', ' — stopped') : '');
        delete $('#sdl-modal').dataset.busy; refreshAll(); setButtons([{ label: 'OK', cls: 'primary', onclick: closeModal }]);
      } }]);
    var m = $('#sdl-modal'); m.querySelector('.sdl-mbox').style.maxWidth = '860px';
    var redo = function () { R.lang = $('#sdl-rn-lang').value; R.sep = $('#sdl-rn-sep').value || ' - '; R.style = Math.max(0, Math.min(60, +$('#sdl-rn-style').value || 0)); R.num = $('#sdl-rn-num').checked; sugCache = {}; rows(); };
    ['#sdl-rn-lang', '#sdl-rn-sep', '#sdl-rn-style', '#sdl-rn-num'].forEach(function (s) { $(s).addEventListener(s === '#sdl-rn-sep' || s === '#sdl-rn-style' ? 'input' : 'change', redo); });
    $$('[data-rntype]', m).forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); var k = b.dataset.rntype; R.types[k] = !R.types[k]; b.classList.toggle('on', R.types[k]); rows(); }); });
    rows();
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
      ['📝 ' + tr('Modifier les paroles', 'Edit lyrics'), function () { editDetails(c); }],
      ['⬇ ' + tr('Paroles synchronisées (.lrc)', 'Synced lyrics (.lrc)'), function () { saveLrc(c); }],
      sugFor(c) ? ['✨ ' + tr('Renommer en « ', 'Rename to "') + sugFor(c) + tr(' »', '"'), function () { setTitle(c, sugFor(c)).then(function () { refreshAll(); }, function (e) { toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }); }] : null,
      [c.liked ? '♡ ' + tr('Retirer des favoris', 'Remove from favorites') : '♥ ' + tr('Ajouter aux favoris', 'Add to favorites'), function () { toggleLike(c); }],
      [isPinned(c) ? '📌 ' + tr('Désépingler', 'Unpin') : '📌 ' + tr('Épingler en haut de l\'espace', 'Pin to the top of the workspace'), function () { setPinned([c], !isPinned(c)); }],
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
    var sgb = cl('[data-sug]'); if (sgb) { var c3 = findClip(sgb.dataset.sug), v3 = c3 && sugFor(c3); if (v3) { sgb.disabled = true; setTitle(c3, v3).then(function () { refreshAll(); toast(tr('Renommé : ', 'Renamed: ') + v3); }, function (e) { sgb.disabled = false; toast(tr('Suno a refusé : ', 'Suno refused: ') + e.message, 7000); }); } return; }
    var mn = cl('[data-menu]'); if (mn) { var c2 = findClip(mn.dataset.menu); if (c2) trackMenu(e, c2); return; }
    var th = cl('[data-sdltheme]'); if (th) { applyTheme(th.dataset.sdltheme, true); return; }
    var stb = cl('[data-style]'); if (stb) { toggleStyle(stb.dataset.style); return; }
    var sec = cl('[data-sec]'); if (sec) { insertSection(sec.dataset.sec); return; }
    var vb = cl('[data-voice]'); if (vb) { readCreate(); D.voice = vb.dataset.voice; saveDraft(); renderCreate($('#sdl-mainin')); return; }
    var dr = cl('[data-draft]'); if (dr) { var P = (S.drafts || []).find(function (x) { return x.id === dr.dataset.draft; }); if (P) { readCreate(); D.pid = P.id; D.lyrics = P.lyrics || ''; if (!D.title || D.title === D.ptitle) D.title = P.title || ''; D.ptitle = P.title; saveDraft(); renderCreate($('#sdl-mainin')); } return; }
    var fc = cl('[data-feed]'); if (fc) { var F = S.exp.feeds[+fc.dataset.feed]; if (F) startQueue(F.clips, +fc.dataset.k, false); return; }
    var fp = cl('[data-feedplay]'); if (fp) { var F2 = S.exp.feeds[+fp.dataset.feedplay]; if (F2) startQueue(F2.clips, 0, false); return; }
    var plb = cl('[data-pl]'); if (plb) { openView('pl:' + plb.dataset.pl); return; }
    var ws = cl('[data-ws]'); if (ws) {
      e.preventDefault();
      if (ws.dataset.ws === EXP || ws.dataset.ws === CRE) return openView(ws.dataset.ws);
      S.cur = ws.dataset.ws; S.tQ = ''; S.filter = 'all'; S.limit = 400; LS.set('cur', S.cur); renderWs(); renderTracks(); $('#sdl-mainin').scrollTop = 0;
      if (S.cur !== ALL && !S.clips[S.cur]) { var id = S.cur; fetchClips(id).then(function (cs) { S.clips[id] = cs; save(); renderTracks(); renderWs(); }); }
      if (S.cur !== ALL) loadPins(S.cur); return;
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
        case 'upload': return uploadAudio(w);
        case 'expmore': return loadExplore();
        case 'create': return sendToSuno(true);
        case 'fill': return sendToSuno(false);
        case 'clear': D = { title: '', style: '', exclude: '', lyrics: '', voice: D.voice }; saveDraft(); return renderCreate($('#sdl-mainin'));
        case 'dnew': return newDraft();
        case 'tidy': return tidyScreen(S.cur === ALL ? null : S.cur);
        case 'renamer': return renamer(S.cur === ALL ? [].concat.apply([], S.ws.map(function (x) { return S.clips[x.id] || []; })) : (S.clips[S.cur] || []), false);
        case 'clean': return cleanTitles(S.cur === ALL ? [].concat.apply([], S.ws.map(function (x) { return S.clips[x.id] || []; })) : (S.clips[S.cur] || []));
        case 'selall': vc.forEach(function (c) { S.sel[c.id] = true; }); return renderTracks();
        case 'bnone': S.sel = {}; return renderTracks();
        case 'bmove': return moveTracks(selList());
        case 'bpin': var sl = selList(); return setPinned(sl, !sl.every(function (c) { return isPinned(c); }));
        case 'bdelete': return deleteTracks(selList());
        case 'bclean': return renamer(selList(), false);
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
      case 'sdl-lrc': if (!S.playing) return toast(tr('Rien en lecture', 'Nothing playing')); return saveLrc(S.playing);
      case 'sdl-lyredit': if (!S.playing) return toast(tr('Rien en lecture', 'Nothing playing')); if (!isMine(S.playing)) return toast(tr('Seulement pour tes propres titres', 'Only for your own tracks')); return editDetails(S.playing);
      case 'sdl-follow': follow = true; bt.hidden = true; lyrCur = -1; return tick();
      case 'sdl-sync': return sync(true);
      case 'sdl-hide': return show(false);
      case 'sdl-spy': return spyPanel();
      case 'sdl-theme': var was = S.theme;   // click = try it live; Keep saves it, Cancel goes back
        modal(tr('Thème', 'Theme') + ' · ' + THEMES.length, '<div class="sdl-muted" style="font-size:13px;margin-bottom:6px">' + tr('Clique pour essayer, puis garde celui qui te plaît.', 'Click to try one, then keep the one you like.') + '</div><div class="sdl-themes" id="sdl-themes"></div>',
          [{ label: tr('Annuler', 'Cancel'), onclick: function () { applyTheme(was); closeModal(); } }, { label: tr('Garder', 'Keep'), cls: 'primary', onclick: function () { applyTheme(S.theme); closeModal(); } }]);
        $('#sdl-modal').dataset.busy = 1; $('#sdl-modal').dataset.esc = 'cancel'; renderThemes(); return;
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
  on(document, 'keydown', function (e) {
    if (root.classList.contains('hide')) return;
    if (e.key === 'Escape') { var md = $('#sdl-modal'); if (md && md.dataset.esc === 'cancel') $('.sdl-mbtns button', md).click(); else if (md) closeModal(); else if (S.karaoke) { S.karaoke = false; renderPlayer(); } else show(false); e.preventDefault(); e.stopPropagation(); return; }
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
  function destroy() { offs.forEach(function (f) { f(); }); playToken++; SPY.on = false; [root, pill, fab, gst].forEach(function (e) { e.remove(); }); closeMenu(); if (window.__sdlSkin && window.__sdlSkin.version === VERSION) window.__sdlSkin = null; }
  window.__sdlSkin = { toggle: toggleUI, sync: sync, state: S, version: VERSION, destroy: destroy, render: function () { renderWs(); renderTracks(); renderPlayer(); } };
  if (prevSkin) { show(true); toast(tr('SUNODLAA mis à jour : v', 'SUNODLAA updated: v') + prevSkin.version + ' → v' + VERSION, 5000); }
  applyTheme(S.theme);
  if (S.cur === EXP || S.cur.indexOf('pl:') === 0) setTimeout(function () { openView(S.cur); }, 0);
  renderWs(); renderTracks(); renderPlayer(); renderLyrics();
  var needTypes = Object.keys(S.clips).some(function (k) { return S.clips[k].some(function (c) { return c.ty === undefined; }); });
  sync(needTypes).then(fetchParents);
})();
