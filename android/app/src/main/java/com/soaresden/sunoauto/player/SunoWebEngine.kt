package com.soaresden.sunoauto.player

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import com.soaresden.sunoauto.data.DiagLog

/**
 * Plays a track WITH SUNO'S OWN WEB PLAYER, exactly like suno.com in a browser: a hidden WebView
 * opens https://suno.com/song/<id> with the user's own session and presses Play. Suno's page
 * fetches, unlocks and plays the audio itself; the app never touches that audio (no copy, no
 * cache). The app only says play / pause / seek and listens to the page's progress.
 */
@SuppressLint("SetJavaScriptEnabled")
class SunoWebEngine(private val ctx: Context, private val listener: Listener) {

    interface Listener {
        fun onWebPlaying(clipId: String, positionSec: Double, durationSec: Double)
        fun onWebTime(clipId: String, positionSec: Double, durationSec: Double, paused: Boolean)
        fun onWebEnded(clipId: String)
        fun onWebPausedByItself(clipId: String)
        fun onWebFailed(clipId: String, why: String)
    }

    private val main = Handler(Looper.getMainLooper())
    private var web: WebView? = null
    var clipId: String? = null; private set
    private var wantPlay = false
    private var startAtSec = 0.0
    private var ready = false

    private fun view(): WebView = web ?: WebView(ctx.applicationContext).also { w ->
        CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(w, true) }
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // Desktop page: no "open the app" pop-up over the player.
            userAgentString = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        w.addJavascriptInterface(Bridge(), "SDL")
        w.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                if (url?.contains("/song/") != true) return
                inject()
            }
        }
        w.resumeTimers(); w.onResume()
        web = w
    }

    /** Opens the clip's page and starts it (or just prepares it when [play] is false). */
    fun load(id: String, play: Boolean, atSec: Double = 0.0) {
        clipId = id; wantPlay = play; startAtSec = atSec; ready = false
        ensureSession()
        view().loadUrl("https://suno.com/song/$id")
        main.removeCallbacks(watchdog); main.postDelayed(watchdog, 45_000)
    }

    fun play() { wantPlay = true; if (ready) js("window.__sdlResume&&window.__sdlResume()") }
    fun pause() { wantPlay = false; js("window.__sdlPause&&window.__sdlPause()") }
    fun seek(sec: Double) { if (ready) js("window.__sdlSeek&&window.__sdlSeek(${"%.2f".format(java.util.Locale.US, sec)})") else startAtSec = sec }
    /** Leaves Suno's page idle (switching to a local file). */
    fun stop() { wantPlay = false; clipId = null; main.removeCallbacks(watchdog); js("window.__sdlPause&&window.__sdlPause()") }

    fun release() {
        main.removeCallbacks(watchdog)
        web?.apply { stopLoading(); loadUrl("about:blank"); destroy() }
        web = null
    }

    private val watchdog = Runnable {
        val id = clipId ?: return@Runnable
        if (!ready && wantPlay) listener.onWebFailed(id, "Suno's player did not start (network or not signed in?)")
    }

    private fun js(code: String) { web?.evaluateJavascript(code, null) }

    /** The page shares the app's login (same cookie jar as the sign-in screen). */
    private fun ensureSession() {
        val cm = CookieManager.getInstance()
        val has = listOf("https://auth.suno.com", "https://clerk.suno.com").any { cm.getCookie(it)?.contains("__client=") == true }
        if (has) return
        val cookie = runCatching { kotlinx.coroutines.runBlocking { com.soaresden.sunoauto.SunoApp.get(ctx).prefs.clientCookieNow() } }.getOrNull() ?: return
        for (h in listOf("https://auth.suno.com", "https://clerk.suno.com"))
            cm.setCookie(h, "__client=$cookie; Path=/; Secure; SameSite=None")
        cm.flush()
    }

    private fun inject() {
        js(HOOKS)
        if (wantPlay) js("window.__sdlPlay(${"%.2f".format(java.util.Locale.US, startAtSec)})")
    }

    private inner class Bridge {
        @JavascriptInterface
        fun onEvent(e: String, t: Double, d: Double, paused: Boolean, path: String) {
            main.post {
                val id = clipId ?: return@post
                if (!path.contains(id)) return@post
                when (e) {
                    "playing" -> {
                        ready = true; main.removeCallbacks(watchdog)
                        if (!wantPlay) js("window.__sdlPause()") else listener.onWebPlaying(id, t, d)
                    }
                    "time" -> listener.onWebTime(id, t, d, paused)
                    "pause" -> if (wantPlay && ready && (d <= 0 || t < d - 0.7)) { wantPlay = false; listener.onWebPausedByItself(id) }
                    "ended" -> listener.onWebEnded(id)
                    "timeout" -> { DiagLog.add(ctx, "web ${id.take(8)}: Play not found on the page"); listener.onWebFailed(id, "Suno's page did not play") }
                }
            }
        }
    }

    companion object {
        /** Hooks Suno's page: reports progress, and offers play / pause / seek. Nothing else. */
        private val HOOKS = """
(function(){
 if (window.__sdl) return; window.__sdl = true;
 var last = 0;
 function A(){ var as=document.querySelectorAll('audio'); for (var i=0;i<as.length;i++){ if(as[i].src && as[i].src.indexOf('blob:')===0) return as[i]; } return null; }
 function send(e){ var a=A(); try{ SDL.onEvent(e, a?a.currentTime:0, (a&&isFinite(a.duration))?a.duration:0, a?a.paused:true, location.pathname); }catch(x){} }
 document.addEventListener('playing', function(ev){ if(ev.target===A()) send('playing'); }, true);
 document.addEventListener('pause', function(ev){ if(ev.target===A()) send('pause'); }, true);
 document.addEventListener('ended', function(ev){ if(ev.target===A()) send('ended'); }, true);
 document.addEventListener('timeupdate', function(ev){ var n=Date.now(); if(ev.target===A() && n-last>1000){ last=n; send('time'); } }, true);
 window.__sdlPlay = function(at){ var tries=0, seeked=false; (function tick(){ tries++; var a=A();
   if (a && !a.paused) { if (at>1 && !seeked) { seeked=true; a.currentTime=at; } send('playing'); return; }
   var bs=document.querySelectorAll('button[aria-label]'), main=null, bar=null;
   for (var i=0;i<bs.length;i++){ var l=bs[i].getAttribute('aria-label'); if(l==='Play') main=bs[i]; if(l==='Playbar: Play button') bar=bs[i]; }
   if (a && a.paused && a.currentTime>0) { a.play(); }
   else if (main && tries%10===1) main.click();
   else if (!main && bar && tries>10 && tries%10===1) bar.click();
   if (tries<80) setTimeout(tick, 500); else send('timeout');
 })(); };
 window.__sdlPause=function(){ var a=A(); if(a) a.pause(); };
 window.__sdlResume=function(){ var a=A(); if(a && a.currentTime>0) a.play(); else window.__sdlPlay(0); };
 window.__sdlSeek=function(s){ var a=A(); if(a) a.currentTime=s; };
})();
"""
    }
}
