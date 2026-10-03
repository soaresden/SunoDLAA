package com.soaresden.sunoauto.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.DownloadDone
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.soaresden.sunoauto.R
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import coil.compose.AsyncImage
import com.soaresden.sunoauto.ui.LibraryViewModel
import com.soaresden.sunoauto.ui.PlayerViewModel
import com.soaresden.sunoauto.ui.components.fmtMs
import kotlinx.coroutines.flow.flowOf

@Composable
fun NowPlayingScreen(vm: LibraryViewModel, player: PlayerViewModel) {
    val s by player.state.collectAsStateWithLifecycle()
    val clip by (s.clipId?.let { vm.repo.observeClip(it) } ?: flowOf(null)).collectAsStateWithLifecycle(initialValue = null)
    val local = clip?.localPath != null

    Column(Modifier.fillMaxSize().verticalScroll(androidx.compose.foundation.rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        AsyncImage(
            model = clip?.localCoverPath ?: s.artworkUri, contentDescription = null,
            modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(16.dp))
        )
        Spacer(Modifier.height(24.dp))
        Text(s.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
        Text(s.subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, maxLines = 1)
        clip?.tags?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, maxLines = 2, modifier = Modifier.padding(top = 4.dp)) }
        Spacer(Modifier.height(16.dp))
        Slider(
            value = if (s.durationMs > 0) s.positionMs.toFloat() / s.durationMs else 0f,
            onValueChange = { player.seekTo((it * s.durationMs).toLong()) },
            modifier = Modifier.fillMaxWidth()
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(fmtMs(s.positionMs), style = MaterialTheme.typography.labelSmall)
            Text(fmtMs(s.durationMs), style = MaterialTheme.typography.labelSmall)
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { player.toggleShuffle() }) {
                Icon(Icons.Default.Shuffle, null, tint = if (s.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = { player.prev() }, enabled = s.hasPrev) { Icon(Icons.Default.SkipPrevious, null, Modifier.size(36.dp)) }
            FilledIconButton(onClick = { player.togglePlay() }, modifier = Modifier.size(72.dp)) {
                Icon(if (s.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null, Modifier.size(40.dp))
            }
            IconButton(onClick = { player.next() }, enabled = s.hasNext) { Icon(Icons.Default.SkipNext, null, Modifier.size(36.dp)) }
            IconButton(onClick = { player.cycleRepeat() }) {
                Icon(
                    if (s.repeatMode == Player.REPEAT_MODE_ONE) Icons.Default.RepeatOne else Icons.Default.Repeat, null,
                    tint = if (s.repeatMode != Player.REPEAT_MODE_OFF) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            IconButton(onClick = { s.clipId?.let { vm.toggleLike(it); player.toggleLikeCurrent() } }) {
                Icon(if (clip?.isLiked == true) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null,
                    tint = if (clip?.isLiked == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // ---- Infos du titre (exhaustif) ----
        clip?.let { c ->
            Spacer(Modifier.height(20.dp))
            androidx.compose.material3.HorizontalDivider()
            Spacer(Modifier.height(12.dp))
            Column(Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.info), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                InfoLine(stringResource(R.string.title_workspace), vmProjectName(vm, c.projectId))
                InfoLine(stringResource(R.string.model), c.modelName)
                InfoLine(stringResource(R.string.style_tags), c.tags)
                InfoLine(stringResource(R.string.duration), c.durationSec?.let { fmtMs((it * 1000).toLong()) })
                InfoLine(stringResource(R.string.created), c.createdAt?.let { iso -> val pat = stringResource(R.string.date_time_pattern); runCatching { java.text.SimpleDateFormat(pat, com.soaresden.sunoauto.LocaleHelper.locale()).format(java.util.Date(java.time.Instant.parse(iso).toEpochMilli())) }.getOrNull() })
                InfoLine(stringResource(R.string.original), if (c.isOriginal) stringResource(R.string.original_yes) else null)
                InfoLine(stringResource(R.string.local_file), if (c.localPath != null) stringResource(R.string.yes) else stringResource(R.string.local_no))
                InfoLine(stringResource(R.string.suno_id), c.id)
            }
            if (!c.lyrics.isNullOrBlank()) {
                Spacer(Modifier.height(16.dp))
                Text(stringResource(R.string.lyrics), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                Text(c.lyrics!!, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth())
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$label : ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun vmProjectName(vm: LibraryViewModel, projectId: String?): String? {
    val projects by vm.projects.collectAsStateWithLifecycle()
    return projects.firstOrNull { it.id == projectId }?.name
}
