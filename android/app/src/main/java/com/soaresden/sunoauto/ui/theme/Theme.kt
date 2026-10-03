package com.soaresden.sunoauto.ui.theme

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/** One SUNODLAA theme (same list as the suno.com overlay, see Themes.kt). */
data class SdlTheme(
    val id: String, val name: String, val dark: Boolean,
    val bg: Color, val panel: Color, val panel2: Color, val line: Color, val txt: Color, val mut: Color,
    val acc: Color, val acc2: Color, val acc3: Color, val gold: Color, val deco: List<Color>
)

/** The chosen theme, saved on the phone and applied at once. */
object ThemeState {
    private const val PREFS = "sunodlaa_ui"
    private const val KEY = "theme"
    const val DEFAULT = "holi"
    val current = mutableStateOf(DEFAULT)
    private var loaded = false
    fun load(ctx: Context) {
        if (loaded) return; loaded = true
        current.value = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, DEFAULT) ?: DEFAULT
    }
    fun set(ctx: Context, id: String) {
        current.value = id
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, id).apply()
    }
    fun theme(id: String = current.value): SdlTheme = SDL_THEMES.firstOrNull { it.id == id } ?: SDL_THEMES.first()
}

val LocalSdlTheme = staticCompositionLocalOf { SDL_THEMES.first() }

/** Colour of the original (★) tracks in the current theme. */
val Gold: Color @Composable get() = LocalSdlTheme.current.gold

private fun scheme(t: SdlTheme) = if (t.dark) darkColorScheme(
    primary = t.acc, onPrimary = Color.White, primaryContainer = t.panel2, onPrimaryContainer = t.txt,
    secondary = t.acc2, onSecondary = Color.White, secondaryContainer = t.panel2, onSecondaryContainer = t.txt,
    tertiary = t.acc3, onTertiary = Color.White,
    background = t.bg, onBackground = t.txt, surface = t.panel, onSurface = t.txt,
    surfaceVariant = t.panel2, onSurfaceVariant = t.mut, outline = t.line, outlineVariant = t.line,
    surfaceContainer = t.panel, surfaceContainerHigh = t.panel2, surfaceContainerLow = t.panel,
    error = Color(0xFFFF6B6B), onError = Color.White
) else lightColorScheme(
    primary = t.acc, onPrimary = Color.White, primaryContainer = t.panel2, onPrimaryContainer = t.txt,
    secondary = t.acc2, onSecondary = Color.White, secondaryContainer = t.panel2, onSecondaryContainer = t.txt,
    tertiary = t.acc3, onTertiary = Color.White,
    background = t.bg, onBackground = t.txt, surface = t.panel, onSurface = t.txt,
    surfaceVariant = t.panel2, onSurfaceVariant = t.mut, outline = t.line, outlineVariant = t.line,
    surfaceContainer = t.panel, surfaceContainerHigh = t.panel2, surfaceContainerLow = t.panel,
    error = Color(0xFFD32F4B), onError = Color.White
)

@Composable
fun SunoTheme(content: @Composable () -> Unit) {
    ThemeState.load(LocalContext.current)
    val t = ThemeState.theme(ThemeState.current.value)
    CompositionLocalProvider(LocalSdlTheme provides t) {
        MaterialTheme(colorScheme = scheme(t), content = content)
    }
}

/** The theme's soft coloured background (same blobs as on the suno.com overlay). */
@Composable
fun ThemedBackground(content: @Composable BoxScope.() -> Unit) {
    val t = LocalSdlTheme.current
    val alpha = if (t.dark) 0.22f else 0.28f
    val spots = listOf(Offset(0.08f, 0.06f), Offset(0.92f, 0.12f), Offset(0.78f, 0.92f), Offset(0.14f, 0.88f), Offset(0.5f, 0.5f))
    Box(Modifier.fillMaxSize().background(t.bg).decorate(t.deco.mapIndexed { i, c -> spots[i % spots.size] to c.copy(alpha = alpha) }), content = content)
}

private fun Modifier.decorate(spots: List<Pair<Offset, Color>>): Modifier = this.drawBehind {
    spots.forEach { (o, c) ->
        drawRect(Brush.radialGradient(listOf(c, Color.Transparent), center = Offset(o.x * size.width, o.y * size.height), radius = 0.55f * maxOf(size.width, size.height)))
    }
}
