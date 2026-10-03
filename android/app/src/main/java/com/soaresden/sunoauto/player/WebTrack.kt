package com.soaresden.sunoauto.player

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSpec
import kotlin.math.min

/**
 * Tracks played by Suno's web player (see [SunoWebEngine]) sit in the normal queue as
 * `sunoweb://clip/<id>?ms=<duration>`. ExoPlayer "plays" a generated SILENT wav of that length, so
 * the queue, next/previous, shuffle, the notification and Android Auto keep working as usual,
 * while the sound comes from Suno's page.
 */
object WebTrack {
    const val SCHEME = "sunoweb"
    fun uri(clipId: String, durationSec: Double?): Uri {
        val ms = (((durationSec ?: 300.0).coerceAtLeast(10.0)) + 4.0) * 1000
        return Uri.parse("$SCHEME://clip/$clipId?ms=${ms.toLong()}")
    }
    fun isWeb(uri: Uri?) = uri?.scheme == SCHEME
}

/** A silent 8 kHz mono 16-bit wav of the length given in the uri, generated on the fly. */
@OptIn(UnstableApi::class)
class SilentWavDataSource : BaseDataSource(false) {
    private var uri: Uri? = null
    private var total = 0L
    private var pos = 0L
    private var remaining = 0L
    private val header = ByteArray(44)

    override fun open(dataSpec: DataSpec): Long {
        transferInitializing(dataSpec)
        uri = dataSpec.uri
        val ms = dataSpec.uri.getQueryParameter("ms")?.toLongOrNull() ?: 300_000L
        val dataLen = ms * 16L               // 8000 samples/s * 2 bytes = 16 bytes per ms
        total = 44 + dataLen
        fillHeader(dataLen)
        pos = dataSpec.position
        remaining = if (dataSpec.length != C.LENGTH_UNSET.toLong()) dataSpec.length else total - pos
        transferStarted(dataSpec)
        return remaining
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (remaining <= 0) return C.RESULT_END_OF_INPUT
        val n = min(length.toLong(), remaining).toInt()
        for (i in 0 until n) {
            val p = pos + i
            buffer[offset + i] = if (p < 44) header[p.toInt()] else 0
        }
        pos += n; remaining -= n
        bytesTransferred(n)
        return n
    }

    override fun getUri(): Uri? = uri
    override fun close() { if (uri != null) { uri = null; transferEnded() } }

    private fun fillHeader(dataLen: Long) {
        fun le32(at: Int, v: Long) { for (i in 0..3) header[at + i] = (v shr (8 * i)).toByte() }
        fun le16(at: Int, v: Int) { header[at] = v.toByte(); header[at + 1] = (v shr 8).toByte() }
        "RIFF".toByteArray().copyInto(header, 0); le32(4, 36 + dataLen)
        "WAVE".toByteArray().copyInto(header, 8); "fmt ".toByteArray().copyInto(header, 12)
        le32(16, 16); le16(20, 1); le16(22, 1); le32(24, 8000); le32(28, 16000); le16(32, 2); le16(34, 16)
        "data".toByteArray().copyInto(header, 36); le32(40, dataLen)
    }
}
