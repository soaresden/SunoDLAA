# SUNODLAA — instructions for Claude Code

## Who / how
- Owner: Denis (Soaresden). **Always answer in French.** Short answers, then do the work.
- Repo: `D:\DOCS\Documents\GitHub\SunoPlayerDownloader` → GitHub `soaresden/SunoDLAA`.
- Commit when a piece of work is done and verified (clear message). **Push only when Denis asks.**
- JSON files we write: pretty, 4-space indent, `"key": value`, CRLF, UTF-8 without BOM.
- Never commit secrets: Suno cookies (`__client`), tokens, `*cookies*.json`, `local.properties`.

## What the project is (since Oct 2026)
Suno capped downloads on 2026-09-03 (Pro 20/month, older songs included), so the desktop
downloader (SunoAAWeb) was deleted. SUNODLAA is now **the player Suno never built**:

| Part | Where | What |
|---|---|---|
| Bookmark overlay | `suno-plus/` + the bookmark line in `README.md` | Full-screen UI on top of suno.com in the user's own tab: workspaces, all tracks, sort (incl. plays), dates, karaoke + LRC, rename / lyrics / move / delete / like / pin / upload, 💡 name suggestions, ⧉ generations, 🗣️/🎼, synced with suno.com's player, Explore, Create, spy, 23 themes, FR/EN |
| Android + Android Auto | `android/` (Kotlin, Compose, Media3, Room, WorkManager) | Workspaces-first player; tracks without a file play through **Suno's own web player** in a hidden WebView; optional pCloud/phone files + play cache |
| DHU launcher | `Launch Android Drive Unit Test.bat` | Android Auto on the PC (Desktop Head Unit), MX-5 1280×480 preset |
| Releases | `releases/SUNODLAA-vX.Y.Z.apk` | Ready-to-install APKs |

## Hard rules (non-negotiable)
- **No DRM / protection bypass.** Suno streams are encrypted ("Mango", AES with license keys).
  Never decrypt, rip, record or cache Suno audio. Audio is always played by Suno's own player
  (bookmark: the suno.com page; Android: `SunoWebEngine` WebView) or comes from the user's own files.
