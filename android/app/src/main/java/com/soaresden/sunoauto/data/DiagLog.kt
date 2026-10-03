package com.soaresden.sunoauto.data

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Last events worth a look (downloads, playback errors), kept for the diagnostic report. */
object DiagLog {
    private const val PREFS = "sunodlaa_diag"
    private const val KEY = "events"
    private const val MAX = 120

    @Synchronized
    fun add(ctx: Context, line: String) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(Date())
        val lines = (p.getString(KEY, "") ?: "").lines().filter { it.isNotBlank() }.takeLast(MAX - 1) + "$now $line"
        p.edit().putString(KEY, lines.joinToString("\n")).apply()
    }

    fun all(ctx: Context): String = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "") ?: ""
}
