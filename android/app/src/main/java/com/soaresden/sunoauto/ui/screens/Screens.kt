package com.soaresden.sunoauto.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Star
import androidx.compose.ui.draw.alpha
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.soaresden.sunoauto.R
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.soaresden.sunoauto.data.db.ClipEntity
import com.soaresden.sunoauto.ui.LibraryViewModel
import com.soaresden.sunoauto.ui.PlayerViewModel
import com.soaresden.sunoauto.ui.components.ClipList
import com.soaresden.sunoauto.ui.components.fmtDate
import java.text.DateFormat
import java.util.Date

// ---------------------------------------------------------------- Bibliothèque (workspaces)

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun LibraryScreen(vm: LibraryViewModel, player: PlayerViewModel, onOpenProject: (String) -> Unit, bottomPadding: Dp) {
    val rows by vm.projectRows.collectAsStateWithLifecycle()
    val sync by vm.syncState.collectAsStateWithLifecycle()
    val count by vm.clipCount.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val results by vm.searchResults.collectAsStateWithLifecycle()
    val sortMode by vm.sortMode.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val viewMode by vm.viewMode.collectAsStateWithLifecycle()
    val now by player.state.collectAsStateWithLifecycle()
    val liked by vm.liked.collectAsStateWithLifecycle()
    val downloaded by vm.downloaded.collectAsStateWithLifecycle()
    val allClips by vm.allClips.collectAsStateWithLifecycle()
    val allProjects by vm.projects.collectAsStateWithLifecycle()
    val lastSync by vm.lastSync.collectAsStateWithLifecycle()
    val nameById = remember(allProjects) { allProjects.associate { it.id to it.name } }

    val sortedRows = remember(rows, sortMode) {
        if (sortMode == LibraryViewModel.SortMode.ALPHA) rows.sortedBy { it.project.name.lowercase() } else rows
    }

    Column(Modifier.fillMaxSize()) {
        if (sync.running) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                Text(stringResource(R.string.sync_running, sync.message.orEmpty()), style = MaterialTheme.typography.bodySmall)
                LinearProgressIndicator(progress = { sync.progress }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            }
        } else if (sync.error != null) {
            Text(stringResource(R.string.sync_error, sync.error ?: ""), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
        }

        androidx.compose.material3.OutlinedTextField(
            value = query, onValueChange = { vm.query.value = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            placeholder = { Text(stringResource(R.string.search_hint)) },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            trailingIcon = { if (query.isNotEmpty()) androidx.compose.material3.IconButton(onClick = { vm.query.value = "" }) { Icon(Icons.Default.Close, stringResource(R.string.clear)) } },
            singleLine = true
        )

        androidx.compose.foundation.layout.FlowRow(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            // Mode : Tous (morceaux groupés) / Workspace (dossiers)
            androidx.compose.material3.FilterChip(selected = viewMode == LibraryViewModel.ViewMode.TRACKS, onClick = { vm.setViewMode(LibraryViewModel.ViewMode.TRACKS) }, label = { Text(stringResource(R.string.chip_all)) })
            androidx.compose.material3.FilterChip(selected = viewMode == LibraryViewModel.ViewMode.WORKSPACES, onClick = { vm.setViewMode(LibraryViewModel.ViewMode.WORKSPACES) }, leadingIcon = { Icon(Icons.Default.Folder, null, Modifier.size(16.dp)) }, label = { Text(stringResource(R.string.chip_workspace)) })
            if (viewMode == LibraryViewModel.ViewMode.TRACKS) {
                androidx.compose.material3.FilterChip(selected = filter == LibraryViewModel.Filter.FAVORITES, onClick = { vm.setFilter(if (filter == LibraryViewModel.Filter.FAVORITES) LibraryViewModel.Filter.ALL else LibraryViewModel.Filter.FAVORITES) }, leadingIcon = { Icon(Icons.Default.Favorite, null, Modifier.size(16.dp)) }, label = { Text(stringResource(R.string.chip_favorites)) })
                androidx.compose.material3.FilterChip(selected = filter == LibraryViewModel.Filter.OFFLINE, onClick = { vm.setFilter(if (filter == LibraryViewModel.Filter.OFFLINE) LibraryViewModel.Filter.ALL else LibraryViewModel.Filter.OFFLINE) }, leadingIcon = { Icon(Icons.Default.CheckCircle, null, Modifier.size(16.dp)) }, label = { Text(stringResource(R.string.chip_offline)) })
            }
            androidx.compose.material3.FilterChip(selected = sortMode == LibraryViewModel.SortMode.DATE, onClick = { vm.setSort(LibraryViewModel.SortMode.DATE) }, label = { Text(stringResource(R.string.chip_date)) })
            androidx.compose.material3.FilterChip(selected = sortMode == LibraryViewModel.SortMode.ALPHA, onClick = { vm.setSort(LibraryViewModel.SortMode.ALPHA) }, label = { Text(stringResource(R.string.chip_alpha)) })
        }
        Spacer(Modifier.height(4.dp))

        // Recherche : liste plate
        if (query.isNotBlank()) {
            ClipList(sortClips(results, sortMode, nameById), now.clipId, vm, player, emptyText = stringResource(R.string.no_results), showProjectSubtitle = true, bottomPadding = bottomPadding)
            return
        }

        // Mode Workspace : dossiers
        if (viewMode == LibraryViewModel.ViewMode.WORKSPACES) {
            if (sortedRows.isEmpty() && !sync.running) {
                EmptyLibrary(vm); return
            }
            LazyColumn(contentPadding = PaddingValues(bottom = bottomPadding + 8.dp)) {
                item {
                    Text(stringResource(R.string.summary_workspaces, count, sortedRows.size) + if (lastSync > 0) stringResource(R.string.synced_at, com.soaresden.sunoauto.ui.components.fmtShort(lastSync)) else "",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                }
                items(sortedRows, key = { it.project.id }) { row ->
                    val p = row.project
                    Row(Modifier.fillMaxWidth().clickable { onOpenProject(p.id) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (row.coverUrl != null) AsyncImage(model = row.coverUrl, contentDescription = null, modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)))
                        else Box(Modifier.size(52.dp), contentAlignment = Alignment.Center) { Icon(Icons.Default.Folder, null, tint = MaterialTheme.colorScheme.primary) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(listOfNotNull(stringResource(R.string.n_tracks, p.clipCount), row.oldestAt?.let { stringResource(R.string.since, fmtDate(it)) }).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        row.newestAt?.let { Text(fmtDate(it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 4.dp)) }
                        Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            return
        }

        // Mode Tous (morceaux) : groupés visuellement par workspace
        val source = when (filter) {
            LibraryViewModel.Filter.FAVORITES -> liked
            LibraryViewModel.Filter.OFFLINE -> downloaded
            else -> allClips
        }
        if (source.isEmpty()) {
            if (!sync.running) EmptyLibrary(vm)
            return
        }
        val noWs = stringResource(R.string.no_workspace)
        val groups = remember(source, sortMode, nameById, noWs) {
            source.groupBy { it.projectId }
                .map { (pid, cs) -> (nameById[pid] ?: noWs) to sortClips(cs, sortMode, nameById) }
                .sortedBy { it.first.lowercase() }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = bottomPadding + 8.dp)) {
            item {
                Text(stringResource(R.string.summary_tracks, source.size) + if (lastSync > 0) stringResource(R.string.synced_at, com.soaresden.sunoauto.ui.components.fmtShort(lastSync)) else "",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            }
            groups.forEach { (wsName, clips) ->
                item(key = "h_" + wsName) {
                    Text(wsName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp))
                }
                items(clips, key = { it.id }) { clip ->
                    val idx = clips.indexOf(clip)
                    com.soaresden.sunoauto.ui.components.ClipRow(
                        clip = clip, isCurrent = clip.id == now.clipId,
                        onClick = { player.play(clips, idx, wsName) },
                        onToggleLike = { vm.toggleLike(clip.id) },
                        onDownload = { vm.download(listOf(clip.id)) },
                        onRemoveDownload = { vm.removeDownload(clip.id) },
                        onPlayNext = { player.addNext(clip) }
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyLibrary(vm: LibraryViewModel) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(stringResource(R.string.empty_library), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.empty_library_hint), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Button(onClick = { vm.sync() }) { Text(stringResource(R.string.sync_now)) }
        }
    }
}

/** Sorts a clip list by the chosen mode: date (newest first), title A→Z, or workspace then title. */
private fun sortClips(list: List<ClipEntity>, mode: LibraryViewModel.SortMode, nameById: Map<String, String>): List<ClipEntity> = when (mode) {
    LibraryViewModel.SortMode.ALPHA -> list.sortedBy { it.title.lowercase() }
    LibraryViewModel.SortMode.WORKSPACE -> list.sortedWith(compareBy({ nameById[it.projectId]?.lowercase() ?: "~" }, { it.title.lowercase() }))
    LibraryViewModel.SortMode.DATE -> list.sortedByDescending { it.createdAt ?: "" }
}

// ---------------------------------------------------------------- Un workspace

@Composable
fun ProjectScreen(projectId: String, vm: LibraryViewModel, player: PlayerViewModel, bottomPadding: Dp) {
    val clips by vm.projectClips(projectId).collectAsStateWithLifecycle(initialValue = emptyList())
    val projects by vm.projects.collectAsStateWithLifecycle()
    val now by player.state.collectAsStateWithLifecycle()
    val name = projects.firstOrNull { it.id == projectId }?.name
    ClipList(clips, now.clipId, vm, player, projectName = name, onDownloadAll = { vm.downloadProject(projectId) }, bottomPadding = bottomPadding)
}

// ---------------------------------------------------------------- Favoris

@Composable
fun LikedScreen(vm: LibraryViewModel, player: PlayerViewModel, bottomPadding: Dp) {
    val clips by vm.liked.collectAsStateWithLifecycle()
    val now by player.state.collectAsStateWithLifecycle()
    ClipList(clips, now.clipId, vm, player, onDownloadAll = { vm.downloadLiked() }, emptyText = stringResource(R.string.empty_liked), showProjectSubtitle = true, bottomPadding = bottomPadding)
}

// ---------------------------------------------------------------- Récents

@Composable
fun RecentScreen(vm: LibraryViewModel, player: PlayerViewModel, bottomPadding: Dp) {
    val clips by vm.recent.collectAsStateWithLifecycle()
    val now by player.state.collectAsStateWithLifecycle()
    ClipList(clips, now.clipId, vm, player, emptyText = stringResource(R.string.empty_recent), showProjectSubtitle = true, bottomPadding = bottomPadding)
}

// ---------------------------------------------------------------- Playlists

@Composable
fun PlaylistsScreen(vm: LibraryViewModel, onOpen: (String) -> Unit, bottomPadding: Dp) {
    val lists by vm.playlists.collectAsStateWithLifecycle()
    if (lists.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(stringResource(R.string.empty_playlists), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        return
    }
    LazyColumn(contentPadding = PaddingValues(bottom = bottomPadding + 8.dp)) {
        items(lists, key = { it.id }) { p ->
            Row(Modifier.fillMaxWidth().clickable { onOpen(p.id) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(model = p.imageUrl, contentDescription = null, modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(p.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(stringResource(R.string.n_tracks, p.clipCount), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun PlaylistScreen(playlistId: String, vm: LibraryViewModel, player: PlayerViewModel, bottomPadding: Dp) {
    val clips by vm.playlistClips(playlistId).collectAsStateWithLifecycle(initialValue = emptyList())
    val lists by vm.playlists.collectAsStateWithLifecycle()
    val now by player.state.collectAsStateWithLifecycle()
    ClipList(clips, now.clipId, vm, player, projectName = lists.firstOrNull { it.id == playlistId }?.name,
        onDownloadAll = { vm.downloadPlaylist(playlistId) }, showProjectSubtitle = true, bottomPadding = bottomPadding)
}

// ---------------------------------------------------------------- Recherche

@Composable
fun SearchScreen(vm: LibraryViewModel, player: PlayerViewModel, bottomPadding: Dp) {
    val q by vm.query.collectAsStateWithLifecycle()
    val results by vm.searchResults.collectAsStateWithLifecycle()
    val now by player.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = q, onValueChange = { vm.query.value = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            placeholder = { Text(stringResource(R.string.search_hint_full)) },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            singleLine = true
        )
        if (q.isBlank()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.search_intro), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(24.dp))
            }
        } else ClipList(results, now.clipId, vm, player, emptyText = stringResource(R.string.no_results), showProjectSubtitle = true, bottomPadding = bottomPadding)
    }
}

// ---------------------------------------------------------------- Téléchargements

@Composable
fun DownloadsScreen(vm: LibraryViewModel, player: PlayerViewModel, bottomPadding: Dp) {
    val downloaded by vm.downloaded.collectAsStateWithLifecycle()
    val queue by vm.downloads.collectAsStateWithLifecycle()
    val now by player.state.collectAsStateWithLifecycle()
    val pending = queue.filter { it.state != 2 }
    Column(Modifier.fillMaxSize()) {
        if (pending.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.in_queue, pending.size), style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                TextButton(onClick = { vm.clearFinished() }) { Text(stringResource(R.string.clean)) }
            }
            pending.take(5).forEach { d ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (d.state == 1) CircularProgressIndicator(progress = { d.progress / 100f }, modifier = Modifier.size(18.dp))
                    else if (d.state == 3) Icon(Icons.Outlined.Delete, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                    else CircularProgressIndicator(modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(d.error ?: d.clipId.take(8), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    IconButton(onClick = { vm.removeDownload(d.clipId) }) { Icon(Icons.Outlined.Delete, null) }
                }
            }
        }
        ClipList(downloaded, now.clipId, vm, player, emptyText = stringResource(R.string.empty_downloads), showProjectSubtitle = true, bottomPadding = bottomPadding)
    }
}

// ---------------------------------------------------------------- Écran d'accueil (première ouverture)

@Composable
fun OnboardingScreen(vm: LibraryViewModel, onLogin: () -> Unit, onPickFolder: () -> Unit, onDone: () -> Unit) {
    val loggedIn by vm.isLoggedIn.collectAsStateWithLifecycle()
    val folder by vm.localTree.collectAsStateWithLifecycle()
    val plan by vm.accountPlan.collectAsStateWithLifecycle()
    androidx.compose.foundation.layout.Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(24.dp))
        Icon(Icons.Default.LibraryMusic, null, Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.welcome), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(
            stringResource(R.string.welcome_sub),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 4.dp)
        )
        Spacer(Modifier.height(12.dp))
        LanguagePicker()
        Spacer(Modifier.height(16.dp))

        OnboardStep(
            n = "1", title = stringResource(R.string.ob_connect_title),
            desc = stringResource(R.string.ob_connect_desc),
            done = loggedIn == true, actionLabel = if (loggedIn == true) stringResource(R.string.reconnect) else stringResource(R.string.sign_in), onAction = onLogin
        )
        if (loggedIn == true && plan != null) Text(
            if (plan == "Pro") stringResource(R.string.ob_pro)
            else stringResource(R.string.ob_free),
            style = MaterialTheme.typography.bodySmall,
            color = if (plan == "Pro") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
        )
        OnboardStep(
            n = "2", title = stringResource(R.string.ob_folder_title),
            desc = stringResource(R.string.ob_folder_desc),
            done = folder != null, actionLabel = if (folder != null) stringResource(R.string.change) else stringResource(R.string.choose_folder), onAction = onPickFolder
        )

        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.Surface(
            color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                stringResource(R.string.ob_info),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(12.dp)
            )
        }

        Spacer(Modifier.height(20.dp))
        Button(onClick = onDone, enabled = loggedIn == true, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.start)) }
        if (loggedIn != true) Text(stringResource(R.string.ob_need_login), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun OnboardStep(n: String, title: String, desc: String, done: Boolean, actionLabel: String, onAction: () -> Unit) {
    androidx.compose.material3.Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (done) Icon(Icons.Default.CheckCircle, null, tint = androidx.compose.ui.graphics.Color(0xFF4CAF50))
                else Text(n, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
            }
            Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
            androidx.compose.material3.OutlinedButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

// ---------------------------------------------------------------- Barre de statut du compte (permanente)

@Composable
fun AccountStatusBar(vm: LibraryViewModel) {
    val loggedIn by vm.isLoggedIn.collectAsStateWithLifecycle()
    val plan by vm.accountPlan.collectAsStateWithLifecycle()
    val credits by vm.credits.collectAsStateWithLifecycle()
    val lastSync by vm.lastSync.collectAsStateWithLifecycle()
    if (loggedIn != true) return
    val pro = plan == "Pro"
    val transition = androidx.compose.animation.core.rememberInfiniteTransition(label = "pro")
    val glow by transition.animateFloat(
        initialValue = 0.4f, targetValue = 1f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(
            androidx.compose.animation.core.tween(1100), androidx.compose.animation.core.RepeatMode.Reverse
        ), label = "glow"
    )
    val gold = androidx.compose.ui.graphics.Color(0xFFE3B341)
    androidx.compose.material3.Surface(
        color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (pro) {
                Icon(Icons.Default.Star, null, Modifier.size(18.dp).alpha(glow), tint = gold)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.account_pro), fontWeight = FontWeight.Bold, color = gold, modifier = Modifier.alpha(glow))
            } else {
                Icon(Icons.Default.AccountCircle, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.account_free), fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.weight(1f))
            credits?.let { Text(stringResource(R.string.credits, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (lastSync > 0) Text("  " + stringResource(R.string.synced_at, com.soaresden.sunoauto.ui.components.fmtShort(lastSync)).trim(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ---------------------------------------------------------------- Choix de la langue (préférence)

/** English / Français switch. Saved as a preference and applied immediately (the screen is recreated). */
@Composable
fun LanguagePicker() {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val current = com.soaresden.sunoauto.LocaleHelper.get(ctx)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Language, null, tint = MaterialTheme.colorScheme.primary)
        androidx.compose.material3.FilterChip(selected = current == com.soaresden.sunoauto.LocaleHelper.EN,
            onClick = { applyLanguage(ctx, com.soaresden.sunoauto.LocaleHelper.EN) }, label = { Text(stringResource(R.string.lang_en)) })
        androidx.compose.material3.FilterChip(selected = current == com.soaresden.sunoauto.LocaleHelper.FR,
            onClick = { applyLanguage(ctx, com.soaresden.sunoauto.LocaleHelper.FR) }, label = { Text(stringResource(R.string.lang_fr)) })
    }
}

private fun applyLanguage(ctx: android.content.Context, lang: String) {
    if (com.soaresden.sunoauto.LocaleHelper.get(ctx) == lang) return
    com.soaresden.sunoauto.LocaleHelper.set(ctx, lang)
    var c: android.content.Context? = ctx
    while (c is android.content.ContextWrapper && c !is android.app.Activity) c = c.baseContext
    (c as? android.app.Activity)?.recreate()
}
