package com.soaresden.sunoauto.auth

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.soaresden.sunoauto.SunoApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Logs in through Suno's own web page in a WebView and captures the Clerk `__client` cookie.
 *
 * Google refuses to sign in inside an Android WebView ("this browser may not be secure") when it
 * detects the WebView user-agent, so we strip the "; wv" marker and present a plain mobile Chrome
 * UA. That is enough for Google / Discord / e-mail flows in practice. If it still fails, the
 * settings screen offers a "paste cookie" fallback.
 */
class LoginActivity : ComponentActivity() {

    companion object {
        private const val TAG = "LoginActivity"
        const val START_URL = "https://suno.com/create"
        private val COOKIE_HOSTS = listOf("https://suno.com", "https://auth.suno.com", "https://clerk.suno.com")
    }

    private lateinit var web: WebView
    private var done = false
    private var checking = false
    private var lastTried: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        web = WebView(this)
        root.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 8))
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            userAgentString = userAgentString.replace("; wv", "").replace("Version/4.0 ", "")
        }
        web.webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) { progress.progress = newProgress }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) { checkCookie() }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = false
        }
        web.loadUrl(START_URL)
    }

    /**
     * Called after every page load. Clerk gives even anonymous visitors a `__client` cookie, so a
     * cookie alone proves nothing: we require the `__client_uat*` marker to be non-zero (Clerk sets
     * it to 0 while signed out) and then ask Clerk for a session token before accepting it.
     */
    private fun checkCookie() {
        if (done || checking) return
        val cm = CookieManager.getInstance()
        val client = COOKIE_HOSTS.firstNotNullOfOrNull { host -> extract(cm.getCookie(host), "__client") }
        if (client.isNullOrBlank() || client == lastTried) return
        val uat = COOKIE_HOSTS.firstNotNullOfOrNull { host -> extractPrefixed(cm.getCookie(host), "__client_uat") }
        if (uat == "0") { Log.d(TAG, "cookie present but not signed in yet"); return }
        checking = true
        lastTried = client
        lifecycleScope.launch {
            val app = SunoApp.get(this@LoginActivity)
            val ok = try {
                withContext(Dispatchers.IO) { app.auth.probe(client) }
                true
            } catch (e: Exception) {
                Log.w(TAG, "cookie rejected by Clerk: ${e.message}")
                false
            }
            checking = false
            if (!ok) return@launch
            done = true
            Log.i(TAG, "captured a signed-in __client cookie")
            app.prefs.setClientCookie(client)
            app.auth.invalidate()
            app.repo.requestSync()
            setResult(RESULT_OK)
            finish()
        }
    }

    private fun extract(cookieHeader: String?, name: String): String? =
        cookieHeader?.split(';')?.map { it.trim() }?.firstOrNull { it.startsWith("$name=") }?.substringAfter('=')

    /** First cookie whose name starts with [prefix] (Clerk suffixes some cookies, e.g. `__client_uat_Jnxw-muT`). */
    private fun extractPrefixed(cookieHeader: String?, prefix: String): String? =
        cookieHeader?.split(';')?.map { it.trim() }?.firstOrNull { it.startsWith(prefix) }?.substringAfter('=')

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
