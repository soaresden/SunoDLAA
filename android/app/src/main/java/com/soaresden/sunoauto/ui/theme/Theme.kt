package com.soaresden.sunoauto.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Palette « Holi » : fond CLAIR façon papier, accents vifs et saturés
 * (fuchsia, turquoise, jaune/orange). Fixe (pas de Material You) pour garder
 * l'identité SUNODLAA constante sur tous les téléphones.
 */
private val Holi = lightColorScheme(
    primary = Color(0xFFE81E8C),          // fuchsia
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFFD6EC),
    onPrimaryContainer = Color(0xFF3E0026),
    secondary = Color(0xFF009B8E),        // turquoise
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFA9FFF3),
    onSecondaryContainer = Color(0xFF00201D),
    tertiary = Color(0xFFF57C00),         // orange soleil
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFFE0B2),
    onTertiaryContainer = Color(0xFF2A1800),
    background = Color(0xFFFFF9FC),        // papier rosé très clair
    onBackground = Color(0xFF1B1B1F),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1B1B1F),
    surfaceVariant = Color(0xFFFBEAF3),   // rose pâle
    onSurfaceVariant = Color(0xFF574150),
    outline = Color(0xFFCBA9BE),
    error = Color(0xFFD32F4B),
    onError = Color(0xFFFFFFFF),
)

@Composable
fun SunoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Holi, content = content)
}
