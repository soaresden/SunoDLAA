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
import com.soaresden.sunoauto.auth.ClerkAuth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Runs the full library sync as a foreground job so the OS doesn't kill it mid-way. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    companion object {
        const val NAME = "suno-sync"
        private const val CHANNEL = "sync"
        private const val NOTIF_ID = 4243
    }

    override suspend fun getForegroundInfo(): ForegroundInfo = foregroundInfo(com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.starting), 0)

    override suspend fun doWork(): Result {
        val app = SunoApp.get(applicationContext)
        try { setForeground(foregroundInfo(com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.starting), 0)) } catch (_: Exception) {}
        return withContext(Dispatchers.IO) {
            val progressJob = launch {
                app.repo.syncState.collectLatest { st ->
                    if (st.running) runCatching { setForeground(foregroundInfo(st.message ?: "…", (st.progress * 100).toInt())) }
                }
            }
            try {
                app.repo.syncAll()
                Result.success()
            } catch (e: CancellationException) {
                throw e
            } catch (e: ClerkAuth.NotLoggedIn) {
                Result.failure()
            } catch (e: Exception) {
                if (runAttemptCount < 2) Result.retry() else Result.failure()
            } finally {
                progressJob.cancel()
            }
        }
    }

    private fun foregroundInfo(text: String, pct: Int): ForegroundInfo {
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.channel_sync), NotificationManager.IMPORTANCE_LOW))
        }
        val n = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(com.soaresden.sunoauto.LocaleHelper.s(com.soaresden.sunoauto.R.string.notif_sync_title))
            .setContentText(text)
            .setProgress(100, pct, pct == 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            ForegroundInfo(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else ForegroundInfo(NOTIF_ID, n)
    }
}
