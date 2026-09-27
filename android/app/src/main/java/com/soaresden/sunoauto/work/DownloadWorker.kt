package com.soaresden.sunoauto.work

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.soaresden.sunoauto.R
import com.soaresden.sunoauto.SunoApp
import okhttp3.Request
import java.io.File

/**
 * Downloads one clip (audio + cover) into app-private storage:
 *   Android/data/com.soaresden.sunoauto/files/Music/Suno/<Workspace>/<title>.m4a
 * Files are app-private so no storage permission is needed; they are visible over USB.
 */
class DownloadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    companion object {
        const val KEY_CLIP_ID = "clipId"
        private const val CHANNEL = "downloads"
        private const val NOTIF_ID = 4242
    }

    override suspend fun doWork(): Result {
        val app = SunoApp.get(applicationContext)
        val db = app.db
        val clipId = inputData.getString(KEY_CLIP_ID) ?: return Result.failure()
        val clip = db.clips().byId(clipId) ?: return Result.failure()

        try { setForeground(foregroundInfo(clip.title, 0)) } catch (_: Exception) { /* not allowed on some OEMs; keep going */ }
        db.downloads().update(clipId, 1, 0)

        if (!app.prefs.isProNow()) {
            db.downloads().update(clipId, 3, 0, com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.dl_need_pro))
            return Result.failure()
        }
        // Ask Suno's official download endpoint for a real (unencrypted) file URL. This honours the
        // account's plan: on a plan without downloads it answers not_authorized, and we stop there.
        val downloadUrl: String = try {
            var resolve = app.repo.apiClient.resolveDownload(clipId, "mp3")
            var tries = 0
            while (resolve.status == "processing" && tries < 20) {
                kotlinx.coroutines.delay(2000); tries++
                resolve = app.repo.apiClient.resolveDownload(clipId, "mp3")
            }
            when {
                resolve.url != null -> resolve.url!!
                resolve.reason == "not_authorized" ->
                    { db.downloads().update(clipId, 3, 0, com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.dl_refused_free)); return Result.failure() }
                else ->
                    { db.downloads().update(clipId, 3, 0, resolve.message ?: com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.dl_no_link)); return Result.failure() }
            }
        } catch (e: Exception) {
            db.downloads().update(clipId, 3, 0, com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.dl_error, e.message ?: ""))
            return if (runAttemptCount < 2) Result.retry() else Result.failure()
        }

        val projectName = clip.projectId?.let { db.projects().byId(it)?.name } ?: com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.no_workspace)
        val dir = File(app.repo.downloadRoot(), safeName(projectName)).apply { mkdirs() }
        val ext = "mp3"
        val target = File(dir, "${safeName(clip.title)}_${clip.id.take(8)}.$ext")
        val tmp = File(dir, target.name + ".part")

        return try {
            val req = Request.Builder().url(downloadUrl).get().build()
            app.http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code}")
                val body = resp.body ?: throw IllegalStateException("empty body")
                val total = body.contentLength()
                body.byteStream().use { input ->
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        var read: Int
                        var done = 0L
                        var lastPct = -1
                        while (input.read(buf).also { read = it } >= 0) {
                            if (isStopped) throw InterruptedException("cancelled")
                            out.write(buf, 0, read)
                            done += read
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct && pct % 5 == 0) {
                                    lastPct = pct
                                    db.downloads().update(clipId, 1, pct)
                                    try { setForeground(foregroundInfo(clip.title, pct)) } catch (_: Exception) {}
                                }
                            }
                        }
                    }
                }
            }
            if (!tmp.renameTo(target)) throw IllegalStateException("rename failed")

            // cover (best effort)
            var coverPath: String? = null
            clip.imageUrl?.let { url ->
                runCatching {
                    val cover = File(dir, target.nameWithoutExtension + ".jpg")
                    app.http.newCall(Request.Builder().url(url).build()).execute().use { r ->
                        if (r.isSuccessful) r.body?.byteStream()?.use { i -> cover.outputStream().use { o -> i.copyTo(o) } }
                    }
                    if (cover.length() > 0) coverPath = cover.absolutePath else cover.delete()
                }
            }

            db.clips().setLocalPath(clipId, target.absolutePath, coverPath)
            db.downloads().update(clipId, 2, 100)
            Result.success()
        } catch (e: InterruptedException) {
            tmp.delete(); db.downloads().delete(clipId); Result.failure()
        } catch (e: Exception) {
            tmp.delete()
            db.downloads().update(clipId, 3, 0, e.message ?: e.toString())
            if (runAttemptCount < 2) Result.retry() else Result.failure()
        }
    }

    private fun safeName(s: String): String =
        s.replace(Regex("[\\\\/:*?\"<>|\\n\\r\\t]"), "_").trim().take(80).ifBlank { "untitled" }

    private fun foregroundInfo(title: String, pct: Int): ForegroundInfo {
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.channel_downloads), NotificationManager.IMPORTANCE_LOW))
        }
        val n = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(R.drawable.ic_download)
            .setContentTitle(applicationContext.getString(R.string.downloading))
            .setContentText(title)
            .setProgress(100, pct, pct == 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            ForegroundInfo(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else ForegroundInfo(NOTIF_ID, n)
    }
}
