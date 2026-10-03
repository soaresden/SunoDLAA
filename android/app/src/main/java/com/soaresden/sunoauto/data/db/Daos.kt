package com.soaresden.sunoauto.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

data class IdTitle(val id: String, val title: String)
data class IdTitleProject(val id: String, val title: String, val projectId: String?)

@Dao
interface ProjectDao {
    // Newest activity first (last clip added/edited), then name; workspaces never touched go last.
    @Query("SELECT * FROM projects ORDER BY lastUpdatedClip IS NULL, lastUpdatedClip DESC, name COLLATE NOCASE")
    fun observeAll(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects ORDER BY lastUpdatedClip IS NULL, lastUpdatedClip DESC, name COLLATE NOCASE")
    suspend fun all(): List<ProjectEntity>

    @Query("SELECT * FROM projects WHERE id = :id")
    suspend fun byId(id: String): ProjectEntity?

    @Upsert
    suspend fun upsertAll(items: List<ProjectEntity>)

    @Query("DELETE FROM projects WHERE id NOT IN (:keep)")
    suspend fun deleteNotIn(keep: List<String>)

    /** Workspaces with clip date span and icon: the original song's cover if there is one, else the oldest clip's. */
    @Query(
        """SELECT p.*,
             (SELECT MIN(c.createdAt) FROM clips c WHERE c.projectId = p.id) AS oldestAt,
             (SELECT MAX(c.createdAt) FROM clips c WHERE c.projectId = p.id) AS newestAt,
             COALESCE(
               (SELECT c.imageUrl FROM clips c WHERE c.projectId = p.id AND c.isOriginal = 1 AND c.imageUrl IS NOT NULL AND c.imageUrl <> '' ORDER BY c.createdAt LIMIT 1),
               (SELECT c.imageUrl FROM clips c WHERE c.projectId = p.id AND c.imageUrl IS NOT NULL AND c.imageUrl <> '' ORDER BY c.createdAt ASC LIMIT 1)
             ) AS coverUrl
           FROM projects p
           ORDER BY p.lastUpdatedClip IS NULL, p.lastUpdatedClip DESC, p.name COLLATE NOCASE"""
    )
    fun observeRows(): Flow<List<ProjectRow>>

    @Query(
        """SELECT p.*,
             (SELECT MIN(c.createdAt) FROM clips c WHERE c.projectId = p.id) AS oldestAt,
             (SELECT MAX(c.createdAt) FROM clips c WHERE c.projectId = p.id) AS newestAt,
             COALESCE(
               (SELECT c.imageUrl FROM clips c WHERE c.projectId = p.id AND c.isOriginal = 1 AND c.imageUrl IS NOT NULL AND c.imageUrl <> '' ORDER BY c.createdAt LIMIT 1),
               (SELECT c.imageUrl FROM clips c WHERE c.projectId = p.id AND c.imageUrl IS NOT NULL AND c.imageUrl <> '' ORDER BY c.createdAt ASC LIMIT 1)
             ) AS coverUrl
           FROM projects p
           ORDER BY p.lastUpdatedClip IS NULL, p.lastUpdatedClip DESC, p.name COLLATE NOCASE"""
    )
    suspend fun rows(): List<ProjectRow>

    @Query("UPDATE projects SET syncMarker = :marker WHERE id = :id")
    suspend fun setSyncMarker(id: String, marker: String?)

    @Query("SELECT COUNT(*) FROM clips WHERE projectId = :projectId")
    suspend fun localClipCount(projectId: String): Int
}

@Dao
interface ClipDao {
    // Originals (the song the covers were made from) pinned first, then newest first.
    @Query("SELECT * FROM clips WHERE projectId = :projectId ORDER BY isOriginal DESC, createdAt DESC")
    fun observeByProject(projectId: String): Flow<List<ClipEntity>>

    @Query("SELECT * FROM clips WHERE projectId = :projectId ORDER BY isOriginal DESC, createdAt DESC")
    suspend fun byProject(projectId: String): List<ClipEntity>

