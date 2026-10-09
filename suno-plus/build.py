# Builds the bookmark overlay:
#  - suno-plus/sunodlaa.js : suno-plus.js with the themes inside. Committed: the bookmark loads it from GitHub (main).
#  - "SUNODLAA - Installer le favori.html" (repo root): the page with the bookmark to drag. The bookmark is a small
#    loader that fetches sunodlaa.js from GitHub at each click, so it is installed once and updates by itself on push.
import urllib.parse, datetime, pathlib, re, json
here = pathlib.Path(__file__).parent
code = (here / 'suno-plus.js').read_text(encoding='utf-8')
themes = json.loads((here / 'themes.json').read_text(encoding='utf-8'))
code = code.replace('/*@THEMES@*/[]', json.dumps(themes, ensure_ascii=False, separators=(',', ':')))
(here / 'sunodlaa.js').write_text(code, encoding='utf-8', newline='\n')
ver = re.search(r"VERSION = '([^']+)'", code)
ver = ver.group(1) if ver else datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

URL = 'https://raw.githubusercontent.com/soaresden/SunoDLAA/main/suno-plus/sunodlaa.js'
loader = ("(function(){if(window.__sdlSkin){window.__sdlSkin.toggle();return}"
          "if(!/(^|\\.)suno\\.com$/.test(location.hostname)){location.href='https://suno.com/';return}"
          "fetch('" + URL + "?t='+Date.now(),{cache:'no-store'})"
          ".then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()})"
          ".then(function(t){(0,eval)(t)})"
          ".catch(function(e){alert('SUNODLAA : chargement impossible depuis GitHub ('+e.message+')')})})()")
href = 'javascript:' + urllib.parse.quote(loader, safe="()*!'.-_~;,/?:@&=+${}|")
html = (here / 'installer.template.html').read_text(encoding='utf-8')
html = html.replace('__HREF__', href.replace('"', '%22').replace('&', '&amp;')).replace('__VER__', ver)
out = here.parent / 'SUNODLAA - Installer le favori.html'
out.write_text(html, encoding='utf-8', newline='\r\n')
print(out.name, 'v' + ver, '- loader', len(href), 'chars,', (here / 'sunodlaa.js').name, len(code), 'chars')
