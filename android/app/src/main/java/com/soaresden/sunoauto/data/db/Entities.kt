package com.soaresden.sunoauto.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Workspace row enriched for lists: date span of its clips and the cover to show as its icon. */
data class ProjectRow(
    @androidx.room.Embedded val project: ProjectEntity,
    val oldestAt: String?,
    val newestAt: String?,
    val coverUrl: String?
)

/** A Suno workspace / project ("dossier"). */
@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val isDefault: Boolean = false,
    val clipCount: Int = 0,
    val sortOrder: Int = 0,
    val updatedAt: Long = 0L,
    val lastUpdatedClip: String? = null,   // from Suno: changes whenever a clip is added/edited
    val syncMarker: String? = null         // "<lastUpdatedClip>|<clipCount>" at last successful clip sync
)

/** One generated song. `projectId` is null for clips only reachable through likes/playlists. */
@Entity(
    tableName = "clips",
    indices = [Index("projectId"), Index("title"), Index("isLiked"), Index("createdAt")]
)
data class ClipEntity(
    @PrimaryKey val id: String,
    val title: String,
    val projectId: String?,
    val audioUrl: String,
    val imageUrl: String?,
    val tags: String?,          // style / genre tags as written by Suno
    val durationSec: Double?,
    val modelName: String?,
    val createdAt: String?,     // ISO timestamp from Suno
    val isLiked: Boolean = false,
    val task: String? = null,
    val coverClipId: String? = null,
    val isOriginal: Boolean = false,   // referenced as cover_clip_id by other clips → the "source" song
    val lyrics: String? = null,
    val rawJson: String? = null,      // full Suno clip JSON (exhaustive)
    val localPath: String? = null,   // set once downloaded
    val localCoverPath: String? = null,
    val lastPlayedAt: Long = 0L,
    val playCount: Int = 0
)

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey val id: String,
    val name: String,
    val imageUrl: String?,
    val clipCount: Int = 0,
    val updatedAt: Long = 0L
)

@Entity(
    tableName = "playlist_clips",
    primaryKeys = ["playlistId", "clipId"],
    indices = [Index("clipId")]
)
data class PlaylistClipEntity(
    val playlistId: String,
    val clipId: String,
    val position: Int
)

/** Pending / active download bookkeeping (also drives the Downloads screen). */
@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val clipId: String,
    val state: Int,             // 0 queued, 1 running, 2 done, 3 failed
    val progress: Int = 0,
    val error: String? = null,
    val requestedAt: Long = System.currentTimeMillis()
)
