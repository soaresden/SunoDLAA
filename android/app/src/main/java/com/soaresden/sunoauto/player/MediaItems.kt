package com.soaresden.sunoauto.player

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaConstants
import com.soaresden.sunoauto.data.db.ClipEntity
import com.soaresden.sunoauto.data.db.PlaylistEntity
import com.soaresden.sunoauto.data.db.ProjectEntity
import java.io.File

/** Builders that turn DB rows into Media3 items (used by the phone UI and by Android Auto). */
object MediaItems {

    private const val EXTRA_LIKED = "suno_liked"
    private const val EXTRA_LOCAL = "suno_local"

    fun folder(id: String, title: String, subtitle: String? = null, iconUri: Uri? = null, playable: Boolean = false): MediaItem =
        MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setArtworkUri(iconUri)
                    .setIsBrowsable(true)
                    .setIsPlayable(playable)
                    .setMediaType(if (playable) MediaMetadata.MEDIA_TYPE_PLAYLIST else MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                    .setExtras(Bundle().apply {
                        putInt(
                            MediaConstants.EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                            MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM
                        )
                        putInt(
                            MediaConstants.EXTRAS_KEY_CONTENT_STYLE_PLAYABLE,
                            MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM
                        )
                    })
                    .build()
            )
            .build()

    fun project(p: ProjectEntity, coverUrl: String? = null, since: String? = null): MediaItem =
        folder(MediaIds.project(p.id), p.name, listOfNotNull(com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.n_tracks, p.clipCount), since?.let { com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.since, it) }).joinToString(" · "), coverUrl?.let(Uri::parse), playable = false)

    fun playlist(p: PlaylistEntity): MediaItem =
        folder(MediaIds.playlist(p.id), p.name, com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.n_tracks, p.clipCount), p.imageUrl?.let(Uri::parse), playable = false)

    /** A playable row that plays a whole list ("Play all", "Shuffle"). */
    fun action(id: String, title: String, subtitle: String?): MediaItem =
        MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_PLAYLIST)
                    .build()
            )
            .build()

    fun clip(c: ClipEntity, projectName: String? = null): MediaItem {
        val localUri = com.soaresden.sunoauto.data.LocalFiles.uriOrNull(c.localPath)
        val uri = localUri ?: Uri.parse(c.audioUrl)
        val art = c.localCoverPath?.let { File(it) }?.takeIf { it.exists() }?.let { Uri.fromFile(it) }
            ?: c.imageUrl?.let(Uri::parse)
        val extras = Bundle().apply {
            putBoolean(EXTRA_LIKED, c.isLiked)
            putBoolean(EXTRA_LOCAL, localUri != null)
            if (localUri != null) putInt(
                MediaConstants.EXTRAS_KEY_COMPLETION_STATUS,
                MediaConstants.EXTRAS_VALUE_COMPLETION_STATUS_NOT_PLAYED
            )
        }
        return MediaItem.Builder()
            .setMediaId(MediaIds.clip(c.id))
            .setUri(uri)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle((if (c.isOriginal) "★ " else "") + c.title.ifBlank { com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.untitled) })
                    .setArtist(projectName ?: c.tags?.take(60) ?: "Suno")
                    .setAlbumTitle(projectName)
                    .setGenre(c.tags)
                    .setArtworkUri(art)
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .setDurationMs(c.durationSec?.let { (it * 1000).toLong() })
                    .setExtras(extras)
                    .build()
            )
            .build()
    }

    fun isLiked(item: MediaItem): Boolean = item.mediaMetadata.extras?.getBoolean(EXTRA_LIKED) ?: false
    fun isLocal(item: MediaItem): Boolean = item.mediaMetadata.extras?.getBoolean(EXTRA_LOCAL) ?: false
}
