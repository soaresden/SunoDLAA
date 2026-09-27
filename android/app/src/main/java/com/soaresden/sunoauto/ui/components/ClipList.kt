package com.soaresden.sunoauto.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.soaresden.sunoauto.data.db.ClipEntity

/**
 * A list of clips with a header row (play all / shuffle / download all).
 * Shared by the workspace, playlist, liked, downloaded and search screens.
 */
@Composable
fun ClipList(
    clips: List<ClipEntity>,
    currentId: String?,
    vm: com.soaresden.sunoauto.ui.LibraryViewModel,
    player: com.soaresden.sunoauto.ui.PlayerViewModel,
    projectName: String? = null,
    onDownloadAll: (() -> Unit)? = null,
    emptyText: String = "Rien ici pour l'instant.",
    showProjectSubtitle: Boolean = false,
    bottomPadding: androidx.compose.ui.unit.Dp = 0.dp
) {
    if (clips.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(emptyText, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val projects by vm.projects.collectAsStateWithLifecycle()
    val nameById = projects.associate { it.id to it.name }
    LazyColumn(contentPadding = PaddingValues(bottom = bottomPadding + 8.dp)) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(onClick = { player.play(clips, 0, projectName) }) {
                    Icon(Icons.Default.PlayArrow, null); Text(" Lire (${clips.size})")
                }
                OutlinedButton(onClick = { player.playShuffled(clips, projectName) }) {
                    Icon(Icons.Default.Shuffle, null); Text(" Aléatoire")
                }
                if (onDownloadAll != null) OutlinedButton(onClick = onDownloadAll) {
                    Icon(Icons.Outlined.Download, null)
                }
            }
        }
        items(clips, key = { it.id }) { clip ->
            val idx = clips.indexOf(clip)
            ClipRow(
                clip = clip,
                isCurrent = clip.id == currentId,
                onClick = { player.play(clips, idx, projectName) },
                onToggleLike = { vm.toggleLike(clip.id) },
                onDownload = { vm.download(listOf(clip.id)) },
                onRemoveDownload = { vm.removeDownload(clip.id) },
                onPlayNext = { player.addNext(clip) },
                subtitleOverride = if (showProjectSubtitle) listOfNotNull(
                    clip.durationSec?.let(::fmtDuration), nameById[clip.projectId] ?: clip.tags?.take(40)
                ).joinToString(" · ") else null
            )
        }
    }
}

