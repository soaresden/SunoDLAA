# Builds "SUNODLAA - Installer le favori.html": the bookmark = javascript: + the whole suno-plus.js.
import urllib.parse, datetime, pathlib, re
here = pathlib.Path(__file__).parent
code = (here / 'suno-plus.js').read_text(encoding='utf-8')
import json
themes = json.loads((here / 'themes.json').read_text(encoding='utf-8'))
code = code.replace('/*@THEMES@*/[]', json.dumps(themes, ensure_ascii=False, separators=(',', ':')))
(here / 'suno-plus.built.js').write_text(code, encoding='utf-8')
ver = re.search(r"VERSION = '([^']+)'", code)
ver = ver.group(1) if ver else datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
href = 'javascript:' + urllib.parse.quote(code, safe="()*!'.-_~;,/?:@&=+$")
html = (here / 'installer.template.html').read_text(encoding='utf-8')
html = html.replace('__HREF__', href.replace('"', '%22').replace('&', '&amp;')).replace('__VER__', ver)
out = here / 'SUNODLAA - Installer le favori.html'
out.write_text(html, encoding='utf-8', newline='\r\n')
print(out, len(href))