    /** Marks as original every clip that another clip points to through cover_clip_id. */
    @Query("UPDATE clips SET isOriginal = (id IN (SELECT coverClipId FROM clips WHERE coverClipId IS NOT NULL))")
    suspend fun recomputeOriginals()

    @Query("SELECT * FROM clips WHERE isLiked = 1 ORDER BY createdAt DESC")
    fun observeLiked(): Flow<List<ClipEntity>>

    @Query("SELECT * FROM clips WHERE isLiked = 1 ORDER BY createdAt DESC")
    suspend fun liked(): List<ClipEntity>

    @Query("SELECT * FROM clips WHERE localPath IS NOT NULL ORDER BY title COLLATE NOCASE")
    fun observeDownloaded(): Flow<List<ClipEntity>>

    @Query("SELECT * FROM clips WHERE localPath IS NOT NULL ORDER BY title COLLATE NOCASE")
    suspend fun downloaded(): List<ClipEntity>

    @Query("SELECT * FROM clips WHERE lastPlayedAt > 0 ORDER BY lastPlayedAt DESC LIMIT :limit")
    fun observeRecent(limit: Int = 50): Flow<List<ClipEntity>>

    @Query("SELECT * FROM clips WHERE lastPlayedAt > 0 ORDER BY lastPlayedAt DESC LIMIT :limit")
    suspend fun recent(limit: Int = 50): List<ClipEntity>

    @Query(
        """SELECT * FROM clips
           WHERE title LIKE '%' || :q || '%' OR tags LIKE '%' || :q || '%' OR lyrics LIKE '%' || :q || '%'
           ORDER BY createdAt DESC LIMIT :limit"""
    )
    suspend fun search(q: String, limit: Int = 200): List<ClipEntity>

    @Query(
        """SELECT * FROM clips
           WHERE title LIKE '%' || :q || '%' OR tags LIKE '%' || :q || '%'
           ORDER BY createdAt DESC LIMIT :limit"""
    )
    fun observeSearch(q: String, limit: Int = 200): Flow<List<ClipEntity>>

    @Query("SELECT * FROM clips WHERE id = :id")
    suspend fun byId(id: String): ClipEntity?

    @Query("SELECT * FROM clips WHERE id = :id")
    fun observeById(id: String): Flow<ClipEntity?>

    @Query("SELECT * FROM clips WHERE id IN (:ids)")
    suspend fun byIds(ids: List<String>): List<ClipEntity>

    @Query("SELECT COUNT(*) FROM clips")
    fun observeCount(): Flow<Int>

    @Query("SELECT * FROM clips ORDER BY createdAt DESC")
    fun observeAllClips(): Flow<List<ClipEntity>>

    @Upsert
    suspend fun upsertAll(items: List<ClipEntity>)

    /** Forget stream links (they are refreshed by the next full sync). */
    @Query("UPDATE clips SET audioUrl = ''")
    suspend fun clearAudioUrls()

    /**
     * Upsert from the network without clobbering local-only columns
     * (localPath, play stats). Room has no partial upsert, so we merge by hand.
     */
    @Transaction
    suspend fun mergeFromNetwork(items: List<ClipEntity>) {
        if (items.isEmpty()) return
        val existing = byIds(items.map { it.id }).associateBy { it.id }
        upsertAll(items.map { n ->
            val e = existing[n.id]
            if (e == null) n else n.copy(
                localPath = e.localPath,
                localCoverPath = e.localCoverPath,
                lastPlayedAt = e.lastPlayedAt,
                playCount = e.playCount,
                projectId = n.projectId ?: e.projectId,
                isOriginal = e.isOriginal,
                lyrics = n.lyrics ?: e.lyrics,
                rawJson = n.rawJson ?: e.rawJson
            )
        })
    }

    @Query("UPDATE clips SET isLiked = :liked WHERE id = :id")
    suspend fun setLiked(id: String, liked: Boolean)

    @Query("UPDATE clips SET isLiked = 0 WHERE isLiked = 1 AND id NOT IN (:likedIds)")
    suspend fun clearLikesNotIn(likedIds: List<String>)

