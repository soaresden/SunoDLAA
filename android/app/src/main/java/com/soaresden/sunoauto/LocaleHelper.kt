package com.soaresden.sunoauto

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/**
 * App language preference (English by default, French available), independent of the phone's
 * system language. Stored in plain SharedPreferences because it must be readable synchronously
 * in attachBaseContext, before anything else runs.
 */
object LocaleHelper {
    const val EN = "en"
    const val FR = "fr"
    val SUPPORTED = listOf(EN, FR)

    private const val PREFS = "sunodlaa_locale"
    private const val KEY = "lang"

    fun get(ctx: Context): String =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, EN)?.takeIf { it in SUPPORTED } ?: EN

    fun set(ctx: Context, lang: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, lang).apply()
    }

    /** Returns a context whose resources use the chosen language. */
    fun wrap(base: Context): Context {
        val locale = Locale(get(base))
        Locale.setDefault(locale)
        val cfg = Configuration(base.resources.configuration)
        cfg.setLocale(locale)
        return base.createConfigurationContext(cfg)
    }

    /** Application context, set once by [SunoApp]. */
    lateinit var app: Context

    /** Current locale object (for date formatting). */
    fun locale(): Locale = Locale(get(app))

    /** String in the current app language, usable outside of UI code (sync, Android Auto, workers). */
    fun s(id: Int, vararg args: Any): String = wrap(app).getString(id, *args)
}
