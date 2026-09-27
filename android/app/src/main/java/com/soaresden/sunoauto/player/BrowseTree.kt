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
        c.localPath != null || (isPro && !c.audioUrl.isNullOrBlank())

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
            MediaItems.folder(MediaIds.ALL, ctx.getString(R.string.node_all), playable = true),
            MediaItems.folder(MediaIds.ALL_ALPHA, ctx.getString(R.string.node_all_alpha), playable = true),
            MediaItems.folder(MediaIds.PROJECTS, ctx.getString(R.string.node_projects)),
            MediaItems.folder(MediaIds.LIKED, ctx.getString(R.string.node_liked), playable = true),
            MediaItems.folder(MediaIds.DOWNLOADED, ctx.getString(R.string.node_downloaded), playable = true),
            MediaItems.folder(MediaIds.RECENT, ctx.getString(R.string.node_recent), playable = true),
            MediaItems.folder(MediaIds.PLAYLISTS, ctx.getString(R.string.node_playlists)),
        )
        parentId == MediaIds.PROJECTS -> repo.projectRows().map { MediaItems.project(it.project, it.coverUrl, it.oldestAt?.let { d -> com.soaresden.sunoauto.ui.components.fmtDate(d) }) }
        parentId == MediaIds.PLAYLISTS -> repo.playlists().map { MediaItems.playlist(it) }
        // Track lists: show EVERYTHING (incl. 🫥), so originals stay visible; playback is filtered separately.
        else -> listFor(repo, parentId).map { MediaItems.clip(it, repo.projectName(it.projectId)).withParent(parentId) }
    }

    suspend fun item(ctx: Context, repo: LibraryRepository, mediaId: String): MediaItem? {
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

    private fun MediaItem.withParent(parent: String): MediaItem =
        buildUpon().setRequestMetadata(
            MediaItem.RequestMetadata.Builder()
                .setMediaUri(localConfiguration?.uri)
                .setExtras(android.os.Bundle().apply { putString("parent", parent) })
                .build()
        ).build()
}
