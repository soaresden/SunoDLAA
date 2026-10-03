package com.soaresden.sunoauto.player

import android.content.Context
import android.net.Uri
import android.os.StatFs
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheEvictor
import androidx.media3.datasource.cache.CacheSpan
import androidx.media3.datasource.cache.SimpleCache
import java.io.File
import java.util.TreeSet

/**
 * Play cache: every track that is played (Suno stream or pCloud file) is kept on the phone, up to a
 * size chosen in Settings, so it plays again without network (tunnels, no coverage). The least
 * recently played tracks are dropped first when the limit is reached. 0 = cache off.
 * Files already on the phone (file://) are never copied.
 */
@OptIn(UnstableApi::class)
object PlayCache {
    private const val PREFS = "sunodlaa_cache"
    private const val KEY_MAX_MB = "max_mb"
    const val DEFAULT_MB = 1024L
    val OPTIONS = listOf(0L, 250L, 500L, 1024L, 2048L, 4096L)
    private const val MB = 1024L * 1024L

    @Volatile private var cache: SimpleCache? = null
    private val evictor = LruEvictor()

    private fun dir(ctx: Context) = File(ctx.getExternalFilesDir(null) ?: ctx.filesDir, "playcache")

    fun maxMb(ctx: Context): Long = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_MAX_MB, DEFAULT_MB)

    fun enabled(ctx: Context) = maxMb(ctx) > 0

    @Synchronized
    fun get(ctx: Context): SimpleCache {
        cache?.let { return it }
        evictor.maxBytes = maxMb(ctx).coerceAtLeast(1) * MB
        return SimpleCache(dir(ctx.applicationContext), evictor, StandaloneDatabaseProvider(ctx.applicationContext)).also { cache = it }
    }

    fun setMaxMb(ctx: Context, mb: Long) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(KEY_MAX_MB, mb).apply()
        val c = get(ctx)
        if (mb <= 0) clear(ctx) else { evictor.maxBytes = mb * MB; evictor.trim(c); bump() }
    }

    fun usedBytes(ctx: Context): Long = runCatching { get(ctx).cacheSpace }.getOrDefault(0L)

    fun freeBytes(ctx: Context): Long = runCatching { StatFs(dir(ctx).apply { mkdirs() }.path).availableBytes }.getOrDefault(-1L)

    fun clear(ctx: Context) {
        val c = get(ctx)
        for (k in c.keys.toList()) runCatching { c.removeResource(k) }
        bump()
    }

    /** Changes when the cache content may have changed, so the lists refresh their ⚡ icons. */
    val version = androidx.compose.runtime.mutableIntStateOf(0)
    fun bump() { android.os.Handler(android.os.Looper.getMainLooper()).post { version.intValue++ } }

    /** Same key as the player uses: the file/content URI, else the stream link. */
    fun keyFor(localPath: String?, audioUrl: String?): String? =
        com.soaresden.sunoauto.data.LocalFiles.uriOrNull(localPath)?.takeIf { it.scheme != "file" }?.toString()
            ?: if (localPath == null) audioUrl?.takeIf { it.isNotBlank() } else null

    /** true when the whole track is in the play cache (plays without network). */
    fun isFullyCached(ctx: Context, key: String?): Boolean {
        if (key == null || !enabled(ctx)) return false
        return runCatching {
            val c = get(ctx)
            val len = androidx.media3.datasource.cache.ContentMetadata.getContentLength(c.getContentMetadata(key))
            len > 0 && c.isCached(key, 0, len)
        }.getOrDefault(false)
    }

    /** Same as LeastRecentlyUsedCacheEvictor, but the limit can change while the app runs. */
    private class LruEvictor : CacheEvictor {
        @Volatile var maxBytes: Long = DEFAULT_MB * MB
        private val spans = TreeSet<CacheSpan> { a, b ->
            val d = a.lastTouchTimestamp.compareTo(b.lastTouchTimestamp)
            if (d != 0) d else a.compareTo(b)
        }
        private var current = 0L

        override fun requiresCacheSpanTouches() = true
        override fun onCacheInitialized() {}
        override fun onStartFile(cache: Cache, key: String, position: Long, length: Long) {
            if (length != C.LENGTH_UNSET.toLong()) evict(cache, length)
        }
        override fun onSpanAdded(cache: Cache, span: CacheSpan) { spans.add(span); current += span.length; evict(cache, 0) }
        override fun onSpanRemoved(cache: Cache, span: CacheSpan) { spans.remove(span); current -= span.length }
        override fun onSpanTouched(cache: Cache, oldSpan: CacheSpan, newSpan: CacheSpan) {
            onSpanRemoved(cache, oldSpan); onSpanAdded(cache, newSpan)
        }
        fun trim(cache: Cache) = synchronized(cache) { evict(cache, 0) }
        private fun evict(cache: Cache, required: Long) {
            while (current + required > maxBytes && spans.isNotEmpty()) {
                try { cache.removeSpan(spans.first()) } catch (_: Exception) { spans.pollFirst() }
            }
        }
    }
}

/**
 * Sends local files (file://) straight to disk and everything else (Suno stream, pCloud content://)
 * through the play cache — or straight through when the cache is off.
 */
@OptIn(UnstableApi::class)
class CacheOrDirectDataSource(
    private val ctx: Context,
    private val direct: DataSource,
    private val cached: DataSource
) : DataSource {
    private var current: DataSource? = null
    override fun addTransferListener(transferListener: TransferListener) {
        direct.addTransferListener(transferListener); cached.addTransferListener(transferListener)
    }
    override fun open(dataSpec: DataSpec): Long {
        val useCache = dataSpec.uri.scheme != "file" && PlayCache.enabled(ctx)
        val ds = if (useCache) cached else direct
        current = ds
        return ds.open(dataSpec)
    }
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = current!!.read(buffer, offset, length)
    override fun getUri(): Uri? = current?.uri
    override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()
    override fun close() { try { current?.close() } finally { current = null } }
}
