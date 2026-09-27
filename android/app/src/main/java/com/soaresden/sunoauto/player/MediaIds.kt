package com.soaresden.sunoauto.player

/**
 * Media ids used in the Android Auto browse tree and in MediaItems.
 * Browsable nodes are prefixed; playable clips are just "clip:<id>".
 */
object MediaIds {
    const val ROOT = "[root]"
    const val PROJECTS = "[projects]"
    const val PROJECTS_RECENT = "[projects_recent]"
    const val LIKED = "[liked]"
    const val PLAYLISTS = "[playlists]"
    const val DOWNLOADED = "[downloaded]"
    const val RECENT = "[recent]"
    const val ALL = "[all]"
    const val ALL_ALPHA = "[all_az]"

    const val PROJECT_PREFIX = "project:"
    const val PLAYLIST_PREFIX = "playlist:"
    const val CLIP_PREFIX = "clip:"
    const val SEARCH_PREFIX = "search:"
    /** "Play all" / "Shuffle" rows shown at the top of every track list. */
    const val PLAYALL_PREFIX = "playall:"
    const val SHUFFLE_PREFIX = "shuffle:"

    fun project(id: String) = PROJECT_PREFIX + id
    fun playlist(id: String) = PLAYLIST_PREFIX + id
    fun clip(id: String) = CLIP_PREFIX + id
    fun playAll(parent: String) = PLAYALL_PREFIX + parent
    fun shuffleAll(parent: String) = SHUFFLE_PREFIX + parent
    /** For a play-all / shuffle row, the list it plays; null for anything else. */
    fun actionTarget(mediaId: String): String? = when {
        mediaId.startsWith(PLAYALL_PREFIX) -> mediaId.removePrefix(PLAYALL_PREFIX)
        mediaId.startsWith(SHUFFLE_PREFIX) -> mediaId.removePrefix(SHUFFLE_PREFIX)
        else -> null
    }
    fun isShuffle(mediaId: String) = mediaId.startsWith(SHUFFLE_PREFIX)

    fun clipId(mediaId: String): String? = mediaId.removePrefix(CLIP_PREFIX).takeIf { mediaId.startsWith(CLIP_PREFIX) }
    fun projectId(mediaId: String): String? = mediaId.removePrefix(PROJECT_PREFIX).takeIf { mediaId.startsWith(PROJECT_PREFIX) }
    fun playlistId(mediaId: String): String? = mediaId.removePrefix(PLAYLIST_PREFIX).takeIf { mediaId.startsWith(PLAYLIST_PREFIX) }
}
