package com.soaresden.sunoauto.data.api

import android.util.Log
import com.soaresden.sunoauto.auth.ClerkAuth
import com.soaresden.sunoauto.data.prefs.AppPrefs
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Thin client for Suno's (unofficial) studio API. Endpoints were captured from the web app;
 * they live in one place so they are easy to patch when Suno changes something.
 */
class SunoApi(
    private val prefs: AppPrefs,
    private val auth: ClerkAuth,
    private val http: OkHttpClient
) {
    companion object {
        private const val TAG = "SunoApi"
        const val PROJECTS_PAGE_SIZE = 20
        const val FEED_PAGE_SIZE = 20
        private val JSON_TYPE = "application/json".toMediaType()
    }

    class ApiError(val code: Int, val path: String, body: String) : IOException("$path -> $code: ${body.take(200)}")

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }

    /** Suno rate-limits bursts; keep a small gap between calls and back off on 429. */
    private val throttle = kotlinx.coroutines.sync.Mutex()
    private var lastRequestAt = 0L
    private val minGapMs = 250L

    private suspend fun pace() = throttle.withLock {
        val wait = minGapMs - (System.currentTimeMillis() - lastRequestAt)
        if (wait > 0) kotlinx.coroutines.delay(wait)
        lastRequestAt = System.currentTimeMillis()
    }

    // ---- endpoints -------------------------------------------------------------------------

    /** Workspaces. 1-indexed pages, 20 per page. */
    suspend fun projects(page: Int): ProjectsPage =
        get("/api/project/me?page=$page&sort=max_created_at_last_updated_clip&show_trashed=false&exclude_shared=false")

    /** Clips of one workspace. 0-indexed pages, 20 per page.
     *  NB: for the pseudo-id "default" Suno ignores the filter and returns the whole library. */
    suspend fun projectClips(projectId: String, page: Int): FeedPage =
        get("/api/feed/v2?page=$page&project_id=$projectId")

    /** Clips of one workspace through the project endpoint (1-indexed pages). Used for "default". */
    suspend fun projectDetail(projectId: String, page: Int): ApiProjectDetail =
        get("/api/project/$projectId?page=$page")

    /** Liked songs. 0-indexed pages. */
    suspend fun likedClips(page: Int): FeedPage = get("/api/feed/v2?page=$page&is_liked=true")

    /** All of the user's clips regardless of workspace. 0-indexed pages. */
    suspend fun allClips(page: Int): FeedPage = get("/api/feed/v2?page=$page")

    /** Clips by id (max ~20 per call). */
    suspend fun clipsByIds(ids: List<String>): FeedPage =
        get("/api/feed/v2?ids=${ids.joinToString(",")}")

    /** User playlists. 1-indexed pages. Clip lists inside are NOT populated; use [playlistClips]. */
    suspend fun playlists(page: Int): PlaylistsPage =
        get("/api/playlist/me?page=$page&show_trashed=false&show_sharelist=false")

    /** One playlist page with its clips. 1-indexed pages. */
    suspend fun playlistClips(playlistId: String, page: Int): ApiPlaylist =
        get("/api/playlist/$playlistId/?page=$page")

    /** Free vs Pro: is_active is true on an active paid subscription. */
    suspend fun billingInfo(): BillingInfo = get("/api/billing/info/")

    /** Official download resolver (the web app's "Download" button). Honours the account's plan;
     *  returns not_authorized when the plan has no downloads. Never bypasses that. */
    suspend fun resolveDownload(clipId: String, format: String = "mp3"): DownloadResolve =
        get("/api/download/clip/$clipId?format=$format")

    /** Like / unlike a clip (the "favori" of the web app). */
    suspend fun setLiked(clipId: String, liked: Boolean) {
        post<Unit, ReactionBody>("/api/gen/$clipId/update_reaction_type/", ReactionBody(if (liked) "LIKE" else null))
    }

    /** A workspace's clips WITH their full raw JSON kept, so nothing Suno provides is lost. */
    suspend fun projectDetailRaw(projectId: String, page: Int): Triple<Int?, Int, List<Pair<ApiClip, String>>> {
        val text = rawGet("/api/project/$projectId?page=$page")
        val root = json.parseToJsonElement(text).jsonObject
        val total = root["num_total_results"]?.jsonPrimitive?.content?.toIntOrNull()
        val arr = root["project_clips"]?.jsonArray ?: return Triple(total, 0, emptyList())
        val out = arr.mapNotNull { pc ->
            val clipEl = pc.jsonObject["clip"] ?: return@mapNotNull null
            val clip = runCatching { json.decodeFromJsonElement(ApiClip.serializer(), clipEl) }.getOrNull() ?: return@mapNotNull null
            clip to clipEl.toString()
        }
        return Triple(total, arr.size, out)
    }

    // ---- plumbing --------------------------------------------------------------------------

    /** Like [get] but returns the raw response body string. */
    private suspend fun rawGet(path: String): String {
        var attempt = 0; var rate = 0
        while (true) {
            attempt++; pace()
            val token = auth.token()
            val req = Request.Builder().url(prefs.apiBaseNow() + path).get()
                .header("Authorization", "Bearer $token").header("Accept", "application/json").build()
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (resp.code == 401 && attempt == 1) { auth.invalidate(); return@use }
                if (resp.code == 429 && rate < 5) { rate++; kotlinx.coroutines.delay((3000L shl (rate - 1)).coerceAtMost(60_000L)); return@use }
                if (!resp.isSuccessful) throw ApiError(resp.code, path, text)
                return text
            }
        }
    }

    private suspend inline fun <reified T> get(path: String): T {
        val req = Request.Builder().url(prefs.apiBaseNow() + path).get()
        return execute(path, req)
    }

    private suspend inline fun <reified T, reified B> post(path: String, body: B): T {
        val payload = json.encodeToString(body).toRequestBody(JSON_TYPE)
        val req = Request.Builder().url(prefs.apiBaseNow() + path).post(payload)
        return execute(path, req)
    }

    private suspend inline fun <reified T> execute(path: String, builder: Request.Builder): T {
        var attempt = 0
        var rateLimitHits = 0
        while (true) {
            attempt++
            pace()
            val token = auth.token()
            val req = builder
                .header("Authorization", "Bearer $token")
                .header("Accept", "application/json")
                .build()
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (resp.code == 401 && attempt == 1) {
                    Log.w(TAG, "401 on $path, refreshing token")
                    auth.invalidate()
                    return@use
                }
                if (resp.code == 429 && rateLimitHits < 5) {
                    rateLimitHits++
                    val retryAfter = resp.header("Retry-After")?.toLongOrNull()?.times(1000)
                    val wait = retryAfter ?: (3000L shl (rateLimitHits - 1)).coerceAtMost(60_000L)
                    Log.w(TAG, "429 on $path, waiting ${wait}ms (hit $rateLimitHits)")
                    kotlinx.coroutines.delay(wait)
                    return@use
                }
                if (!resp.isSuccessful) throw ApiError(resp.code, path, text)
                if (T::class == Unit::class) return Unit as T
                return json.decodeFromString<T>(text)
            }
        }
    }
}
