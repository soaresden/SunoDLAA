package com.soaresden.sunoauto.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * Wire models for studio-api-prod.suno.com, captured from the web app (Sept. 2026).
 * Only the fields we use are declared; everything else is ignored.
 */

@Serializable
data class ProjectsPage(
    @SerialName("num_total_results") val numTotalResults: Int = 0,
    @SerialName("current_page") val currentPage: Int = 1,
    val projects: List<ApiProject> = emptyList()
)

@Serializable
data class ApiProject(
    val id: String,
    val name: String = "",
    val description: String? = null,
    @SerialName("clip_count") val clipCount: Int = 0,
    @SerialName("last_updated_clip") val lastUpdatedClip: String? = null,
    val shared: Boolean = false
)

@Serializable
data class FeedPage(
    val clips: List<ApiClip> = emptyList(),
    @SerialName("num_total_results") val numTotalResults: Int = 0,
    @SerialName("current_page") val currentPage: Int = 0,
    @SerialName("has_more") val hasMore: Boolean = false
)

@Serializable
data class ApiMediaUrl(
    val url: String,
    @SerialName("content_type") val contentType: String? = null,
    val delivery: String? = null
)

@Serializable
data class ApiClipProjectRef(val id: String, val name: String? = null)

@Serializable
data class ApiClipMetadata(
    val tags: String? = null,
    val prompt: String? = null,
    val duration: Double? = null,
    val type: String? = null,
    val task: String? = null,                                   // "cover", "extend", "upload"…
    @SerialName("cover_clip_id") val coverClipId: String? = null, // the original this clip is a cover of
    @SerialName("gpt_description_prompt") val gptDescriptionPrompt: String? = null
)

@Serializable
data class ApiClip(
    val id: String,
    val title: String = "",
    val status: String? = null,
    @SerialName("audio_url") val audioUrl: String? = null,
    @SerialName("media_urls") val mediaUrls: List<ApiMediaUrl> = emptyList(),
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("image_large_url") val imageLargeUrl: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("model_name") val modelName: String? = null,
    @SerialName("major_model_version") val majorModelVersion: String? = null,
    @SerialName("is_liked") val isLiked: Boolean = false,
    @SerialName("is_trashed") val isTrashed: Boolean = false,
    val metadata: ApiClipMetadata? = null,
    val project: ApiClipProjectRef? = null
) {
    /**
     * The classic `audio_url` (cdn1.suno.ai/<id>.mp3) now answers `/api/forbidden` for
     * non-unlocked clips; the playable stream is the first progressive `media_urls` entry.
     */
    val bestAudioUrl: String?
        get() = mediaUrls.firstOrNull { it.delivery == null || it.delivery == "progressive" }?.url
            ?: mediaUrls.firstOrNull()?.url
            ?: audioUrl?.takeIf { !it.endsWith("/api/forbidden") }

    val isPlayable: Boolean get() = status == "complete" && bestAudioUrl != null && !isTrashed
}

@Serializable
data class ApiProjectClip(val clip: ApiClip? = null)

/** GET /api/project/{id}?page=N — the only reliable way to list the "default" workspace. */
@Serializable
data class ApiProjectDetail(
    val id: String = "",
    val name: String = "",
    @SerialName("project_clips") val projectClips: List<ApiProjectClip> = emptyList(),
    @SerialName("num_total_results") val numTotalResults: Int? = null,
    @SerialName("current_page") val currentPage: Int? = null
)

@Serializable
data class PlaylistsPage(
    @SerialName("num_total_results") val numTotalResults: Int = 0,
    @SerialName("current_page") val currentPage: Int = 1,
    val playlists: List<ApiPlaylist> = emptyList()
)

@Serializable
data class ApiPlaylistClip(val clip: ApiClip? = null)

@Serializable
data class ApiPlaylist(
    val id: String,
    val name: String = "",
    val description: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("song_count") val songCount: Int? = null,
    @SerialName("num_total_results") val numTotalResults: Int = 0,
    @SerialName("current_page") val currentPage: Int = 1,
    @SerialName("is_trashed") val isTrashed: Boolean = false,
    @SerialName("playlist_clips") val playlistClips: List<ApiPlaylistClip> = emptyList()
)

@Serializable
data class ReactionBody(val reaction: String?)

/** GET /api/billing/info/ — used to tell Free from Pro. */
@Serializable
data class BillingInfo(
    @SerialName("is_active") val isActive: Boolean? = null,
    @SerialName("monthly_limit") val monthlyLimit: Int? = null,
    @SerialName("total_credits_left") val creditsLeft: Int? = null
)

/** GET /api/download/clip/{id}?format=mp3 — Suno's official download resolver. */
@Serializable
data class DownloadResolve(
    val ok: Boolean? = null,
    val reason: String? = null,     // e.g. "not_authorized" on a plan without downloads
    val message: String? = null,
    val status: String? = null,     // "processing" while the file is being prepared
    val url: String? = null
)
