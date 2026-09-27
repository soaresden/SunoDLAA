package com.soaresden.sunoauto.ui

import android.app.Application
import android.content.ComponentName
import android.os.Bundle
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import com.soaresden.sunoauto.SunoApp
import com.soaresden.sunoauto.data.db.ClipEntity
import com.soaresden.sunoauto.player.MediaIds
import com.soaresden.sunoauto.player.MediaItems
import com.soaresden.sunoauto.player.PlaybackService
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Bridges the Compose UI to the PlaybackService through a MediaController. */
class PlayerViewModel(app: Application) : AndroidViewModel(app) {

    data class NowPlaying(
        val clipId: String? = null,
        val title: String = "",
        val subtitle: String = "",
        val artworkUri: String? = null,
        val isPlaying: Boolean = false,
        val positionMs: Long = 0L,
        val durationMs: Long = 0L,
        val hasNext: Boolean = false,
        val hasPrev: Boolean = false,
        val shuffle: Boolean = false,
        val repeatMode: Int = Player.REPEAT_MODE_OFF
    )

    private val _state = MutableStateFlow(NowPlaying())
    val state: StateFlow<NowPlaying> = _state.asStateFlow()

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private val repo get() = SunoApp.get(getApplication()).repo

    init {
        val token = SessionToken(app, ComponentName(app, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(app, token).buildAsync().also { f ->
            f.addListener({
                runCatching { controller = f.get() }.onSuccess { attach() }
            }, MoreExecutors.directExecutor())
        }
        viewModelScope.launch {
            while (isActive) {
                controller?.let { c ->
                    if (c.isPlaying) _state.value = _state.value.copy(positionMs = c.currentPosition, durationMs = c.duration.coerceAtLeast(0))
                }
                delay(500)
            }
        }
    }

    private fun attach() {
        val c = controller ?: return
        c.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) = refresh()
        })
        refresh()
    }

    private fun refresh() {
        val c = controller ?: return
        val item = c.currentMediaItem
        _state.value = NowPlaying(
            clipId = item?.mediaId?.let(MediaIds::clipId),
            title = item?.mediaMetadata?.title?.toString().orEmpty(),
            subtitle = item?.mediaMetadata?.artist?.toString().orEmpty(),
            artworkUri = item?.mediaMetadata?.artworkUri?.toString(),
            isPlaying = c.isPlaying,
            positionMs = c.currentPosition,
            durationMs = c.duration.coerceAtLeast(0),
            hasNext = c.hasNextMediaItem(),
            hasPrev = c.hasPreviousMediaItem(),
            shuffle = c.shuffleModeEnabled,
            repeatMode = c.repeatMode
        )
    }

    /** Play [clips] starting at [index]. Items are built from the DB rows (local file if downloaded). */
    fun play(clips: List<ClipEntity>, index: Int, projectName: String? = null) {
        val c = controller ?: return
        viewModelScope.launch {
            // Tapped a track that can't play here (no file on the phone, no Pro stream): say so instead of
            // silently starting another song.
            val tapped = clips.getOrNull(index)
            if (tapped != null && tapped.localPath == null && !(repo.isProNow() && !tapped.audioUrl.isNullOrBlank())) {
                android.widget.Toast.makeText(getApplication(), com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.not_playable_here), android.widget.Toast.LENGTH_LONG).show()
                return@launch
            }
            val items = clips.map { MediaItems.clip(it, projectName ?: repo.projectName(it.projectId)) }
            c.setMediaItems(items, index.coerceIn(0, (items.size - 1).coerceAtLeast(0)), 0L)
            c.prepare()
            c.play()
        }
    }

    fun playShuffled(clips: List<ClipEntity>, projectName: String? = null) {
        if (clips.isEmpty()) return
        val c = controller ?: return
        c.shuffleModeEnabled = true
        play(clips.shuffled(), 0, projectName)
    }

    fun addNext(clip: ClipEntity) {
        val c = controller ?: return
        viewModelScope.launch {
            val item = MediaItems.clip(clip, repo.projectName(clip.projectId))
            if (c.mediaItemCount == 0) { c.setMediaItem(item); c.prepare(); c.play() }
            else c.addMediaItem(c.currentMediaItemIndex + 1, item)
        }
    }

    fun togglePlay() { controller?.let { if (it.isPlaying) it.pause() else { if (it.playbackState == Player.STATE_IDLE) it.prepare(); it.play() } } }
    fun next() { controller?.seekToNextMediaItem() }
    fun prev() { controller?.seekToPreviousMediaItem() }
    fun seekTo(ms: Long) { controller?.seekTo(ms) }
    fun toggleShuffle() { controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun cycleRepeat() {
        controller?.let {
            it.repeatMode = when (it.repeatMode) {
                Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                else -> Player.REPEAT_MODE_OFF
            }
        }
    }

    fun toggleLikeCurrent() {
        controller?.sendCustomCommand(SessionCommand(PlaybackService.CMD_TOGGLE_LIKE, Bundle.EMPTY), Bundle.EMPTY)
    }

    /** Called after a download completes so a playing stream can switch to the local file next time. */
    fun currentItem(): MediaItem? = controller?.currentMediaItem

    override fun onCleared() {
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controller = null
        super.onCleared()
    }
}
