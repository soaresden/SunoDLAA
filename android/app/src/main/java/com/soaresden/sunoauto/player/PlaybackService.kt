package com.soaresden.sunoauto.player

import android.content.Intent
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.soaresden.sunoauto.R
import com.soaresden.sunoauto.SunoApp
import com.soaresden.sunoauto.data.repo.LibraryRepository
import com.soaresden.sunoauto.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.launch

/**
 * The single playback service: used by the phone UI (through a MediaController) and by
 * Android Auto (through the MediaLibrarySession browse tree).
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaLibraryService() {

    companion object {
        const val CMD_TOGGLE_LIKE = "com.soaresden.sunoauto.TOGGLE_LIKE"
        const val CMD_DOWNLOAD = "com.soaresden.sunoauto.DOWNLOAD"
        const val CMD_SYNC = "com.soaresden.sunoauto.SYNC"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    /** Last folder whose children were listed (Android Auto sends back only a clip id when tapping a row). */
    @Volatile private var lastBrowsedParent: String? = null
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private val repo: LibraryRepository get() = SunoApp.get(this).repo
    private lateinit var cacheFactory: androidx.media3.datasource.cache.CacheDataSource.Factory
    @Volatile private var prefetch: androidx.media3.datasource.cache.CacheWriter? = null
    private lateinit var web: SunoWebEngine
    /** true while WE move ExoPlayer (to follow Suno's page), so it isn't mirrored back. */
    private var followingWeb = false
    private val musicAttrs = AudioAttributes.Builder().setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).setUsage(C.USAGE_MEDIA).build()

    private fun currentWebClip(): String? {
        val item = player.currentMediaItem ?: return null
        return if (WebTrack.isWeb(item.localConfiguration?.uri)) item.mediaId.let(MediaIds::clipId) else null
    }

    /** Keeps Suno's page in step with the queue: same track, playing or paused like the player. */
    private fun syncWeb(newTrack: Boolean = false) {
        val id = currentWebClip()
        // Suno's page takes the audio focus itself while it plays; ExoPlayer (silent) must not fight it.
        player.setAudioAttributes(musicAttrs, id == null)
        if (id == null) { if (web.clipId != null) web.stop(); return }
        if (newTrack || web.clipId != id) web.load(id, player.playWhenReady, player.currentPosition / 1000.0)
        else if (player.playWhenReady) web.play() else web.pause()
    }

    private fun followWeb(id: String, posSec: Double) {
        if (currentWebClip() != id) return
        val target = (posSec * 1000).toLong()
        if (kotlin.math.abs(player.currentPosition - target) > 1500) {
            followingWeb = true
            try { player.seekTo(target) } finally { followingWeb = false }
        }
    }

    private val webListener = object : SunoWebEngine.Listener {
        override fun onWebPlaying(clipId: String, positionSec: Double, durationSec: Double) = followWeb(clipId, positionSec)
        override fun onWebTime(clipId: String, positionSec: Double, durationSec: Double, paused: Boolean) {
            if (!paused) followWeb(clipId, positionSec)
        }
        /** Suno's page stopped by itself (a call, another app took the sound): pause the queue too. */
        override fun onWebPausedByItself(clipId: String) {
            if (currentWebClip() == clipId && player.playWhenReady) player.pause()
        }
        override fun onWebEnded(clipId: String) {
            if (currentWebClip() != clipId) return
            if (player.hasNextMediaItem()) player.seekToNextMediaItem() else player.pause()
        }
        override fun onWebFailed(clipId: String, why: String) {
            if (currentWebClip() != clipId) return
            com.soaresden.sunoauto.data.DiagLog.add(this@PlaybackService, "web ${clipId.take(8)}: $why")
            android.widget.Toast.makeText(this@PlaybackService, com.soaresden.sunoauto.LocaleHelper.s(R.string.web_failed), android.widget.Toast.LENGTH_LONG).show()
            if (player.hasNextMediaItem()) player.seekToNextMediaItem() else player.pause()
        }
    }

    /** While a track plays, the next one is copied into the play cache, so it starts at once and survives a tunnel. */
    private fun prefetchNext() {
        prefetch?.cancel(); prefetch = null
        if (!PlayCache.enabled(this)) return
        val idx = player.nextMediaItemIndex
        if (idx == C.INDEX_UNSET) return
        val uri = player.getMediaItemAt(idx).localConfiguration?.uri ?: return
        if (uri.scheme == "file" || WebTrack.isWeb(uri)) return
        val writer = androidx.media3.datasource.cache.CacheWriter(
            cacheFactory.createDataSource(), androidx.media3.datasource.DataSpec(uri), null, null)
        prefetch = writer
        scope.launch(Dispatchers.IO) { runCatching { writer.cache() }; PlayCache.bump() }
    }

    override fun onCreate() {
        super.onCreate()
        val app = SunoApp.get(this)
        val httpFactory = OkHttpDataSource.Factory(app.http)
            .setUserAgent("SunoAutoPlayer/1.0 (Android)")
        val upstream = DefaultDataSource.Factory(this, httpFactory)
        // Play cache: streamed / pCloud tracks are kept on the phone (size chosen in Settings)
        cacheFactory = androidx.media3.datasource.cache.CacheDataSource.Factory()
            .setCache(PlayCache.get(this))
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(androidx.media3.datasource.cache.CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        val dataSourceFactory = androidx.media3.datasource.DataSource.Factory {
            CacheOrDirectDataSource(this, upstream.createDataSource(), cacheFactory.createDataSource())
        }

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        web = SunoWebEngine(this, webListener)
        player.addListener(object : Player.Listener {
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) { syncWeb() }
            override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
                if (reason != Player.DISCONTINUITY_REASON_SEEK || followingWeb) return
                if (oldPosition.mediaItemIndex != newPosition.mediaItemIndex) return  // handled by the transition
                if (currentWebClip() != null) web.seek(newPosition.positionMs / 1000.0)
            }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                syncWeb(newTrack = reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT)
                val id = mediaItem?.mediaId?.let(MediaIds::clipId) ?: return
                scope.launch(Dispatchers.IO) { repo.markPlayed(id) }
                refreshLayout()
                prefetchNext()
                PlayCache.bump()
            }
            // Never leave Android Auto stuck on "Source error": skip a track that fails to load.
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                val item = player.currentMediaItem
                val host = item?.localConfiguration?.uri?.let { it.host ?: it.scheme } ?: "?"
                com.soaresden.sunoauto.data.DiagLog.add(this@PlaybackService,
                    "play ${item?.mediaId?.let(MediaIds::clipId)?.take(8)} ($host): ${error.errorCodeName} ${error.cause?.message ?: error.message ?: ""}".take(300))
                if (player.hasNextMediaItem()) {
                    player.seekToNextMediaItem()
                    player.prepare()
                    player.play()
                } else {
                    player.stop()
                }
            }
        })

        val sessionActivity = android.app.PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        )

        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(sessionActivity)
            .build()
        refreshLayout()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        web.release()
        session.release()
        player.release()
        scope.cancel()
        super.onDestroy()
    }

    // ---- custom buttons shown in Android Auto / notification -------------------------------

    private fun likeButton(liked: Boolean) = CommandButton.Builder()
        .setDisplayName(if (liked) com.soaresden.sunoauto.LocaleHelper.s(R.string.action_unlike) else com.soaresden.sunoauto.LocaleHelper.s(R.string.action_like))
        .setIconResId(if (liked) R.drawable.ic_favorite else R.drawable.ic_favorite_border)
        .setSessionCommand(SessionCommand(CMD_TOGGLE_LIKE, Bundle.EMPTY))
        .build()

    private fun downloadButton() = CommandButton.Builder()
        .setDisplayName(com.soaresden.sunoauto.LocaleHelper.s(R.string.action_download))
        .setIconResId(R.drawable.ic_download)
        .setSessionCommand(SessionCommand(CMD_DOWNLOAD, Bundle.EMPTY))
        .build()

    private fun refreshLayout() {
        val current = player.currentMediaItem
        val liked = current?.let(MediaItems::isLiked) ?: false
        val buttons = mutableListOf(likeButton(liked))
        session.setCustomLayout(ImmutableList.copyOf(buttons))
    }

    // ---- browse tree ----------------------------------------------------------------------

    private inner class LibraryCallback : MediaLibrarySession.Callback {

        override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
            val sessionCommands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
                .add(SessionCommand(CMD_TOGGLE_LIKE, Bundle.EMPTY))
                .add(SessionCommand(CMD_DOWNLOAD, Bundle.EMPTY))
                .add(SessionCommand(CMD_SYNC, Bundle.EMPTY))
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(sessionCommands)
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession, controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand, args: Bundle
        ): ListenableFuture<SessionResult> = scope.future {
            when (customCommand.customAction) {
                CMD_TOGGLE_LIKE -> {
                    val item = player.currentMediaItem
                    val id = item?.mediaId?.let(MediaIds::clipId)
                    if (id != null) {
                        val nowLiked = repo.toggleLike(id)
                        // update the extras of the current item so the button flips immediately
                        val updated = repo.clip(id)?.let { MediaItems.clip(it) }
                        if (updated != null) player.replaceMediaItem(player.currentMediaItemIndex, updated)
                        refreshLayout()
                        SessionResult(SessionResult.RESULT_SUCCESS, Bundle().apply { putBoolean("liked", nowLiked) })
                    } else SessionResult(SessionError.ERROR_BAD_VALUE)
                }
                CMD_DOWNLOAD -> {
                    val id = player.currentMediaItem?.mediaId?.let(MediaIds::clipId)
                    if (id != null) { repo.enqueueDownload(listOf(id)); SessionResult(SessionResult.RESULT_SUCCESS) }
                    else SessionResult(SessionError.ERROR_BAD_VALUE)
                }
                CMD_SYNC -> { repo.requestSync(); SessionResult(SessionResult.RESULT_SUCCESS) }
                else -> SessionResult(SessionError.ERROR_NOT_SUPPORTED)
            }
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val extras = Bundle().apply {
                putInt(androidx.media3.session.MediaConstants.EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                    androidx.media3.session.MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM)
            }
            val root = MediaItems.folder(MediaIds.ROOT, com.soaresden.sunoauto.LocaleHelper.s(R.string.app_name))
            return Futures.immediateFuture(LibraryResult.ofItem(root, LibraryParams.Builder().setExtras(extras).build()))
        }

        override fun onGetChildren(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo,
            parentId: String, page: Int, pageSize: Int, params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
            val all = BrowseTree.children(this@PlaybackService, repo, parentId)
            if (all.any { MediaIds.clipId(it.mediaId) != null }) lastBrowsedParent = parentId
            // Android Auto asks long lists page by page: return only the requested page.
            val from = page.toLong() * pageSize.toLong()
            val items = when {
                pageSize <= 0 || (page == 0 && pageSize >= all.size) -> all
                from >= all.size -> emptyList()
                else -> all.subList(from.toInt(), minOf(all.size.toLong(), from + pageSize).toInt())
            }
            LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
        }

        override fun onGetItem(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, mediaId: String
        ): ListenableFuture<LibraryResult<MediaItem>> = scope.future {
            val item = BrowseTree.item(this@PlaybackService, repo, mediaId)
            if (item != null) LibraryResult.ofItem(item, null) else LibraryResult.ofError(SessionError.ERROR_BAD_VALUE)
        }

        override fun onSearch(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, params: LibraryParams?
        ): ListenableFuture<LibraryResult<Void>> = scope.future {
            val n = repo.search(query).size
            session.notifySearchResultChanged(browser, query, n, params)
            LibraryResult.ofVoid()
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo,
            query: String, page: Int, pageSize: Int, params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
            val items = repo.search(query).map { MediaItems.clip(it, repo.projectName(it.projectId)) }
            LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
        }

        /** Android Auto / Assistant hand us items without URIs; resolve them from the DB, and expand folders. */
        override fun onAddMediaItems(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: List<MediaItem>
        ): ListenableFuture<List<MediaItem>> = scope.future {
            mediaItems.flatMap { BrowseTree.resolvePlayable(this@PlaybackService, repo, it.mediaId) }
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo,
            mediaItems: List<MediaItem>, startIndex: Int, startPositionMs: Long
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = scope.future {
            // "Play all" / "Shuffle" rows: queue the whole list.
            if (mediaItems.size == 1) {
                val id = mediaItems.first().mediaId
                MediaIds.actionTarget(id)?.let { target ->
                    val list = BrowseTree.resolvePlayable(this@PlaybackService, repo, target)
                    val shuffle = MediaIds.isShuffle(id)
                    player.shuffleModeEnabled = shuffle
                    val start = if (shuffle && list.isNotEmpty()) kotlin.random.Random.nextInt(list.size) else 0
                    return@future MediaSession.MediaItemsWithStartPosition(list, start, 0L)
                }
            }
            // When a single item from a folder is tapped, queue its siblings so "next" works in the car.
            val resolved = if (mediaItems.size == 1) {
                val single = mediaItems.first()
                val parent = single.requestMetadata.extras?.getString("parent") ?: lastBrowsedParent
                if (parent != null) {
                    val siblings = BrowseTree.resolvePlayable(this@PlaybackService, repo, parent)
                    if (siblings.isNotEmpty()) {
                        // Tapped track playable → start there; tapped a 🫥 track → start at the first playable one.
                        val idx = siblings.indexOfFirst { it.mediaId == single.mediaId }.coerceAtLeast(0)
                        return@future MediaSession.MediaItemsWithStartPosition(siblings, idx, startPositionMs)
                    }
                }
                BrowseTree.resolvePlayable(this@PlaybackService, repo, single.mediaId)
            } else {
                // A whole list from the phone app: tracks without a playable source are dropped, so the
                // start position must follow the TAPPED track, not its old index (otherwise another song starts).
                val all = mediaItems.flatMap { BrowseTree.resolvePlayable(this@PlaybackService, repo, it.mediaId) }
                val wanted = mediaItems.getOrNull(startIndex)?.mediaId
                var idx = all.indexOfFirst { it.mediaId == wanted }
                if (idx < 0) {
                    val after = mediaItems.drop(startIndex + 1).map { it.mediaId }.toSet()
                    idx = all.indexOfFirst { it.mediaId in after }.coerceAtLeast(0)
                }
                return@future MediaSession.MediaItemsWithStartPosition(all, idx, startPositionMs)
            }
            MediaSession.MediaItemsWithStartPosition(resolved, startIndex.coerceIn(0, (resolved.size - 1).coerceAtLeast(0)), startPositionMs)
        }

        override fun onPlaybackResumption(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = scope.future {
            val recent = repo.recent(50).map { MediaItems.clip(it, repo.projectName(it.projectId)) }
            MediaSession.MediaItemsWithStartPosition(recent, 0, 0L)
        }
    }
}
