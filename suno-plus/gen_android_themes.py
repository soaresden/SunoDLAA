# Generates android/.../ui/theme/Themes.kt from themes.json, so the phone and the suno.com overlay share the same themes.
import json, pathlib, sys
here = pathlib.Path(__file__).parent
themes = json.loads((here / 'themes.json').read_text(encoding='utf-8'))
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / 'Themes.kt'
def c(h): return 'Color(0xFF' + h.lstrip('#').upper() + ')'
rows = []
for t in themes:
    rows.append('    SdlTheme("%s", "%s", %s, bg = %s, panel = %s, panel2 = %s, line = %s, txt = %s, mut = %s, acc = %s, acc2 = %s, acc3 = %s, gold = %s,\n        deco = listOf(%s))' % (
        t['id'], t['name'], 'true' if t['dark'] else 'false', c(t['bg']), c(t['panel']), c(t['panel2']), c(t['line']), c(t['txt']), c(t['mut']),
        c(t['acc']), c(t['acc2']), c(t['acc3']), c(t['gold']), ', '.join(c(x) for x in t['deco'])))
out.write_text('''package com.soaresden.sunoauto.ui.theme

// GENERATED from suno-plus/themes.json by suno-plus/gen_android_themes.py - same themes as the suno.com overlay.
import androidx.compose.ui.graphics.Color

val SDL_THEMES = listOf(
%s
)
''' % ',\n'.join(rows), encoding='utf-8')
print(out)
