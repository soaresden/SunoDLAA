package com.soaresden.sunoauto.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.PlaylistPlay
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.soaresden.sunoauto.R
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.soaresden.sunoauto.data.db.ClipEntity
import java.io.File

@Composable
fun ClipRow(
    clip: ClipEntity,
    isCurrent: Boolean,
    onClick: () -> Unit,
    onToggleLike: () -> Unit,
    onDownload: () -> Unit,
    onRemoveDownload: () -> Unit,
    onPlayNext: () -> Unit,
    subtitleOverride: String? = null
) {
    var menu by remember { mutableStateOf(false) }
    val local = com.soaresden.sunoauto.data.LocalFiles.available(clip.localPath)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AsyncImage(
            model = clip.localCoverPath?.let(::File)?.takeIf { it.exists() } ?: clip.imageUrl,
            contentDescription = null,
            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp))
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (clip.isOriginal) Icon(Icons.Default.Star, stringResource(R.string.cd_original), Modifier.size(16.dp).padding(end = 2.dp), tint = Gold)
                Text(
                    clip.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (isCurrent || clip.isOriginal) FontWeight.Bold else FontWeight.Normal,
                    color = when {
                        clip.isOriginal -> Gold
                        isCurrent -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.onSurface
                    },
                    maxLines = 1, overflow = TextOverflow.Ellipsis
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Availability: ✅ jouable (fichier présent) / 🫥 absent (pas de fichier, non jouable en Free)
                if (local) Icon(Icons.Default.CheckCircle, stringResource(R.string.cd_available), Modifier.size(14.dp), tint = Available)
                else Icon(Icons.Default.CloudOff, stringResource(R.string.cd_unavailable), Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                if (isCurrent) Icon(Icons.Default.GraphicEq, null, Modifier.size(14.dp).padding(start = 2.dp), tint = MaterialTheme.colorScheme.primary)
                Text(
                    subtitleOverride ?: listOfNotNull(clip.durationSec?.let(::fmtDuration), clip.tags?.take(50)).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (local) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
        }
        IconButton(onClick = onToggleLike) {
            Icon(
                if (clip.isLiked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                contentDescription = stringResource(R.string.cd_favorite),
                tint = if (clip.isLiked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        IconButton(onClick = { menu = true }) {
            Icon(Icons.Default.MoreVert, contentDescription = null)
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.play_next)) },
                    leadingIcon = { Icon(Icons.Outlined.PlaylistPlay, null) },
                    onClick = { menu = false; onPlayNext() })
                if (local) DropdownMenuItem(
                    text = { Text(stringResource(R.string.remove_download)) },
                    leadingIcon = { Icon(Icons.Default.DownloadDone, null) },
                    onClick = { menu = false; onRemoveDownload() })
                else DropdownMenuItem(
                    text = { Text(stringResource(R.string.download)) },
                    leadingIcon = { Icon(Icons.Outlined.Download, null) },
                    onClick = { menu = false; onDownload() })
            }
        }
    }
}

fun fmtDuration(sec: Double): String {
    val s = sec.toInt()
    return "%d:%02d".format(s / 60, s % 60)
}

fun fmtMs(ms: Long): String = fmtDuration(ms / 1000.0)

/** ISO timestamp from Suno → "Aug 13, 2026" / "13 août 2026" depending on the app language. */
fun fmtDate(iso: String): String = runCatching {
    java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()).toLocalDate()
        .format(java.time.format.DateTimeFormatter.ofPattern(
            com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.date_pattern),
            com.soaresden.sunoauto.LocaleHelper.locale()))
}.getOrDefault(iso.take(10))

/** Epoch millis → short localized date + time (last sync). */
fun fmtShort(ms: Long): String =
    java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofLocalizedDateTime(java.time.format.FormatStyle.SHORT)
            .withLocale(com.soaresden.sunoauto.LocaleHelper.locale()))

val Gold = androidx.compose.ui.graphics.Color(0xFFE3B341)
val Available = androidx.compose.ui.graphics.Color(0xFF4CAF50)
