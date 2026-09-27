package com.soaresden.sunoauto.data

import android.net.Uri
import java.io.File

/**
 * A clip's `localPath` can be one of two things:
 *  - an absolute file path, for a track the app downloaded (app-private storage), or
 *  - a `content://` SAF URI, for a track linked from a folder the user picked (any provider:
 *    pCloud, Drive, local…), streamed on demand.
 * These helpers hide that difference from the UI and the player.
 */
object LocalFiles {
    fun isContent(path: String?): Boolean = path?.startsWith("content:") == true

    /** true if the local source is (still) usable. Content URIs are trusted (validated at import). */
    fun available(path: String?): Boolean =
        path != null && (isContent(path) || File(path).exists())

    fun uriOrNull(path: String?): Uri? = when {
        path == null -> null
        isContent(path) -> Uri.parse(path)
        else -> File(path).takeIf { it.exists() }?.let(Uri::fromFile)
    }
}
