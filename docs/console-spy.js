/* SUNODLAA — mouchard console (à coller dans F12 → Console sur suno.com)
   start()  → enregistre les appels que suno.com fait (et tes clics, fichiers choisis)
   stop()   → arrête et copie le journal dans le presse-papiers
   Jamais enregistré : en-têtes, cookies, jetons, signatures, contenu des fichiers, audio. */
(function () {
  if (window.__sdlSpy && window.__sdlSpy.on) { console.log('[SUNODLAA] déjà en marche — tape stop()'); return; }
  var NOISE = /\/api\/(challenge\/progress|notification|billing|user\/get_user_session|statsig|c\/|modals|session\/?$|music_player\/playbar_state)/;
  var SECRET = /sig|signature|token|credential|policy|secret|password|auth|jwt|session|security|accesskey/i;
  var TEXTY = /json|text|xml|x-www-form-urlencoded/i;
  var S = window.__sdlSpy = { on: false, log: [], t0: 0 };

  function clean(s) {
    return String(s)
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jeton]')
      .replace(/("[^"]*(?:token|signature|policy|credential|secret|password|security)[^"]*"\s*:\s*)"[^"]*"/gi, '$1"[masqué]"')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]');
  }
  function cleanUrl(url) {
    try {
      var u = new URL(url, location.href);
      u.searchParams.forEach(function (v, k) { if (SECRET.test(k)) u.searchParams.set(k, 'x'); });
      return (u.hostname === location.hostname ? '' : u.hostname) + u.pathname + (u.search ? decodeURIComponent(u.search).replace(/=x(&|$)/g, '=[masqué]$1') : '');
    } catch (x) { return String(url).split('?')[0]; }
  }
  // On garde : les appels /api/ de suno.com (sauf le bruit) + tout envoi (POST/PUT…) ailleurs, ex. l'upload S3.
  function wanted(method, url) {
    try {
      var u = new URL(url, location.href);
      if (/sentry|statsig|google|segment|datadog|clerk|hotjar|intercom|tiktok|facebook|reddit|doubleclick|analytics|chromadrone|^auth\.suno\.com$/i.test(u.hostname)) return false;
      if (/suno\.com$/.test(u.hostname) && /^\/api\//.test(u.pathname)) return !NOISE.test(u.pathname);
      return method !== 'GET' && method !== 'HEAD';
    } catch (x) { return false; }
  }
  function fileInfo(f) { return 'Fichier(' + (f.name || '?') + ', ' + Math.round((f.size || 0) / 1024) + ' Ko, ' + (f.type || '?') + ')'; }
  function bodyText(b) {
    if (b == null) return Promise.resolve('');
    if (typeof b === 'string') return Promise.resolve(b);
    if (b instanceof URLSearchParams) return Promise.resolve(b.toString());
    if (b instanceof FormData) {
      var out = []; b.forEach(function (v, k) { out.push(k + '=' + (typeof v === 'string' ? (SECRET.test(k) ? '[masqué]' : v.slice(0, 120)) : fileInfo(v))); });
      return Promise.resolve('FormData{ ' + out.join(' | ') + ' }');
    }
    if (b instanceof Blob) return Promise.resolve(fileInfo(b));
    if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return Promise.resolve('[binaire ' + b.byteLength + ' octets]');
    return Promise.resolve('[' + ((b.constructor && b.constructor.name) || typeof b) + ']');
  }
  function stamp() { return '+' + ((Date.now() - S.t0) / 1000).toFixed(1) + 's'; }
  function add(e) { if (!S.on) return; S.log.push(e); console.log('[SUNODLAA]', e.k, e.txt || (e.m + ' ' + e.p + ' → ' + e.st)); }
  function call(method, url, body, status, resp) {
    add({ k: 'API', t: stamp(), m: method, p: cleanUrl(url), body: clean(body).slice(0, 1500), st: status, resp: clean(resp).slice(0, 600) });
  }

  var rf, xo, xs;
  function hook() {
    rf = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (!wanted(method, url)) return rf.apply(this, arguments);
      var bodyP = bodyText(init && init.body);
      if (!(init && init.body) && input && input.clone && method !== 'GET') {
        var ct = (input.headers && input.headers.get('content-type')) || '';
        bodyP = TEXTY.test(ct) ? input.clone().text() : Promise.resolve(ct ? '[corps ' + ct + ']' : '');
      }
      return rf.apply(this, arguments).then(function (r) {
        var rct = r.headers.get('content-type') || '';
        var respP = TEXTY.test(rct) ? r.clone().text() : Promise.resolve('[' + (rct || 'sans type') + ']');
        Promise.all([bodyP, respP]).then(function (v) { call(method, url, v[0], r.status, v[1]); }).catch(function () {});
        return r;
      }, function (err) {
        bodyP.then(function (b) { call(method, url, b, 'ÉCHEC', err && err.message); });
        throw err;
      });
    };
    xo = XMLHttpRequest.prototype.open; xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__sdlS = { m: String(m).toUpperCase(), u: String(u) }; return xo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      var x = this, d = x.__sdlS;
      if (d && wanted(d.m, d.u)) {
        var t0 = Date.now(), bodyP = bodyText(b);
        if (x.upload) x.upload.addEventListener('progress', function (ev) { if (ev.lengthComputable && ev.loaded === ev.total) add({ k: 'XHR', txt: stamp() + ' upload envoyé ' + Math.round(ev.total / 1024) + ' Ko vers ' + cleanUrl(d.u) }); });
        x.addEventListener('loadend', function () {
          var rt = x.responseType, resp = (rt === '' || rt === 'text') ? x.responseText : '[' + rt + ']';
          bodyP.then(function (v) { call(d.m + ' (xhr ' + (Date.now() - t0) + 'ms)', d.u, v, x.status || 'ÉCHEC', resp); });
        });
      }
      return xs.apply(this, arguments);
    };
  }
  function unhook() {
    if (rf) window.fetch = rf;
    if (xo) { XMLHttpRequest.prototype.open = xo; XMLHttpRequest.prototype.send = xs; }
  }

  // Clics (quel bouton/menu), fichiers choisis ou glissés : pour relier tes gestes aux appels.
  function label(el) {
    for (var i = 0; el && i < 6; i++, el = el.parentElement) {
      if (el.matches && el.matches('button,a,[role=button],[role=menuitem],[role=option],[role=tab],input,label,[data-testid]')) {
        var t = el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
        var tid = el.getAttribute('data-testid');
        return el.tagName.toLowerCase() + (el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : '') + (tid ? '#' + tid : '') + ' « ' + t.slice(0, 60) + ' »';
      }
    }
    return null;
  }
  function onClick(ev) { var l = label(ev.target); if (l) add({ k: 'CLIC', txt: stamp() + ' clic ' + l }); }
  function onChange(ev) {
    var el = ev.target;
    if (el && el.type === 'file' && el.files) add({ k: 'FICHIER', txt: stamp() + ' fichier choisi : ' + [].map.call(el.files, fileInfo).join(', ') + ' (accept=' + (el.accept || '*') + ')' });
  }
  function onDrop(ev) {
    var f = ev.dataTransfer && ev.dataTransfer.files;
    if (f && f.length) add({ k: 'FICHIER', txt: stamp() + ' fichier glissé : ' + [].map.call(f, fileInfo).join(', ') + ' sur ' + (label(ev.target) || ev.target.tagName) });
  }

  function copyText(txt) {
    // Depuis la console, la page n'a pas le focus : seul copy() de DevTools (présent pendant que la console exécute stop()) passe.
    try { if (typeof copy === 'function' && /Command Line API/.test(String(copy))) { copy(txt); return Promise.resolve(); } } catch (x) {}
    var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;top:-1000px';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (x) {}
    ta.remove();
    if (ok) return Promise.resolve();
    return navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject();
  }

  window.start = function () {
    if (S.on) return console.log('[SUNODLAA] déjà en marche — tape stop()');
    S.log = []; S.t0 = Date.now(); S.on = true; hook();
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('drop', onDrop, true);
    console.log('%c[SUNODLAA] Mouchard EN MARCHE : fais ton action sur suno.com, puis tape stop()', 'color:#fc0;font-weight:bold');
  };
  window.stop = function () {
    if (!S.on) return console.log('[SUNODLAA] pas en marche — tape start()');
    S.on = false; unhook();
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('drop', onDrop, true);
    var txt = 'SUNODLAA mouchard console — ' + new Date().toLocaleString('fr-FR') + ' — ' + location.pathname + '\n' +
      S.log.map(function (e) {
        return e.txt ? e.txt : e.t + ' ' + e.m + ' ' + e.p + (e.body ? '\n     envoyé : ' + e.body : '') + '\n     → ' + e.st + ' ' + String(e.resp).replace(/\s+/g, ' ');
      }).join('\n');
    window.__sdlLog = txt;
    copyText(txt).then(function () {
      console.log('%c[SUNODLAA] Arrêté. ' + S.log.length + ' entrées copiées dans le presse-papiers ✔', 'color:#4c4;font-weight:bold');
    }, function () {
      console.log('%c[SUNODLAA] Arrêté. Copie auto impossible : tape  copy(__sdlLog)  puis colle.', 'color:#fc0;font-weight:bold');
    });
    return S.log.length + ' entrées';
  };
  console.log('%c[SUNODLAA] Mouchard prêt. Tape start(), fais ton action, puis stop()', 'color:#fc0;font-weight:bold');
})();