- **No download-limit bypass**, no use of `/api/download/...` in bulk.
- **No content-filter bypass** (Suno blocks copyrighted audio/lyrics uploads; don't help around it).
  This includes the tempo trick: speeding a track up to pass the upload check, then slowing it back
  in Suno Studio (`/api/studio/render-state`). The overlay's upload sends files as they are, nothing more.
- Suno writes only through the calls suno.com itself makes, listed in the `WRITES` whitelist of
  `suno-plus.js` (see `docs/suno-api.md`). Add an endpoint only after seeing it in a spy log.

## Bookmark overlay (`suno-plus/`)
- Source: `suno-plus/suno-plus.js` (one IIFE, ES5-style, no build tools). Version: `var VERSION = 'x.y.z'` at the top — bump it on every change.
- Themes: `suno-plus/themes.json` (shared with Android). Injected at build in place of `/*@THEMES@*/[]`.
- Build: `python suno-plus/build.py` → writes `suno-plus/sunodlaa.js` (script + themes, **committed**) and the bookmark
  line in `README.md` (between `<!--BOOKMARK-->` markers; no installer page any more). The bookmark is a **fixed** loader:
  each click fetches `raw.githubusercontent.com/soaresden/SunoDLAA/main/suno-plus/sunodlaa.js?t=…` and evals it
  (suno.com's CSP allows it). **Never change the loader** (Denis would have to reinstall); put logic in the script.
  The script itself: same VERSION already open → toggle; older one open → `destroy()` it and start (a version without
  `destroy`, i.e. < 2.12, → page reload). So every global hook must go through `on(target, ev, fn)` / `offs`
  (listeners, intervals) so `destroy()` can unplug it. **A change reaches Denis only once pushed to `main`.**
  Always rebuild and commit `sunodlaa.js` with `suno-plus.js`.
- Syntax check: `node -e "new Function(require('fs').readFileSync('suno-plus/sunodlaa.js','utf8'))"`.
- i18n: every UI string goes through `tr('français', 'English')` / `pl(n, fr1, frN, en1, enN)`; language = browser language.
- Gotchas learnt the hard way:
  - suno.com's `<html>`/`<body>` carry `data-*` attributes (`data-theme`…): in the click handler use the
    scoped `cl(selector)`, never a bare `closest()`; prefix our data attributes (`data-sdltheme`).
  - Never name a local variable `tr` (shadows the i18n function).
  - Song pages are opened with `window.next.router.push('/song/<id>')` (keeps the overlay alive), then
    Suno's Play button is found by label (`Play`/`Lire`…) or by its ▶ SVG path (`M6 18.70…`).
  - The SUNODLAA button is inserted right under Suno's logo (`a[href="/"] svg[viewBox="0 0 606 149"]`), re-placed every 1.5 s.
  - Create screen fills Suno's /create form (Advanced mode): title input, lyrics contenteditable
    (paste event, then execCommand fallback), style textarea (maxLength 1000), exclude input, voice
    buttons (Homme/Femme), then clicks "Créer la chanson". **Not yet confirmed working while signed in.**
- Console spy for Denis: `docs/console-spy.js` — he pastes it in F12, types `start()`, does the action on suno.com,
  `stop()` copies a log (no tokens/cookies/emails/file contents) that he pastes here.
- Debug: F12 → Console, filter `SUNODLAA`. The 🕵 spy records suno.com's own API calls (method, path,
  JSON body, status, start of answer — never tokens) and "Structure de la page" dumps form fields.
- Test without an account with Playwright on public songs (headless Chromium, `--autoplay-policy=no-user-gesture-required`).

## Android (`android/`)
- Build (JDK 17; Android Studio's JBR works):
  `set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` then `cd android && gradlew.bat :app:assembleDebug`
  → `android/app/build/outputs/apk/debug/app-debug.apk`, copy to `releases/SUNODLAA-v<versionName>.apk`.
- Version: `versionCode` / `versionName` in `android/app/build.gradle.kts` — bump both every release.
- Install: `adb install -r releases\SUNODLAA-vX.Y.Z.apk` (phone on USB).
- Themes: never edit `ui/theme/Themes.kt` by hand →
  `python suno-plus/gen_android_themes.py android/app/src/main/java/com/soaresden/sunoauto/ui/theme/Themes.kt`.
- Key files (package `com.soaresden.sunoauto`):
  - `player/PlaybackService.kt` — MediaLibraryService for phone + Android Auto; ExoPlayer queue;
    keeps Suno's page in step (`syncWeb`, `followWeb`); always holds the audio focus.
  - `player/SunoWebEngine.kt` — hidden WebView on `https://suno.com/song/<id>` (desktop UA), presses Play,
    JS bridge `SDL` reports playing/time/ended/pause. Shares cookies with `auth/LoginActivity`.
  - `player/WebTrack.kt` — tracks without a file are `sunoweb://clip/<id>?ms=<duration>` in the queue;
    `SilentWavDataSource` feeds ExoPlayer a silent WAV of that length (queue/notification/AA keep working).
  - `player/PlayCache.kt` — LRU play cache for files (never for Suno web tracks).
  - `player/MediaItems.kt`, `player/BrowseTree.kt` — media items and the Android Auto tree.
  - `data/LocalImport.kt` — optional link of a pCloud/phone folder (match by TSRC/Suno id, manifest `SUNODLAA-index.json`).
  - `data/repo/LibraryRepository.kt` — sync with Suno, diagnostic zip (Settings → diagnostic), `DiagLog` events.
  - `ui/theme/Theme.kt` — `ThemeState` (saved choice), `SunoTheme`, `ThemedBackground`, `Gold`.
- Free mode: no Suno downloads, no Pro gating; music folder optional.
- Debug: Settings → send diagnostic (zip with sync stats, stream hosts, download/playback errors, `events:` log).

## Open items (Oct 2026)
- Create screen: confirm filling + "Créer" while signed in (Denis's French UI); adjust selectors from a spy log / page structure if needed.
- Android Auto: Suno web tracks with screen off / in the car — confirm; GPS prompts don't duck the WebView (option: pause/duck on transient focus loss).
- Android parity with the bookmark: "All tracks" grouping/sort, Explore, track dates.
- Git history: Denis may want it squashed to one commit (needs force-push) — ask before doing it.
- Old APKs in `releases/` could be pruned (keep the latest) — ask.

See `docs/suno-api.md` for every Suno endpoint we know.
