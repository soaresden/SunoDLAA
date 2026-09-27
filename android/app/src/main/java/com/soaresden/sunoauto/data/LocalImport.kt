package com.soaresden.sunoauto.data

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.util.Log
import com.soaresden.sunoauto.data.db.AppDatabase
import com.soaresden.sunoauto.data.db.ClipEntity

/**
 * Links the user's own MP3s to catalogue clips by scanning a folder picked with the Android folder
 * selector (SAF). Provider-agnostic (pCloud, Drive, local…), no token — SAF grants read access.
 *
 * Method (fully offline, no file downloads):
 *   1. Keep only files whose parent folder maps to a known workspace ("<prefix><Workspace>", e.g.
 *      "Suno -Lucie" → workspace "Lucie"). Everything else on the drive is ignored.
 *   2. Inside each workspace, match each file to a clip by the Suno id in its tags (TSRC, exact);
 *      as a fallback, by a title that is unique in the workspace. Never by track number. 64 KB read.
 *   3. Resume: files already linked are skipped, so an interrupted scan continues where it stopped.
 * We only store, per clip, the content:// URI to stream; nothing is copied or decrypted.
 */
object LocalImport {

    private const val TAG = "LocalImport"
    private val DEFAULT_PREFIX = Regex("^\\s*suno\\s*[-–—]?\\s*!?\\s*", RegexOption.IGNORE_CASE)
    private val INDEX_PREFIX = Regex("^\\s*\\d+([-_ .]+\\d+)*\\s*-\\s*")
    private val AUDIO_EXT = setOf("mp3", "m4a", "flac", "wav", "ogg", "opus", "aac")
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
    private const val HEAD_BYTES = 65536   // the Suno id (TSRC tag) sits in the first ~300 bytes; 64 KB is ample
    private fun norm(s: String) = s.lowercase().replace(Regex("[^a-z0-9]"), "")

    data class Result(val linked: Int, val scanned: Int, val unmatched: Int, val workspaces: Int)
    private data class Found(val uri: Uri, val name: String, val parent: String)

    suspend fun run(context: Context, db: AppDatabase, treeUri: Uri, pattern: String?, onProgress: (Int, Int) -> Unit): Result {
        val resolver = context.contentResolver
        val projectByName = HashMap<String, String>()
        for (p in db.projects().all()) projectByName[norm(p.name)] = p.id

        // 1. collect, keep only files inside a recognized workspace folder
        val all = ArrayList<Found>()
        collect(resolver, treeUri, all)
        val byWorkspace = LinkedHashMap<String, MutableList<Found>>()   // projectId -> files
        for (f in all) {
            if (f.name.substringAfterLast('.', "").lowercase() !in AUDIO_EXT) continue
            val pid = projectByName[workspaceKey(f.parent, pattern)] ?: continue
            byWorkspace.getOrPut(pid) { ArrayList() }.add(f)
        }
        val total = byWorkspace.values.sumOf { it.size }

        val idsById = db.clips().allIds().toHashSet()
        val clipsById = HashMap<String, ClipEntity?>()
        val alreadyLinked = db.clips().linkedContentUris().toHashSet()
        var done = 0; var linked = 0; var unmatched = 0

        // 2. match per workspace
        for ((pid, files) in byWorkspace) {
            val clips = db.clips().byProject(pid)
            // title → clip, but ONLY when that title is unique in the workspace (no ambiguity)
            val titleCount = HashMap<String, Int>()
            for (c in clips) titleCount[norm(c.title)] = (titleCount[norm(c.title)] ?: 0) + 1
            val byUniqueTitle = HashMap<String, ClipEntity>()
            for (c in clips) if (titleCount[norm(c.title)] == 1) byUniqueTitle[norm(c.title)] = c
            val used = HashSet<String>()
            // clips already linked (from a previous run) count as used so we don't reassign them
            for (c in clips) if (LocalFiles.isContent(c.localPath)) used.add(c.id)

            files.forEach { f ->
                done++; onProgress(done, total)
                if (f.uri.toString() in alreadyLinked) { linked++; return@forEach }   // resume
                // 1) exact: the Suno clip id embedded in the file's tags (TSRC)
                var clip: ClipEntity? = idFromHead(resolver, f.uri, idsById)?.let { id ->
                    (clipsById.getOrPut(id) { db.clips().byId(id) } )?.takeIf { it.id !in used }
                }
                // 2) fallback: unique title within the workspace (never by track number)
                if (clip == null) {
                    val title = f.name.substringBeforeLast('.').replaceFirst(INDEX_PREFIX, "").trim()
                    clip = byUniqueTitle[norm(title)]?.takeIf { it.id !in used }
                }
                if (clip != null) {
                    db.clips().setLocalPath(clip!!.id, f.uri.toString(), null)
                    used.add(clip!!.id); alreadyLinked.add(f.uri.toString()); linked++
                } else unmatched++
            }
        }
        db.clips().recomputeOriginals()
        Log.i(TAG, "linked=$linked scanned=$total unmatched=$unmatched workspaces=${byWorkspace.size}")
        return Result(linked, total, unmatched, byWorkspace.size)
    }

    /** Folder name → normalized workspace key: strip the user's prefix (or the default) then normalize. */
    private fun workspaceKey(folder: String, pattern: String?): String {
        val stripped = if (!pattern.isNullOrBlank() && folder.trim().lowercase().startsWith(pattern.trim().lowercase()))
            folder.trim().substring(pattern.trim().length)
        else folder.replaceFirst(DEFAULT_PREFIX, "")
        return norm(stripped)
    }

    /** Reads the first 64 KB of a file and returns the first catalogue UUID found in its tags. */
    private fun idFromHead(resolver: ContentResolver, uri: Uri, known: Set<String>): String? = runCatching {
        resolver.openInputStream(uri)?.use { input ->
            val buf = ByteArray(HEAD_BYTES); var off = 0
            while (off < buf.size) { val n = input.read(buf, off, buf.size - off); if (n < 0) break; off += n }
            UUID.findAll(String(buf, 0, off, Charsets.ISO_8859_1)).map { it.value.lowercase() }.firstOrNull { it in known }
        }
    }.getOrNull()

    private fun collect(resolver: ContentResolver, tree: Uri, out: MutableList<Found>) {
        val rootId = DocumentsContract.getTreeDocumentId(tree)
        val rootName = runCatching {
            resolver.query(DocumentsContract.buildDocumentUriUsingTree(tree, rootId),
                arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) it.getString(0) else null
            }
        }.getOrNull() ?: ""
        val stack = ArrayDeque<Pair<String, String>>().apply { add(rootId to rootName) }
        while (stack.isNotEmpty()) {
            val (parentId, parentName) = stack.removeLast()
            val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId)
            runCatching {
                resolver.query(
                    childrenUri,
                    arrayOf(
                        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                        DocumentsContract.Document.COLUMN_MIME_TYPE
                    ), null, null, null
                )?.use { c ->
                    while (c.moveToNext()) {
                        val docId = c.getString(0); val name = c.getString(1) ?: ""; val mime = c.getString(2) ?: ""
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) stack.add(docId to name)
                        else out.add(Found(DocumentsContract.buildDocumentUriUsingTree(tree, docId), name, parentName))
                    }
                }
            }.onFailure { Log.w(TAG, "walk failed under $parentName: ${it.message}") }
        }
    }
}
