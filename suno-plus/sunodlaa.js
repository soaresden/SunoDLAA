/* SUNODLAA bootstrap (the file the bookmark loads; keep it small and stable).
   raw.githubusercontent.com "main" can lag up to 5 min behind a push, whatever the query string, so this asks
   GitHub for the latest commit and loads the app at that exact commit (an address that is never stale). */
(function () {
  var REPO = 'soaresden/SunoDLAA', FILE = 'suno-plus/sunodlaa-app.js';
  function raw(ref) { return fetch('https://raw.githubusercontent.com/' + REPO + '/' + ref + '/' + FILE, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }); }
  fetch('https://api.github.com/repos/' + REPO + '/commits/main', { cache: 'no-store', headers: { Accept: 'application/vnd.github.sha' } })
    .then(function (r) { if (!r.ok) throw new Error('api ' + r.status); return r.text(); })
    .then(function (sha) { if (!/^[0-9a-f]{40}$/.test(sha.trim())) throw new Error('sha'); return raw(sha.trim()); })
    .catch(function () { return raw('main'); })
    .then(function (t) { (0, eval)(t); })
    .catch(function (e) { if (window.__sdlSkin) window.__sdlSkin.toggle(); else alert('SUNODLAA : chargement impossible (' + (e && e.message) + ')'); });
})();
