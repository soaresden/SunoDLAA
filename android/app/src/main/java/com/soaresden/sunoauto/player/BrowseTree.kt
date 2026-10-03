package com.soaresden.sunoauto.player

import android.content.Context
import androidx.media3.common.MediaItem
import com.soaresden.sunoauto.R
import com.soaresden.sunoauto.data.db.ClipEntity
import com.soaresden.sunoauto.data.repo.LibraryRepository

/** Maps media ids to lists of MediaItems from the local cache. Pure functions, no network. */
object BrowseTree {

    /** A clip can actually be played only if we have a local file, or streaming is allowed (Pro). */
    private fun isPlayableSource(c: ClipEntity, isPro: Boolean): Boolean =
        c.localPath != null || !c.audioUrl.isNullOrBlank()

    /** Raw clips backing a node id, in the same order as the phone app. */
    private suspend fun listFor(repo: LibraryRepository, id: String): List<ClipEntity> = when {
        id == MediaIds.ALL        -> repo.allClips().sortedWith(compareByDescending<ClipEntity> { it.isOriginal }.thenByDescending { it.createdAt ?: "" })
        id == MediaIds.ALL_ALPHA  -> repo.allClips().sortedBy { it.title.lowercase() }
        id == MediaIds.LIKED      -> repo.liked()
        id == MediaIds.DOWNLOADED -> repo.downloaded()
        id == MediaIds.RECENT     -> repo.recent(100)
        id.startsWith(MediaIds.SEARCH_PREFIX) -> repo.search(id.removePrefix(MediaIds.SEARCH_PREFIX))
        else -> {
            MediaIds.projectId(id)?.let { return repo.clipsOfProject(it) }
            MediaIds.playlistId(id)?.let { return repo.clipsOfPlaylist(it) }
            emptyList()
        }
    }

    suspend fun children(ctx: Context, repo: LibraryRepository, parentId: String): List<MediaItem> = when {
        parentId == MediaIds.ROOT -> listOf(
            MediaItems.folder(MediaIds.ALL, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_all)),
            MediaItems.folder(MediaIds.ALL_ALPHA, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_all_alpha)),
            MediaItems.folder(MediaIds.PROJECTS, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_projects)),
            MediaItems.folder(MediaIds.PROJECTS_RECENT, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_projects_recent)),
            MediaItems.folder(MediaIds.LIKED, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_liked)),
            MediaItems.folder(MediaIds.DOWNLOADED, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_downloaded)),
            MediaItems.folder(MediaIds.RECENT, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_recent)),
            MediaItems.folder(MediaIds.PLAYLISTS, com.soaresden.sunoauto.LocaleHelper.s(R.string.node_playlists)),
        )
        // A→Z so Android Auto's "A•Z" letter jump lands on the right workspace
        parentId == MediaIds.PROJECTS -> repo.projectRows().sortedWith(compareBy({ alphaKey(it.project.name) }, { it.project.name }))
            .map { MediaItems.project(it.project, it.coverUrl, it.oldestAt?.let { d -> com.soaresden.sunoauto.ui.components.fmtDate(d) }) }
        // most recent activity first (the order of the phone app)
        parentId == MediaIds.PROJECTS_RECENT -> repo.projectRows()
            .map { MediaItems.project(it.project, it.coverUrl, it.oldestAt?.let { d -> com.soaresden.sunoauto.ui.components.fmtDate(d) }) }
        parentId == MediaIds.PLAYLISTS -> repo.playlists().map { MediaItems.playlist(it) }
        // Track lists: "Play all" + "Shuffle" first, then EVERY track (incl. 🫥) so originals stay visible;
        // playback itself only queues tracks that can really play.
        else -> {
            val clips = listFor(repo, parentId)
            val isPro = repo.isProNow()
            val playable = clips.count { isPlayableSource(it, isPro) }
            val head = if (playable > 0) {
                val sub = com.soaresden.sunoauto.LocaleHelper.s(R.string.n_playable, playable)
                listOf(
                    MediaItems.action(MediaIds.playAll(parentId), com.soaresden.sunoauto.LocaleHelper.s(R.string.aa_play_all), sub),
                    MediaItems.action(MediaIds.shuffleAll(parentId), com.soaresden.sunoauto.LocaleHelper.s(R.string.aa_shuffle), sub)
                )
            } else emptyList()
            head + clips.map { MediaItems.clip(it, repo.projectName(it.projectId)).withParent(parentId) }
        }
    }

    suspend fun item(ctx: Context, repo: LibraryRepository, mediaId: String): MediaItem? {
        MediaIds.actionTarget(mediaId)?.let {
            return MediaItems.action(mediaId, com.soaresden.sunoauto.LocaleHelper.s(if (MediaIds.isShuffle(mediaId)) R.string.aa_shuffle else R.string.aa_play_all), null)
        }
        MediaIds.clipId(mediaId)?.let { id -> return repo.clip(id)?.let { MediaItems.clip(it, repo.projectName(it.projectId)) } }
        MediaIds.projectId(mediaId)?.let { id -> return repo.project(id)?.let { MediaItems.project(it) } }
        MediaIds.playlistId(mediaId)?.let { id -> return repo.playlist(id)?.let { MediaItems.playlist(it) } }
        return children(ctx, repo, MediaIds.ROOT).firstOrNull { it.mediaId == mediaId }
    }

    /**
     * Expands any id into a flat list of clips that can ACTUALLY play right now
     * (local file, or streaming when Pro). This is what feeds the player queue, so a
     * 🫥 track never gets queued and Android Auto never shows "Source error".
     */
    suspend fun resolvePlayable(ctx: Context, repo: LibraryRepository, mediaId: String): List<MediaItem> {
        MediaIds.actionTarget(mediaId)?.let { return resolvePlayable(ctx, repo, it) }
        val isPro = repo.isProNow()
        MediaIds.clipId(mediaId)?.let { id ->
            val c = repo.clip(id) ?: return emptyList()
            return if (isPlayableSource(c, isPro)) listOf(MediaItems.clip(c, repo.projectName(c.projectId))) else emptyList()
        }
        val parent = mediaId
        return listFor(repo, mediaId)
            .filter { isPlayableSource(it, isPro) }
            .map { MediaItems.clip(it, repo.projectName(it.projectId)).withParent(parent) }
    }

    /** Case- and accent-insensitive sort key; names starting with "!" stay first, like in Windows Explorer. */
    private fun alphaKey(name: String): String =
        java.text.Normalizer.normalize(name.trim(), java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "").lowercase()

    private fun MediaItem.withParent(parent: String): MediaItem =
        buildUpon().setRequestMetadata(
            MediaItem.RequestMetadata.Builder()
                .setMediaUri(localConfiguration?.uri)
                .setExtras(android.os.Bundle().apply { putString("parent", parent) })
                .build()
        ).build()
}
