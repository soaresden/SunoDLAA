package com.soaresden.sunoauto.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "suno_prefs")

/**
 * Small persisted settings: auth cookie, Clerk session id, last sync time, endpoint overrides.
 * Endpoint overrides let the user fix a path from the Settings screen if Suno changes its API,
 * without rebuilding the app.
 */
class AppPrefs(private val context: Context) {

    companion object {
        val CLIENT_COOKIE = stringPreferencesKey("client_cookie")   // value of the Clerk `__client` cookie
        val SESSION_ID = stringPreferencesKey("clerk_sid")
        val LAST_SYNC = longPreferencesKey("last_sync")
        val API_BASE = stringPreferencesKey("api_base")
        val CLERK_BASE = stringPreferencesKey("clerk_base")
        val DOWNLOAD_ROOT = stringPreferencesKey("download_root")
        val LAST_MEDIA_ID = stringPreferencesKey("last_media_id")
        val ACCOUNT_LABEL = stringPreferencesKey("account_label")
        val ACCOUNT_PLAN = stringPreferencesKey("account_plan")
        val LOCAL_TREE = stringPreferencesKey("local_tree_uri")
        val LOCAL_SUMMARY = stringPreferencesKey("local_summary")
        val FOLDER_PATTERN = stringPreferencesKey("folder_pattern")
        val IS_PRO = androidx.datastore.preferences.core.booleanPreferencesKey("is_pro")
        val CREDITS = androidx.datastore.preferences.core.intPreferencesKey("credits_left")

        const val DEFAULT_API_BASE = "https://studio-api.prod.suno.com"
        const val DEFAULT_CLERK_BASE = "https://auth.suno.com"
    }

    val clientCookie: Flow<String?> = context.dataStore.data.map { it[CLIENT_COOKIE] }
    val isLoggedIn: Flow<Boolean> = clientCookie.map { !it.isNullOrBlank() }
    val lastSync: Flow<Long> = context.dataStore.data.map { it[LAST_SYNC] ?: 0L }
    val apiBase: Flow<String> = context.dataStore.data.map { it[API_BASE] ?: DEFAULT_API_BASE }
    val clerkBase: Flow<String> = context.dataStore.data.map { it[CLERK_BASE] ?: DEFAULT_CLERK_BASE }
    val accountLabel: Flow<String?> = context.dataStore.data.map { it[ACCOUNT_LABEL] }
    val accountPlan: Flow<String?> = context.dataStore.data.map { it[ACCOUNT_PLAN] }
    suspend fun setAccountPlan(v: String?) = context.dataStore.edit { if (v == null) it.remove(ACCOUNT_PLAN) else it[ACCOUNT_PLAN] = v }
    val localTree: Flow<String?> = context.dataStore.data.map { it[LOCAL_TREE] }
    val localSummary: Flow<String?> = context.dataStore.data.map { it[LOCAL_SUMMARY] }
    val folderPattern: Flow<String?> = context.dataStore.data.map { it[FOLDER_PATTERN] }
    suspend fun folderPatternNow(): String? = folderPattern.first()
    suspend fun setFolderPattern(v: String?) = context.dataStore.edit { if (v.isNullOrBlank()) it.remove(FOLDER_PATTERN) else it[FOLDER_PATTERN] = v.trim() }
    val isPro: Flow<Boolean> = context.dataStore.data.map { it[IS_PRO] ?: false }
    val credits: Flow<Int?> = context.dataStore.data.map { it[CREDITS] }
    suspend fun setCredits(v: Int?) = context.dataStore.edit { if (v == null) it.remove(CREDITS) else it[CREDITS] = v }

    suspend fun isProNow(): Boolean = isPro.first()
    suspend fun setPro(v: Boolean) = context.dataStore.edit { it[IS_PRO] = v }

    suspend fun localTreeNow(): String? = localTree.first()
    suspend fun setLocalTree(v: String?) = context.dataStore.edit { if (v == null) it.remove(LOCAL_TREE) else it[LOCAL_TREE] = v }
    suspend fun setLocalSummary(v: String?) = context.dataStore.edit { if (v == null) it.remove(LOCAL_SUMMARY) else it[LOCAL_SUMMARY] = v }

    suspend fun setAccountLabel(v: String?) = context.dataStore.edit {
        if (v.isNullOrBlank()) it.remove(ACCOUNT_LABEL) else it[ACCOUNT_LABEL] = v
    }

    suspend fun clientCookieNow(): String? = clientCookie.first()
    suspend fun sessionIdNow(): String? = context.dataStore.data.map { it[SESSION_ID] }.first()
    suspend fun apiBaseNow(): String = apiBase.first()
    suspend fun clerkBaseNow(): String = clerkBase.first()

    suspend fun setClientCookie(value: String?) = context.dataStore.edit {
        if (value.isNullOrBlank()) it.remove(CLIENT_COOKIE) else it[CLIENT_COOKIE] = value.trim()
        it.remove(SESSION_ID)
    }

    suspend fun setSessionId(sid: String) = context.dataStore.edit { it[SESSION_ID] = sid }
    suspend fun setLastSync(ts: Long) = context.dataStore.edit { it[LAST_SYNC] = ts }
    suspend fun setApiBase(v: String) = context.dataStore.edit {
        if (v.isBlank()) it.remove(API_BASE) else it[API_BASE] = v.trim().trimEnd('/')
    }
    suspend fun setClerkBase(v: String) = context.dataStore.edit {
        if (v.isBlank()) it.remove(CLERK_BASE) else it[CLERK_BASE] = v.trim().trimEnd('/')
    }

    suspend fun logout() = context.dataStore.edit {
        it.remove(CLIENT_COOKIE); it.remove(SESSION_ID); it.remove(LAST_SYNC); it.remove(ACCOUNT_LABEL)
    }
}
