package com.soaresden.sunoauto.data.repo

import android.content.Context
import android.util.Log
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.soaresden.sunoauto.data.api.ApiClip
import com.soaresden.sunoauto.SunoApp
import com.soaresden.sunoauto.data.api.SunoApi
import com.soaresden.sunoauto.data.db.AppDatabase
import com.soaresden.sunoauto.data.db.ClipEntity
import com.soaresden.sunoauto.data.db.DownloadEntity
import com.soaresden.sunoauto.data.db.PlaylistEntity
import com.soaresden.sunoauto.data.db.ProjectEntity
import com.soaresden.sunoauto.data.db.ProjectRow
import com.soaresden.sunoauto.data.prefs.AppPrefs
import com.soaresden.sunoauto.work.DownloadWorker
import com.soaresden.sunoauto.work.SyncWorker
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/**
 * Single access point for the UI and the media service. Reads always hit the local Room cache
 * (fast, works offline); [syncAll] refreshes it from Suno.
 */
class LibraryRepository(
    private val context: Context,
    private val db: AppDatabase,
    private val api: SunoApi,
    private val prefs: AppPrefs
) {
    companion object { private const val TAG = "LibraryRepo" }

    data class SyncState(val running: Boolean = false, val message: String? = null, val error: String? = null, val progress: Float = 0f)

    private val _syncState = MutableStateFlow(SyncState())
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

    data class ImportState(val running: Boolean = false, val done: Int = 0, val total: Int = 0, val message: String? = null)
    private val _importState = MutableStateFlow(ImportState())
    val importState: StateFlow<ImportState> = _importState.asStateFlow()
    val localSummary: Flow<String?> get() = prefs.localSummary
    val localTree: Flow<String?> get() = prefs.localTree
    val folderPattern: Flow<String?> get() = prefs.folderPattern
    val isPro: Flow<Boolean> get() = prefs.isPro
    suspend fun isProNow(): Boolean = prefs.isProNow()

    private val projectNameCache = HashMap<String, String>()

    // ---- reads ------------------------------------------------------------------------------

    fun observeProjects(): Flow<List<ProjectEntity>> = db.projects().observeAll()
    fun observeProjectRows(): Flow<List<ProjectRow>> = db.projects().observeRows()
    suspend fun projectRows(): List<ProjectRow> = db.projects().rows()
    val accountLabel: Flow<String?> get() = prefs.accountLabel
    val accountPlan: Flow<String?> get() = prefs.accountPlan
    val credits: Flow<Int?> get() = prefs.credits
    fun observeProjectClips(id: String): Flow<List<ClipEntity>> = db.clips().observeByProject(id)
    fun observeLiked(): Flow<List<ClipEntity>> = db.clips().observeLiked()
    fun observeDownloaded(): Flow<List<ClipEntity>> = db.clips().observeDownloaded()
    fun observeRecent(): Flow<List<ClipEntity>> = db.clips().observeRecent()
    fun observePlaylists(): Flow<List<PlaylistEntity>> = db.playlists().observeAll()
    fun observePlaylistClips(id: String): Flow<List<ClipEntity>> = db.playlists().observeClips(id)
    fun observeSearch(q: String): Flow<List<ClipEntity>> = db.clips().observeSearch(q)
    fun observeClip(id: String): Flow<ClipEntity?> = db.clips().observeById(id)
    fun observeDownloads(): Flow<List<DownloadEntity>> = db.downloads().observeAll()
    fun observeClipCount(): Flow<Int> = db.clips().observeCount()
    fun observeAllClips(): Flow<List<ClipEntity>> = db.clips().observeAllClips()

    suspend fun projects() = db.projects().all()
    suspend fun project(id: String) = db.projects().byId(id)
    suspend fun clipsOfProject(id: String) = db.clips().byProject(id)
    suspend fun liked() = db.clips().liked()
    suspend fun downloaded() = db.clips().downloaded()
    suspend fun recent(limit: Int) = db.clips().recent(limit)
    suspend fun allClips() = db.clips().search("", 5000)
    suspend fun search(q: String) = if (q.isBlank()) emptyList() else db.clips().search(q.trim())
    suspend fun clip(id: String) = db.clips().byId(id)
    suspend fun playlists() = db.playlists().all()
    suspend fun playlist(id: String) = db.playlists().byId(id)
    suspend fun clipsOfPlaylist(id: String) = db.playlists().clips(id)

    suspend fun projectName(id: String?): String? {
        if (id == null) return null
        projectNameCache[id]?.let { return it }
        return db.projects().byId(id)?.name?.also { projectNameCache[id] = it }
    }

    suspend fun markPlayed(id: String) = db.clips().markPlayed(id)

    // ---- likes ------------------------------------------------------------------------------

    /** Optimistic toggle: flip locally first, then tell Suno; roll back on failure. */
    suspend fun toggleLike(id: String): Boolean {
        val current = db.clips().byId(id) ?: return false
        val target = !current.isLiked
        db.clips().setLiked(id, target)
        try {
            api.setLiked(id, target)
        } catch (e: Exception) {
            Log.w(TAG, "like sync failed for $id", e)
            db.clips().setLiked(id, current.isLiked)
            return current.isLiked
        }
        return target
    }

    // ---- sync -------------------------------------------------------------------------------

    fun requestSync() {
        WorkManager.getInstance(context).enqueueUniqueWork(
            SyncWorker.NAME, ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<SyncWorker>()
                .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
        )
    }

    /** Full refresh: projects, every project's clips, likes, playlists. Called by [SyncWorker]. */
    suspend fun syncAll() {
        if (_syncState.value.running) return
        _syncState.value = SyncState(running = true, message = "Workspaces…")
        try {
            runCatching {
                val b = api.billingInfo()
                val pro = b.isActive == true
                prefs.setAccountPlan(if (pro) "Pro" else "Free")
                prefs.setPro(pro)
                prefs.setCredits(b.creditsLeft)
            }
            // 1. projects
            val known = db.projects().all().associateBy { it.id }
            val projects = ArrayList<ProjectEntity>()
            var page = 1
            while (true) {
                val p = api.projects(page)
                projects += p.projects.mapIndexed { i, it ->
                    ProjectEntity(
                        id = it.id, name = it.name.ifBlank { it.id }, isDefault = it.id == "default",
                        clipCount = it.clipCount, sortOrder = (page - 1) * SunoApi.PROJECTS_PAGE_SIZE + i,
                        updatedAt = System.currentTimeMillis(),
                        lastUpdatedClip = it.lastUpdatedClip,
                        syncMarker = known[it.id]?.syncMarker
                    )
                }
                if (p.projects.size < SunoApi.PROJECTS_PAGE_SIZE || projects.size >= p.numTotalResults) break
                page++
            }
            db.projects().upsertAll(projects)
            db.projects().deleteNotIn(projects.map { it.id })
            projectNameCache.clear()

            // 2. clips per project — incremental: a workspace is re-read only when Suno's
            //    last_updated_clip / clip_count changed since our last successful pass.
            val total = projects.size.coerceAtLeast(1)
            projects.forEachIndexed { idx, proj ->
                val marker = "p2|${proj.lastUpdatedClip}|${proj.clipCount}"
                val unchanged = proj.syncMarker == marker && (proj.clipCount == 0 || db.projects().localClipCount(proj.id) > 0)
                if (unchanged) return@forEachIndexed
                _syncState.value = SyncState(running = true, message = proj.name, progress = idx.toFloat() / total)
                if (proj.clipCount > 0) syncProjectClips(proj.id, proj.clipCount) else db.clips().pruneProject(proj.id, emptyList())
                db.projects().setSyncMarker(proj.id, marker)
            }

            db.clips().recomputeOriginals()

            // 3. likes
            _syncState.value = SyncState(running = true, message = com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.step_favorites), progress = 0.9f)
            syncLikes()

            // 4. playlists
            _syncState.value = SyncState(running = true, message = com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.step_playlists), progress = 0.95f)
            syncPlaylists()
            db.clips().recomputeOriginals()

            prefs.setLastSync(System.currentTimeMillis())
            _syncState.value = SyncState(running = false, message = null, progress = 1f)
        } catch (e: kotlinx.coroutines.CancellationException) {
            _syncState.value = SyncState(running = false, message = com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.sync_interrupted))
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "sync failed", e)
            _syncState.value = SyncState(running = false, error = e.message ?: e.toString())
            throw e
        }
    }

    /**
     * Reads every clip of a workspace through the project endpoint (/api/project/{id}?page=N).
     * This is the reliable source: it returns the workspace's real clips with their relationships
     * (cover_clip_id, task, type), unlike feed/v2?project_id which returns a generic, partial feed
     * and dropped clips — including the originals we need to gild.
     */
    suspend fun syncProjectClips(projectId: String, expectedCount: Int = Int.MAX_VALUE) {
        val seen = ArrayList<String>()
        var page = 1
        while (true) {
            val (total0, pageSize, raw) = api.projectDetailRaw(projectId, page)
            val playable = raw.filter { it.first.isPlayable }
            db.clips().mergeFromNetwork(playable.map { (c, rawStr) -> c.toEntity(projectId, rawStr) })
            seen += playable.map { it.first.id }
            val total = total0 ?: expectedCount
            if (pageSize == 0 || seen.size >= total) break
            page++
            if (page > 300) break // safety
        }
        db.clips().pruneProject(projectId, seen)
    }

    private suspend fun syncLikes() {
        val likedIds = ArrayList<String>()
        var page = 0
        while (true) {
            val feed = api.likedClips(page)
            val entities = feed.clips.filter { it.isPlayable }.map { it.toEntity(it.project?.id).copy(isLiked = true) }
            db.clips().mergeFromNetwork(entities)
            likedIds += entities.map { it.id }
            if (!feed.hasMore || feed.clips.isEmpty()) break
            page++
            if (page > 500) break
        }
        db.clips().clearLikesNotIn(likedIds)
    }

    private suspend fun syncPlaylists() {
        val lists = ArrayList<PlaylistEntity>()
        var page = 1
        while (true) {
            val p = api.playlists(page)
            lists += p.playlists.filter { !it.isTrashed }.map {
                PlaylistEntity(it.id, it.name.ifBlank { "Playlist" }, it.imageUrl, it.songCount ?: it.numTotalResults, System.currentTimeMillis())
            }
            if (p.playlists.size < SunoApi.FEED_PAGE_SIZE || lists.size >= p.numTotalResults) break
            page++
        }
        db.playlists().upsertAll(lists)
        db.playlists().deleteNotIn(lists.map { it.id })
        for (pl in lists) {
            val ids = ArrayList<String>()
            var pg = 1
            while (true) {
                val detail = api.playlistClips(pl.id, pg)
                val clips = detail.playlistClips.mapNotNull { it.clip }.filter { it.isPlayable }
                db.clips().mergeFromNetwork(clips.map { it.toEntity(it.project?.id) })
                ids += clips.map { it.id }
                if (detail.playlistClips.isEmpty() || ids.size >= detail.numTotalResults) break
                pg++
                if (pg > 200) break
            }
            db.playlists().replaceClips(pl.id, ids)
            if (ids.size != pl.clipCount) db.playlists().upsertAll(listOf(pl.copy(clipCount = ids.size)))
        }
    }

    private fun ApiClip.toEntity(projectId: String?, raw: String? = null) = ClipEntity(
        id = id,
        title = title.ifBlank { com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.untitled) },
        projectId = projectId,
        audioUrl = bestAudioUrl ?: "",
        imageUrl = imageLargeUrl ?: imageUrl,
        tags = metadata?.tags,
        durationSec = metadata?.duration,
        modelName = majorModelVersion ?: modelName,
        createdAt = createdAt,
        isLiked = isLiked,
        task = metadata?.task,
        coverClipId = metadata?.coverClipId,
        lyrics = metadata?.prompt,
        rawJson = raw
    )

    // ---- downloads --------------------------------------------------------------------------

    val apiClient get() = api

    fun downloadRoot(): File = File(context.getExternalFilesDir(android.os.Environment.DIRECTORY_MUSIC) ?: context.filesDir, "Suno")

    suspend fun enqueueDownload(clipIds: List<String>) {
        val wm = WorkManager.getInstance(context)
        for (id in clipIds) {
            val c = db.clips().byId(id) ?: continue
            if (c.localPath != null && File(c.localPath).exists()) continue
            db.downloads().upsert(DownloadEntity(clipId = id, state = 0))
            wm.enqueueUniqueWork(
                "dl-$id", ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<DownloadWorker>().setInputData(workDataOf(DownloadWorker.KEY_CLIP_ID to id)).build()
            )
        }
    }

    suspend fun enqueueProjectDownload(projectId: String) = enqueueDownload(db.clips().byProject(projectId).map { it.id })
    suspend fun enqueuePlaylistDownload(playlistId: String) = enqueueDownload(db.playlists().clips(playlistId).map { it.id })
    suspend fun enqueueLikedDownload() = enqueueDownload(db.clips().liked().map { it.id })

    suspend fun removeDownload(clipId: String) {
        val c = db.clips().byId(clipId) ?: return
        // Only delete files the app itself downloaded; never the user's imported originals.
        if (!com.soaresden.sunoauto.data.LocalFiles.isContent(c.localPath)) {
            c.localPath?.let { File(it).delete() }
            c.localCoverPath?.let { File(it).delete() }
        }
        db.clips().setLocalPath(clipId, null, null)
        db.downloads().delete(clipId)
        WorkManager.getInstance(context).cancelUniqueWork("dl-$clipId")
    }

    suspend fun clearFinishedDownloads() = db.downloads().clearDone()

    suspend fun logout() {
        prefs.logout()
        db.clearAllTables()
        projectNameCache.clear()
    }

    // ---- local library import ---------------------------------------------------------------

    suspend fun setPro(v: Boolean) = prefs.setPro(v)
    suspend fun recomputeOriginals() = db.clips().recomputeOriginals()

    /** Builds a zipped text report of the local DB + settings, so issues can be diagnosed. */
    suspend fun writeDiagnosticZip(): File = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        val projects = db.projects().all()
        val clips = db.clips().allClipsRaw()
        val byProject = clips.groupBy { it.projectId }
        val sb = StringBuilder()
        sb.appendLine("Suno Auto Player — diagnostic")
        sb.appendLine("version=${com.soaresden.sunoauto.BuildConfig.VERSION_NAME} (${com.soaresden.sunoauto.BuildConfig.VERSION_CODE})")
        sb.appendLine("generatedAt=${java.util.Date()}")
        sb.appendLine("account=${prefs.accountLabel.first() ?: "?"} plan=${prefs.accountPlan.first() ?: "?"} isPro=${prefs.isProNow()}")
        sb.appendLine("folderLinked=${prefs.localTreeNow() != null} pattern=${prefs.folderPatternNow() ?: ""}")
        sb.appendLine("lastSync=${java.util.Date(prefs.lastSync.first())}")
        sb.appendLine("totals: projects=${projects.size} clips=${clips.size} originals=${clips.count { it.isOriginal }} linkedLocal=${clips.count { it.localPath != null }}")
        sb.appendLine("=".repeat(60))
        for (p in projects) {
            val cs = byProject[p.id].orEmpty()
            sb.appendLine("WORKSPACE '${p.name}' id=${p.id} apiCount=${p.clipCount} dbCount=${cs.size} marker=${p.syncMarker}")
            for (c in cs) sb.appendLine("  - ${c.title.take(40)} | id=${c.id.take(8)} task=${c.task} orig=${c.isOriginal} cover=${c.coverClipId?.take(8)} local=${c.localPath != null}")
        }
        val file = File(context.cacheDir, "suno-diagnostic.zip")
        java.util.zip.ZipOutputStream(file.outputStream()).use { zip ->
            zip.putNextEntry(java.util.zip.ZipEntry("diagnostic.txt"))
            zip.write(sb.toString().toByteArray()); zip.closeEntry()
        }
        file
    }

    /** Full export of the local base as JSON (all clips with their tags/metadata), zipped. */
    suspend fun writeDatabaseJson(): File = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        val clips = db.clips().allClipsRaw()
        val projects = db.projects().all()
        val root = org.json.JSONObject()
        root.put("exportedAt", java.util.Date().toString())
        root.put("version", com.soaresden.sunoauto.BuildConfig.VERSION_NAME)
        val pj = org.json.JSONArray()
        for (p in projects) pj.put(org.json.JSONObject().put("id", p.id).put("name", p.name).put("clipCount", p.clipCount))
        root.put("projects", pj)
        val cj = org.json.JSONArray()
        for (c in clips) cj.put(org.json.JSONObject()
            .put("id", c.id).put("title", c.title).put("projectId", c.projectId)
            .put("task", c.task).put("coverClipId", c.coverClipId).put("isOriginal", c.isOriginal)
            .put("createdAt", c.createdAt).put("tags", c.tags).put("durationSec", c.durationSec)
            .put("modelName", c.modelName).put("isLiked", c.isLiked).put("hasLocal", c.localPath != null)
            .put("lyrics", c.lyrics).put("audioUrl", c.audioUrl).put("imageUrl", c.imageUrl)
            .put("localPath", c.localPath).put("playCount", c.playCount)
            .put("raw", c.rawJson?.let { runCatching { org.json.JSONObject(it) }.getOrNull() }))
        root.put("clips", cj)
        val file = File(context.cacheDir, "suno-base.zip")
        java.util.zip.ZipOutputStream(file.outputStream()).use { zip ->
            zip.putNextEntry(java.util.zip.ZipEntry("suno-base.json"))
            zip.write(root.toString(2).toByteArray()); zip.closeEntry()
        }
        file
    }

    /** Remembers the folder the user picked (persisted SAF permission is taken by the caller). */
    suspend fun setLocalTree(uri: String) { prefs.setLocalTree(uri); db.clips().clearImportedLinks(); importLocalFolder() }
    suspend fun setFolderPattern(v: String) { prefs.setFolderPattern(v) }

    /** Links MP3s from the chosen "Suno" folder to catalogue clips. Read-only over the user's files. */
    suspend fun importLocalFolder() = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        val tree = prefs.localTreeNow() ?: return@withContext
        if (_importState.value.running) return@withContext
        _importState.value = ImportState(running = true, message = com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.import_scanning))
        try {
            val res = com.soaresden.sunoauto.data.LocalImport.run(context, db, android.net.Uri.parse(tree), prefs.folderPatternNow()) { done, total ->
                _importState.value = ImportState(running = true, done = done, total = total, message = com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.import_matching, done, total))
            }
            val summary = com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.import_summary, res.linked, res.workspaces) + if (res.unmatched > 0) com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.import_unmatched, res.unmatched) else ""
            prefs.setLocalSummary(summary)
            _importState.value = ImportState(running = false, done = res.scanned, total = res.scanned, message = summary)
        } catch (e: Exception) {
            Log.e(TAG, "local import failed", e)
            _importState.value = ImportState(running = false, message = com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.failed, e.message ?: ""))
        }
    }
}
