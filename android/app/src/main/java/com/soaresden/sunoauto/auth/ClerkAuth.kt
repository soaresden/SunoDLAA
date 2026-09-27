package com.soaresden.sunoauto.auth

import android.util.Log
import com.soaresden.sunoauto.data.prefs.AppPrefs
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Suno authenticates through Clerk. The only durable secret is the `__client` cookie
 * (set on .suno.com after login). From it we get:
 *   1. the last active session id   GET  {clerk}/v1/client
 *   2. a short-lived JWT (~60 s)     POST {clerk}/v1/client/sessions/{sid}/tokens
 * The JWT goes in `Authorization: Bearer …` on every studio-api call.
 */
class ClerkAuth(private val prefs: AppPrefs, private val http: OkHttpClient) {

    companion object {
        private const val TAG = "ClerkAuth"
        const val CLERK_API_VERSION = "2025-11-10"
        const val CLERK_JS_VERSION = "5.117.0"
        private const val JWT_TTL_MS = 50_000L
    }

    class NotLoggedIn : Exception("Not logged in to Suno")
    class AuthFailed(msg: String) : Exception(msg)

    private val json = Json { ignoreUnknownKeys = true }
    private val mutex = Mutex()

    @Volatile private var jwt: String? = null
    @Volatile private var jwtIssuedAt: Long = 0L

    fun invalidate() { jwt = null; jwtIssuedAt = 0L }

    /**
     * Checks that [cookie] belongs to a signed-in Clerk client (Clerk also hands a `__client`
     * cookie to anonymous visitors, which has no session). Returns the session id, or throws.
     */
    suspend fun probe(cookie: String): String {
        val sid = fetchSessionId(cookie)
        fetchJwt(cookie, sid)
        return sid
    }

    /** Returns a JWT valid for the next few seconds, refreshing it when needed. */
    suspend fun token(): String = mutex.withLock {
        val cached = jwt
        if (cached != null && System.currentTimeMillis() - jwtIssuedAt < JWT_TTL_MS) return cached
        val cookie = prefs.clientCookieNow() ?: throw NotLoggedIn()
        val sid = prefs.sessionIdNow() ?: fetchSessionId(cookie).also { prefs.setSessionId(it) }
        val fresh = try {
            fetchJwt(cookie, sid)
        } catch (e: AuthFailed) {
            // session id may be stale: re-resolve it once
            Log.w(TAG, "JWT refresh failed (${e.message}), re-resolving session id")
            val newSid = fetchSessionId(cookie)
            prefs.setSessionId(newSid)
            fetchJwt(cookie, newSid)
        }
        jwt = fresh
        jwtIssuedAt = System.currentTimeMillis()
        fresh
    }

    private suspend fun clerkUrl(path: String): String =
        "${prefs.clerkBaseNow()}$path?__clerk_api_version=$CLERK_API_VERSION&_clerk_js_version=$CLERK_JS_VERSION"

    private suspend fun fetchSessionId(cookie: String): String {
        val req = Request.Builder()
            .url(clerkUrl("/v1/client"))
            .header("Authorization", cookie)
            .header("Cookie", "__client=$cookie")
            .get()
            .build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw AuthFailed("Clerk /v1/client -> ${resp.code}")
            val root = json.parseToJsonElement(body).jsonObject
            val response = root["response"]?.jsonObject ?: throw AuthFailed("Clerk: no response object")
            val sid = response["last_active_session_id"]?.jsonPrimitive?.content
            if (sid.isNullOrBlank() || sid == "null") throw AuthFailed("Clerk: no active session — cookie expired?")
            runCatching { prefs.setAccountLabel(accountLabel(response, sid)) }
            return sid
        }
    }

    /** "username · email" of the session's user, for the settings screen. */
    private fun accountLabel(response: kotlinx.serialization.json.JsonObject, sid: String): String? {
        val sessions = response["sessions"]?.let { it as? kotlinx.serialization.json.JsonArray } ?: return null
        val session = sessions.map { it.jsonObject }.firstOrNull { it["id"]?.jsonPrimitive?.content == sid } ?: sessions.firstOrNull()?.jsonObject ?: return null
        val user = session["user"]?.jsonObject ?: return null
        fun str(k: String) = user[k]?.let { if (it is kotlinx.serialization.json.JsonNull) null else it.jsonPrimitive.content }?.takeIf { it.isNotBlank() && it != "null" }
        val name = str("username") ?: listOfNotNull(str("first_name"), str("last_name")).joinToString(" ").takeIf { it.isNotBlank() }
        val email = user["email_addresses"]?.let { it as? kotlinx.serialization.json.JsonArray }?.firstOrNull()?.jsonObject?.get("email_address")?.jsonPrimitive?.content
        return listOfNotNull(name, email).joinToString(" · ").takeIf { it.isNotBlank() }
    }

    private suspend fun fetchJwt(cookie: String, sid: String): String {
        val req = Request.Builder()
            .url(clerkUrl("/v1/client/sessions/$sid/tokens"))
            .header("Authorization", cookie)
            .header("Cookie", "__client=$cookie")
            .post("".toRequestBody(null))
            .build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw AuthFailed("Clerk tokens -> ${resp.code}")
            val root = json.parseToJsonElement(body).jsonObject
            return root["jwt"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
                ?: throw AuthFailed("Clerk: empty jwt")
        }
    }
}
