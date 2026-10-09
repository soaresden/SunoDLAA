# Suno web API — what SUNODLAA knows (Oct 2026)

Observed from suno.com's own traffic (spy logs) and its JS bundles. Unofficial: it can change any time.

## Base & auth
- Base: `https://studio-api-prod.suno.com` (also `https://studio-api.prod.suno.com`).
- Auth: `Authorization: Bearer <JWT>`. In the page: `window.Clerk.session.getToken()` or the `__session` cookie.
  Outside the page (Android): Clerk `__client` cookie → `https://auth.suno.com/v1/client?__clerk_api_version=…&_clerk_js_version=…` → session id
  → `POST /v1/client/sessions/<sid>/tokens` → JWT (~60 s).
- Extra headers the site sends: `browser-token: base64({"timestamp":<ms>})`, `device-id: <ajs_anonymous_id>`.
- Public (no auth needed): `POST /api/unified/homepage/explore`, `GET /api/playlist/<id>/?page=N`.

## Library (read)
| Call | Notes |
|---|---|
| `GET /api/project/me?page=N&sort=max_created_at_last_updated_clip&show_trashed=false&exclude_shared=false` | Workspaces: `projects[]` {id, name, description, clip_count, last_updated_clip}, `num_total_results`. `id = "default"` = "My Workspace". |
| `GET /api/project/<id>?page=N` | `project_clips[].clip` (20 per page). |
| `GET /api/project/<id>/pinned-clips` | `pinned_clips[]` |
| `POST /api/feed/v3` | body `{"cursor":null,"limit":20,"filters":{...}}` — e.g. `{"playlist":{"presence":"True","playlistId":"<id>"}}` or `{"user":{"presence":"True","userId":"<uid>"},"trashed":"False","disliked":"False",...}`; pagination with `cursor` = last clip id. |
| `GET /api/gen/<id>/aligned_lyrics/v2/` | `aligned_words[]` {word, start_s, end_s} and/or `aligned_lyrics[]`. |
| `GET /api/playlist/me?page=N`, `GET /api/playlist/<id>/?page=N` | Playlists; `playlist_clips[].clip`. |
| `GET /api/billing/info/` | Plan, credits, download counters. |

Clip fields used: `id, title, status ("complete"), created_at, is_liked, is_trashed, image_url, image_large_url,
display_name, handle, play_count, metadata {tags, prompt, duration, cover_clip_id, task}, audio_url, media_urls[]`.
- `audio_url` = `https://studio-api.prod.suno.com/api/forbidden` when the account may not get the file.
- `media_urls[]` with an `encoding` field = encrypted stream for Suno's own player → never used.
- Originals: a clip is an "original" if another clip of the workspace has `metadata.cover_clip_id` = its id.

## Library (write) — the `WRITES` whitelist
| Call | Body | Answer |
|---|---|---|
| `POST /api/gen/<id>/set_metadata/` | `{"title": "…"}` | 200, clip summary |
| `POST /api/gen/<id>/update_reaction_type/` | `{"reaction": "LIKE"}` or `{"reaction": null}` | |
| `POST /api/gen/trash` | `{"clip_ids": [...], "trash": true}` (false = restore) | |
| `POST /api/project` | `{"name": "…", "description": ""}` | 200, new project |
| `POST /api/project/<id>/metadata` | `{"name": "…", "description": "…"}` (the site sets description = name) | 204 |
| `POST /api/project/<src>/clips` | `{"update_type": "move", "metadata": {"clip_ids": [...], "target_project_id": "<dst>"}}` | 204 |
| `POST /api/project/trash` | `{"project_id": "<id>", "undo_trash": false}` | 204 |
| `POST /api/lyrics-projects` | `{"title": "…"}` | 200 {id, title, lyrics, created_at} |
| `POST /api/lyrics-projects/<id>/flush` | `{"lyrics": "…"}` | 200 {updated_at} |

`GET /api/lyrics-projects?limit=50&sort=updated_at` → `projects[]` (Suno's "Saved lyrics").

## Explore
- `POST /api/unified/homepage/explore` body `{}` then `{"cursor": <next_cursor>}` → `feeds[]`
  {feed_title, feed_container_type ("playlist"), feed_container_id, item_count, items[] {content_type "clip", content_item}}, `next_cursor`.
- `POST /api/unified/feed` body `{"feed_id":"for_you","cursor":null,"page_size":20}` → personal feed.

## Seen but not used
- Audio upload: `POST /api/uploads/audio/` {extension, upload_type} → S3 form; then `POST /api/uploads/audio/<id>/upload-finish/` {upload_type, upload_filename}.
- `GET /api/challenge/progress` (polled every 10 s), `/api/video_gen/pending_batches`, `/api/clips/parent?clip_id=`, `/api/session/`, `/api/modals`.
- Downloads (capped per month, do not automate): `GET /api/download/clip/<id>?format=mp3` → {ok, status processing|ready|error, download_url}.
- Creation endpoint: not captured yet (the Create screen drives the site's own form instead).
