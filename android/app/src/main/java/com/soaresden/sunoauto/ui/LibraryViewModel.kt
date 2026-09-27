package com.soaresden.sunoauto.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.soaresden.sunoauto.SunoApp
import com.soaresden.sunoauto.data.db.ClipEntity
import com.soaresden.sunoauto.data.db.DownloadEntity
import com.soaresden.sunoauto.data.db.PlaylistEntity
import com.soaresden.sunoauto.data.db.ProjectEntity
import com.soaresden.sunoauto.data.db.ProjectRow
import com.soaresden.sunoauto.data.repo.LibraryRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
class LibraryViewModel(app: Application) : AndroidViewModel(app) {

    private val sunoApp = SunoApp.get(app)
    val repo: LibraryRepository get() = sunoApp.repo
    val prefs get() = sunoApp.prefs

    val isLoggedIn: StateFlow<Boolean?> = prefs.isLoggedIn.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val syncState = repo.syncState
    val lastSync: StateFlow<Long> = prefs.lastSync.stateIn(viewModelScope, SharingStarted.Eagerly, 0L)
    val clipCount: StateFlow<Int> = repo.observeClipCount().stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    val projects: StateFlow<List<ProjectEntity>> = repo.observeProjects().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val projectRows: StateFlow<List<ProjectRow>> = repo.observeProjectRows().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val accountLabel: StateFlow<String?> = repo.accountLabel.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val accountPlan: StateFlow<String?> = repo.accountPlan.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val credits: StateFlow<Int?> = repo.credits.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val importState = repo.importState
    val localSummary: StateFlow<String?> = repo.localSummary.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val localTree: StateFlow<String?> = repo.localTree.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val isPro: StateFlow<Boolean> = repo.isPro.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val folderPattern: StateFlow<String?> = repo.folderPattern.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val liked: StateFlow<List<ClipEntity>> = repo.observeLiked().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val downloaded: StateFlow<List<ClipEntity>> = repo.observeDownloaded().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val recent: StateFlow<List<ClipEntity>> = repo.observeRecent().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val playlists: StateFlow<List<PlaylistEntity>> = repo.observePlaylists().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val downloads: StateFlow<List<DownloadEntity>> = repo.observeDownloads().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    enum class SortMode { DATE, ALPHA, WORKSPACE }
    val sortMode = MutableStateFlow(SortMode.DATE)
    fun setSort(m: SortMode) { sortMode.value = m }

    enum class Filter { ALL, FAVORITES, OFFLINE }
    val filter = MutableStateFlow(Filter.ALL)
    fun setFilter(f: Filter) { filter.value = f }

    enum class ViewMode { TRACKS, WORKSPACES }
    val viewMode = MutableStateFlow(ViewMode.TRACKS)
    fun setViewMode(m: ViewMode) { viewMode.value = m }

    val allClips: StateFlow<List<ClipEntity>> = repo.observeAllClips().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            runCatching { repo.recomputeOriginals() }
            // Light check at startup: incremental sync only re-reads workspaces that changed.
            runCatching {
                if (prefs.isLoggedIn.first() && System.currentTimeMillis() - prefs.lastSync.first() > 10 * 60_000) repo.requestSync()
            }
        }
    }

    val query = MutableStateFlow("")
    val searchResults: StateFlow<List<ClipEntity>> = query
        .debounce(200)
        .flatMapLatest { q -> if (q.isBlank()) flowOf(emptyList()) else repo.observeSearch(q.trim()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun projectClips(id: String): Flow<List<ClipEntity>> = repo.observeProjectClips(id)
    fun playlistClips(id: String): Flow<List<ClipEntity>> = repo.observePlaylistClips(id)

    fun sync() = repo.requestSync()
    fun toggleLike(id: String) = viewModelScope.launch { repo.toggleLike(id) }
    fun download(ids: List<String>) = viewModelScope.launch { repo.enqueueDownload(ids) }
    fun downloadProject(id: String) = viewModelScope.launch { repo.enqueueProjectDownload(id) }
    fun downloadPlaylist(id: String) = viewModelScope.launch { repo.enqueuePlaylistDownload(id) }
    fun downloadLiked() = viewModelScope.launch { repo.enqueueLikedDownload() }
    fun removeDownload(id: String) = viewModelScope.launch { repo.removeDownload(id) }
    fun clearFinished() = viewModelScope.launch { repo.clearFinishedDownloads() }
    fun logout() = viewModelScope.launch { repo.logout() }

    val cookieMessage = MutableStateFlow<String?>(null)

    fun setCookie(cookie: String) = viewModelScope.launch {
        val value = cookie.trim().removePrefix("__client=").trim()
        cookieMessage.value = "Vérification…"
        try {
            withContext(Dispatchers.IO) { sunoApp.auth.probe(value) }
            prefs.setClientCookie(value)
            sunoApp.auth.invalidate()
            cookieMessage.value = "Cookie accepté, synchronisation lancée."
            repo.requestSync()
        } catch (e: Exception) {
            cookieMessage.value = "Cookie refusé par Suno : ${e.message}"
        }
    }
    fun setLocalTree(uri: String) = viewModelScope.launch { repo.setLocalTree(uri) }
    fun setPro(v: Boolean) = viewModelScope.launch { repo.setPro(v) }
    fun reimportLocal() = viewModelScope.launch { repo.importLocalFolder() }
    fun setFolderPattern(v: String) = viewModelScope.launch { repo.setFolderPattern(v) }
    fun exportDiagnostic(ctx: android.content.Context) = viewModelScope.launch {
        try {
            val file = repo.writeDiagnosticZip()
            val uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.packageName + ".fileprovider", file)
            val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType("application/zip")
                .putExtra(android.content.Intent.EXTRA_STREAM, uri)
                .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            ctx.startActivity(android.content.Intent.createChooser(send, "Envoyer le diagnostic").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) { cookieMessage.value = "Diagnostic: ${e.message}" }
    }
    fun exportDatabase(ctx: android.content.Context) = viewModelScope.launch {
        try {
            val file = repo.writeDatabaseJson()
            val uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.packageName + ".fileprovider", file)
            val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType("application/zip")
                .putExtra(android.content.Intent.EXTRA_STREAM, uri).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            ctx.startActivity(android.content.Intent.createChooser(send, "Exporter la base").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) { cookieMessage.value = "Export: ${e.message}" }
    }
    fun setApiBase(v: String) = viewModelScope.launch { prefs.setApiBase(v) }
    fun setClerkBase(v: String) = viewModelScope.launch { prefs.setClerkBase(v) }
}
