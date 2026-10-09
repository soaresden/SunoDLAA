/* SUNODLAA — export de ta bibliothèque Suno (LECTURE SEULE) dans un fichier .tsv (dossier Téléchargements).
   À coller dans F12 → Console sur suno.com (connecté). Ne modifie rien sur Suno.
   Contenu : id, espace, date, durée, type, tâche, modèle, voix, titre, style, liens (original, edit, stem…), écoutes, favori.
   Jamais exporté : jetons, cookies, e-mail, paroles. */
(async function () {
  var say = function () { console.log.apply(console, ['%c[SUNODLAA export]', 'color:#ff4f8b;font-weight:bold'].concat([].slice.call(arguments))); };
  async function token() {
    try { if (window.Clerk && window.Clerk.session) { var t = await window.Clerk.session.getToken(); if (t) return t; } } catch (e) {}
    var m = document.cookie.match(/(?:^|;\s*)__session(?:_[^=]+)?=([^;]+)/); return m ? decodeURIComponent(m[1]) : null;
  }
  if (!(await token())) return say('Pas connecté à Suno dans cet onglet : connecte-toi puis recolle le code.');
  var BASE = 'https://studio-api-prod.suno.com';
  var sleep = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  async function get(path) {
    for (var i = 0; i < 5; i++) {
      var r = await (window.__sdlRealFetch || fetch)(BASE + path, { headers: { Authorization: 'Bearer ' + (await token()) } });
      if (r.ok) return r.json();
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(path + ' → HTTP ' + r.status);
    }
    throw new Error(path + ' → Suno refuse (trop de demandes), réessaie plus tard');
  }
  var cell = function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim(); };

  say('Lecture des espaces de travail…');
  var wsl = [], page = 1;
  while (page < 100) {
    var d = await get('/api/project/me?page=' + page + '&sort=max_created_at_last_updated_clip&show_trashed=false&exclude_shared=false');
    var items = d.projects || []; wsl = wsl.concat(items);
    if (!items.length || (d.num_total_results != null && wsl.length >= d.num_total_results)) break; page++; await sleep(150);
  }
  say(wsl.length + ' espaces. Lecture des titres (ça peut prendre une minute ou deux)…');

  var rows = [], keys = {}, kinds = {};
  for (var w = 0; w < wsl.length; w++) {
    var ws = wsl[w], p = 1;
    while (p < 300) {
      var pd = await get('/api/project/' + ws.id + '?page=' + p), pc = pd.project_clips || [];
      pc.forEach(function (x) {
        var c = x.clip; if (!c || c.is_trashed) return;
        var m = c.metadata || {}; Object.keys(m).forEach(function (k) { keys[k] = (keys[k] || 0) + 1; });
        var links = Object.keys(m).filter(function (k) { return /_ids?$/.test(k) && m[k] && (typeof m[k] === 'string' || Array.isArray(m[k])); })
          .map(function (k) { return k + '=' + [].concat(m[k]).join(','); }).join(' ');
        var kind = (m.type || '?') + '/' + (m.task || '-'); kinds[kind] = (kinds[kind] || 0) + 1;
        var voice = m.has_vocal === true ? 'voix' : (m.has_vocal === false || m.make_instrumental === true) ? 'instru' : '?';
        rows.push([c.id, ws.name || ws.id, (c.created_at || '').replace('T', ' ').slice(0, 19), Math.round(m.duration || 0), m.type || '', m.task || '',
          c.major_model_version || c.model_name || '', voice, c.title || '', (m.tags || '').slice(0, 160), links, c.status || '', c.play_count || 0, c.is_liked ? 'oui' : ''].map(cell).join('\t'));
      });
      if (pc.length < 20) break; p++; await sleep(120);
    }
    if (w % 10 === 9) say((w + 1) + '/' + wsl.length + ' espaces, ' + rows.length + ' titres');
    await sleep(120);
  }

  var head = ['id', 'espace', 'cree_le', 'duree_s', 'type', 'tache', 'modele', 'voix', 'titre', 'style', 'liens', 'statut', 'ecoutes', 'favori'].join('\t');
  var txt = '﻿' + head + '\r\n' + rows.join('\r\n') + '\r\n';
  var name = 'sunodlaa-bibliotheque-' + new Date().toISOString().slice(0, 10) + '.tsv';
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/tab-separated-values;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  say('Terminé : ' + rows.length + ' titres dans ' + wsl.length + ' espaces → fichier « ' + name + ' » (Téléchargements).');
  say('Types / tâches :', JSON.stringify(kinds));
  say('Champs vus dans les titres :', Object.keys(keys).sort().join(', '));
})().catch(function (e) { console.log('[SUNODLAA export] Erreur :', e.message); });
