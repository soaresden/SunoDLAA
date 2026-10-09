# Builds the bookmark overlay:
#  - suno-plus/sunodlaa.js : suno-plus.js with the themes inside. Committed: the bookmark loads it from GitHub (main).
#  - README.md : the bookmark code, between the BOOKMARK markers. The bookmark is a fixed loader: at each click it
#    fetches sunodlaa.js from GitHub, which shows/hides itself or replaces an older version in the tab.
#    So it is installed once, for good: a change reaches the user as soon as it is pushed.
import pathlib, re, json
here = pathlib.Path(__file__).parent
code = (here / 'suno-plus.js').read_text(encoding='utf-8')
themes = json.loads((here / 'themes.json').read_text(encoding='utf-8'))
code = code.replace('/*@THEMES@*/[]', json.dumps(themes, ensure_ascii=False, separators=(',', ':')))
(here / 'sunodlaa.js').write_text(code, encoding='utf-8', newline='\n')
ver = re.search(r"VERSION = '([^']+)'", code).group(1)

URL = 'https://raw.githubusercontent.com/soaresden/SunoDLAA/main/suno-plus/sunodlaa.js'
loader = ("javascript:(function(){if(!/(^|\\.)suno\\.com$/.test(location.hostname)){location.href='https://suno.com/';return}"
          "fetch('" + URL + "?t='+Date.now(),{cache:'no-store'})"
          ".then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()})"
          ".then(function(t){(0,eval)(t)})"
          ".catch(function(e){if(window.__sdlSkin)window.__sdlSkin.toggle();else alert('SUNODLAA : chargement impossible ('+e.message+')')})})()")

readme = here.parent / 'README.md'
txt = readme.read_text(encoding='utf-8')
block = '<!--BOOKMARK-->\n```\n' + loader + '\n```\n<!--/BOOKMARK-->'
txt, n = re.subn(r'<!--BOOKMARK-->.*?<!--/BOOKMARK-->', lambda m: block, txt.replace('\r\n', '\n'), flags=re.S)
if n != 1:
    raise SystemExit('README.md: BOOKMARK markers not found')
readme.write_text(txt, encoding='utf-8', newline='\n')

# docs/index.html = https://soaresden.github.io/SunoDLAA/ : one button to drag (GitHub strips javascript: links in READMEs).
page = '''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SUNODLAA</title>
<style>
  :root{--bg:#0d0d12;--card:#15151d;--txt:#ecebf3;--mut:#8e8ca3}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(circle at 15% 10%,rgba(232,30,140,.25),transparent 45%),radial-gradient(circle at 85% 90%,rgba(61,123,255,.25),transparent 45%),var(--bg);color:var(--txt);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .card{max-width:560px;width:100%;background:var(--card);border-radius:24px;padding:32px 28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  .logo{max-width:100%;width:380px}
  .bm{position:relative;display:inline-flex;flex-direction:column;align-items:center;margin:26px 0 8px;padding:14px 30px;border-radius:16px;text-decoration:none;overflow:hidden;isolation:isolate;cursor:grab;box-shadow:0 0 22px rgba(232,30,140,.4)}
  .bm::before{content:"";position:absolute;inset:-150%;background:conic-gradient(from 0deg,#E81E8C,#FFC400,#009B8E,#3D7BFF,#8B3DFF,#E81E8C);animation:rot 3s linear infinite;z-index:-2}
  .bm::after{content:"";position:absolute;inset:3px;border-radius:13px;background:#111116;z-index:-1}
  .bm b{font:900 22px/1.1 system-ui,sans-serif;letter-spacing:.8px;background:linear-gradient(90deg,#E81E8C,#FFC400,#3D7BFF);-webkit-background-clip:text;background-clip:text;color:transparent}
  .bm span{font:600 12px/1.3 system-ui,sans-serif;color:#b9b7c8}
  @keyframes rot{to{transform:rotate(360deg)}}
  ol{text-align:left;padding-left:22px;margin:22px 0 0}li{margin:8px 0}
  kbd{background:#24242f;border-radius:6px;padding:1px 7px;font:600 13px ui-monospace,monospace}
  .mut{color:var(--mut);font-size:13px;margin-top:18px}
  #hint{display:none;color:#FF4F8B;font-weight:700}
  a.gh{color:#8ab4ff}
</style>
</head>
<body>
<div class="card">
  <img class="logo" src="https://raw.githubusercontent.com/soaresden/SunoDLAA/main/assets/logo.png" alt="SUNODLAA">
  <div><a class="bm" id="bm" href="__HREF__"><b>♪ SUNODLAA</b></a></div>
  <div class="mut" style="margin-top:0">dernière version / latest: v__VER__</div>
  <div id="hint">⤴ Ne clique pas : glisse-le dans ta barre de favoris. / Drag it, don't click.</div>
  <ol>
    <li>Affiche la barre de favoris : <kbd>Ctrl</kbd> + <kbd>Maj</kbd> + <kbd>B</kbd></li>
    <li><b>Glisse le bouton ♪ SUNODLAA dans la barre.</b></li>
    <li>Sur <b>suno.com</b> (connecté), clique le favori. <kbd>Échap</kbd> ou un 2ᵉ clic le cache.</li>
  </ol>
  <div class="mut">Une seule fois : le favori charge toujours la dernière version.<br>Once, for good: the bookmark always loads the latest version.<br><a class="gh" href="https://github.com/soaresden/SunoDLAA">github.com/soaresden/SunoDLAA</a></div>
</div>
<script>
  document.getElementById('bm').addEventListener('click', function (e) { e.preventDefault(); document.getElementById('hint').style.display = 'block'; });
</script>
</body>
</html>
'''
docs = here.parent / 'docs'
(docs / 'index.html').write_text(page.replace('__HREF__', loader.replace('&', '&amp;').replace('"', '&quot;')).replace('__VER__', ver), encoding='utf-8', newline='\n')
(docs / '.nojekyll').write_text('', encoding='utf-8')
print('sunodlaa.js v' + ver, len(code), 'chars; bookmark in README and docs/index.html', len(loader), 'chars')