    @Query("UPDATE clips SET localPath = :path, localCoverPath = :cover WHERE id = :id")
    suspend fun setLocalPath(id: String, path: String?, cover: String?)

    @Query("SELECT id FROM clips")
    suspend fun allIds(): List<String>

    @Query("SELECT * FROM clips")
    suspend fun allClipsRaw(): List<ClipEntity>

    @Query("SELECT id, title FROM clips")
    suspend fun idTitlePairs(): List<IdTitle>

    @Query("SELECT id, title, projectId FROM clips")
    suspend fun idTitleProjectTriples(): List<IdTitleProject>

    // Drops links to imported (content://) files only; downloaded app-private files are left alone.
    @Query("UPDATE clips SET localPath = NULL, localCoverPath = NULL WHERE localPath LIKE 'content:%'")
    suspend fun clearImportedLinks()

    @Query("SELECT localPath FROM clips WHERE localPath LIKE 'content:%'")
    suspend fun linkedContentUris(): List<String>

    @Query("UPDATE clips SET localPath = NULL WHERE localPath = :path")
    suspend fun clearLocalByPath(path: String)

    @Query("UPDATE clips SET lastPlayedAt = :ts, playCount = playCount + 1 WHERE id = :id")
    suspend fun markPlayed(id: String, ts: Long = System.currentTimeMillis())

    @Query("DELETE FROM clips WHERE projectId = :projectId AND id NOT IN (:keep) AND localPath IS NULL AND isLiked = 0")
    suspend fun pruneProject(projectId: String, keep: List<String>)
}

@Dao
interface PlaylistDao {
    @Query("SELECT * FROM playlists ORDER BY name COLLATE NOCASE")
    fun observeAll(): Flow<List<PlaylistEntity>>

    @Query("SELECT * FROM playlists ORDER BY name COLLATE NOCASE")
    suspend fun all(): List<PlaylistEntity>

    @Query("SELECT * FROM playlists WHERE id = :id")
    suspend fun byId(id: String): PlaylistEntity?

    @Upsert
    suspend fun upsertAll(items: List<PlaylistEntity>)

    @Query("DELETE FROM playlists WHERE id NOT IN (:keep)")
    suspend fun deleteNotIn(keep: List<String>)

    @Query(
        """SELECT c.* FROM clips c INNER JOIN playlist_clips pc ON pc.clipId = c.id
           WHERE pc.playlistId = :playlistId ORDER BY pc.position"""
    )
    fun observeClips(playlistId: String): Flow<List<ClipEntity>>

    @Query(
        """SELECT c.* FROM clips c INNER JOIN playlist_clips pc ON pc.clipId = c.id
           WHERE pc.playlistId = :playlistId ORDER BY pc.position"""
    )
    suspend fun clips(playlistId: String): List<ClipEntity>

    @Query("DELETE FROM playlist_clips WHERE playlistId = :playlistId")
    suspend fun clearClips(playlistId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertClips(items: List<PlaylistClipEntity>)

    @Transaction
    suspend fun replaceClips(playlistId: String, clipIds: List<String>) {
        clearClips(playlistId)
        insertClips(clipIds.mapIndexed { i, id -> PlaylistClipEntity(playlistId, id, i) })
    }
}

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY requestedAt DESC")
    fun observeAll(): Flow<List<DownloadEntity>>

    @Upsert
    suspend fun upsert(item: DownloadEntity)

    @Query("UPDATE downloads SET state = :state, progress = :progress, error = :error WHERE clipId = :clipId")
    suspend fun update(clipId: String, state: Int, progress: Int, error: String? = null)

    @Query("DELETE FROM downloads WHERE clipId = :clipId")
    suspend fun delete(clipId: String)

    @Query("DELETE FROM downloads WHERE state = 2")
    suspend fun clearDone()

    @Query("SELECT * FROM downloads ORDER BY requestedAt DESC")
    suspend fun allNow(): List<DownloadEntity>
}
