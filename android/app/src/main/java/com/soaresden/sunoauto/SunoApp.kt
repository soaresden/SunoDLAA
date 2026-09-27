package com.soaresden.sunoauto

import android.app.Application
import android.content.Context
import com.soaresden.sunoauto.auth.ClerkAuth
import com.soaresden.sunoauto.data.api.SunoApi
import com.soaresden.sunoauto.data.db.AppDatabase
import com.soaresden.sunoauto.data.prefs.AppPrefs
import com.soaresden.sunoauto.data.repo.LibraryRepository
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/** Poor man's dependency container — the app is small enough not to need Hilt. */
class SunoApp : Application() {

    override fun onCreate() {
        super.onCreate()
        LocaleHelper.app = this
    }

    val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) SunoAutoPlayer/1.0")
                        .build()
                )
            }
            .apply {
                if (BuildConfig.DEBUG) addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            }
            .build()
    }

    val prefs: AppPrefs by lazy { AppPrefs(this) }
    val db: AppDatabase by lazy { AppDatabase.get(this) }
    val auth: ClerkAuth by lazy { ClerkAuth(prefs, http) }
    val api: SunoApi by lazy { SunoApi(prefs, auth, http) }
    val repo: LibraryRepository by lazy { LibraryRepository(this, db, api, prefs) }

    companion object {
        fun get(context: Context): SunoApp = context.applicationContext as SunoApp
    }
}
