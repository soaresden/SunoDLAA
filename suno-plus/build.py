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
print('sunodlaa.js v' + ver, len(code), 'chars; bookmark in README', len(loader), 'chars')
