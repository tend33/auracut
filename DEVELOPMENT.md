# Auracut V1

A self-hosted music and speech video editor. Upload a song and clips, create a suggested cut, adjust the timeline, preview the full cut with the song, and export an MP4. Standard mode finds audio onsets and loosely matches filename words against lyrics. Optional AI mode analyzes sampled video frames to choose clips. It does **not** transcribe lyrics, synchronize lyrics to the song, or generate missing footage.

Timed story notes can guide both modes. Enter one scene per line, beginning at `0:00`, for example `0:00 Night traffic`, `0:11 Forest walk`, `0:20 Beach and waves` for a 30-second cut. Fractional seconds also work, such as `0:21.10 Beach`. Times must increase and leave at least half a second per scene. **Align scene changes to nearby audio peaks** is enabled for new cuts: it moves each scene marker to the closest detected audio peak within 1.5 seconds, where section lengths remain valid. Planned story times show both the resulting time and the requested time when they differ. Uncheck this option to keep exact story times. Other cuts still follow audio onset/target length where possible. Auracut suppresses sustained harmonic energy and analyzes percussive spectral changes at 10 ms resolution, then estimates a tempo-consistent beat grid when the rhythm is clear. Otherwise it uses audio peaks or a regular fallback. Beat estimates do not identify bar starts or downbeats. Silence or unclear rhythm uses a regular fallback, which is labeled and does not enable peak snapping. Old saved projects retain their timing points, whose detection/fallback status is unknown; create a new cut for labeled suggestions.

Untimed freeform lyrics remain approximate guidance. For new AI cuts, edit the notes/alignment setting and select **Update AI suggestions** to rebuild the timeline from saved clip descriptions. This makes one paid text-only AI selection call, without analyzing frames again or uploading files. It replaces current shot trims/reordering and the saved timeline, so export any preferred cut before rebuilding. Earlier projects without saved clip descriptions and clip IDs require a new AI first cut for this control.

Each shot shows its absolute timeline start/end separately from its source start. Choose a timing point in its end dropdown and click **Snap end** to try a detected peak within 1.5 seconds. The nearest valid point is selected first; you can choose an earlier or later point by ear. **Keep total length when changing a shot length** is checked by default: it compensates in the immediately following shot and keeps all subsequent boundaries fixed. If two shots use contiguous footage from the same source, the following source start moves with the boundary to keep playback continuous. Otherwise its source start stays unchanged and its length changes. An edit that exceeds footage or makes the following shot shorter than 0.2 seconds is rejected without changing either shot. The final shot cannot change with this option enabled. Turn the option off for ordinary edits that shift later shots and change the total duration. **Undo timing edit** restores the latest timing edit; reorder/remove/create/rebuild clears that undo. Manual trims may move transitions away from the planned story times. Snapping and trimming work locally and make no AI calls.

## Saved projects and alternate cuts

The **Saved projects** list opens existing timelines without reuploading media. It shows project names, durations, shot counts, and AI/standard mode, with the most recently saved first. Older projects appear under their song names until renamed; loading/listing them does not modify their files. Enter a **Project name** before creating a first cut, or rename an open project and click **Save timeline**. Names support up to 120 characters. Select **New** to prepare a fresh project with new uploads.

**Duplicate project** saves the current timeline, including unsaved shot edits and its name, as a separate project ending in “copy.” It opens the copy immediately; rename and save it to distinguish versions. The original saved timeline remains unchanged. Copies share uploaded media and cached AI descriptions, so duplication does not upload files, render a video, or call AI. Future edits and AI story rebuilds affect the open project only. Story notes in the input are applied when rebuilding AI suggestions; duplication copies the current saved story guidance with the edited timeline. Save or duplicate unsaved timeline/name changes before opening another project or selecting New. The saved list is available only after the same authentication as the editor; mutations keep the existing cross-site request protections and work lock.

## Synology NAS setup

1. Extract this project into a private NAS folder, for example `/volume1/docker/auracut`. In that folder, run `bash nas-run.sh` over SSH. It prompts for an Auracut password of at least 16 characters; it never asks you to put the password in a Docker command. You need Container Manager/Docker installed.
2. In DSM **Control Panel → Login Portal → Advanced → Reverse Proxy**, create a new rule: **source HTTPS** with your chosen hostname and port, **destination HTTP** `127.0.0.1:8000`. Use a trusted certificate for that hostname. If you access it as `YOUR_NAS_IP`, the certificate must cover that IP, or browsers will show a certificate warning. Use a LAN hostname with a trusted certificate where possible.
3. Open your HTTPS address. Your browser will prompt for username `auracut` and the password you created. Keep this service and the HTTPS reverse proxy restricted to your LAN or VPN; do not forward its ports from your router.

The container's port is bound to `127.0.0.1` **on the NAS**, so `http://YOUR_NAS_IP:8000` will intentionally not work. Access it through the HTTPS reverse proxy. To update the image later, run `sudo docker stop auracut && sudo docker rm auracut`, then `bash nas-run.sh` in the updated project folder. If a prior `docker run` failed after creating a stopped container, inspect it with `sudo docker ps -a --filter name=auracut` and remove that stopped container with `sudo docker rm auracut` before retrying. Uploaded files and projects stay in `data/`.

If your DSM reverse proxy cannot reach a container published on `127.0.0.1`, use a LAN-restricted Docker port plus NAS firewall rules as a fallback and keep the HTTPS proxy in front. Check the listener from the NAS first: `curl -i http://127.0.0.1:8000/` should receive an authentication response. Some DSM configurations route reverse-proxy destinations differently; test before changing the bind address.

## Local development

Requires Python 3.10+ and FFmpeg with `ffprobe`. Install NumPy 2.3.5 (`python3 -m pip install numpy==2.3.5`) for beat analysis. From this directory run `python3 server.py`, then open <http://127.0.0.1:8000>. The app allows passwordless access only when bound to loopback; any non-loopback binding requires a password file specified with `AURACUT_PASSWORD_FILE`.

Upload an MP3/WAV/M4A song and one or more MP4/MOV/WebM clips. Click **Create first cut**, preview and adjust the shots, then **Export MP4**. Bookmark the URL with its project ID to reopen it on the same machine. Click a shot card (or its ▶ button) to preview its muted source footage; export an MP4 to review the music and cuts together.
Click **Play full cut** to play the song with the current shot sequence in your browser. Pause or drag the seek slider to inspect another time. Browser preview may lag briefly when changing clips, and some source codecs (especially MOV) may not play in every browser. The exported MP4 is the final timing reference. Changing a trim or moving a shot stops playback so the next preview uses the revised sequence.
When Auracut uses the same source clip in several shots, it advances through that clip and loops to its start only when it runs out of footage for a full shot. Previously saved timelines keep their existing trim positions; create a new first cut to use this behavior.

## Optional AI clip selection

Standard cutting remains the default and requires no API key. To enable the opt-in **Use AI to select clips** checkbox, create an OpenAI API key in your own account, then save it on the NAS as `ai-key.txt` inside the installed `auracut-2` folder. Never paste your key into chat, your browser, or the project ZIP. In an SSH session within that folder, the following command prompts without displaying the key or placing it in your shell history:

```bash
umask 077
read -r -s -p 'OpenAI API key: ' auracut_ai_key; printf '\n'
printf '%s' "$auracut_ai_key" > ai-key.txt
unset auracut_ai_key
chmod 600 ai-key.txt
```

Restart the container as described above. `nas-run.sh` mounts the key read-only; the browser can only see whether AI is available, never the key. When you check the AI box and create a cut, Auracut sends **two compressed still frames per clip** and your entered lyrics/story notes to the OpenAI Responses API using `store: false`. Full videos and the song are not sent. Up to eight clips can be analyzed per project. Analysis is a paid API feature; cost depends on your model usage. Current model: `gpt-4.1-mini`. If AI fails, the app reports an error and lets you retry in standard mode. AI descriptions are stored in project JSON on your NAS. Untimed lines of lyrics are spread across shots approximately because Auracut does not know when each line is sung. Uncheck the AI box or remove `ai-key.txt` and restart to turn off the feature.

## Security and limits

- Every page, API, upload, video, and export requires authentication when network access is enabled. Repeated incorrect credentials are temporarily blocked. **Basic authentication requires HTTPS**: never enter your Auracut password over plain HTTP on a network.
- The NAS container runs as your unprivileged SSH user, with a read-only root filesystem, dropped Linux capabilities, no privilege escalation, and a requested 2 GB memory cap. The web server accepts at most eight simultaneous request handlers, and FFmpeg uses two encoding threads. Docker's CPU CFS and PID limits are omitted because this NAS kernel rejected or ignored those options; other video processing stages can still use CPU, so monitor DSM Resource Monitor during exports. It mounts only its project data and a read-only password file; it does not mount the Docker socket.
- With AI configured, a second read-only key file is mounted as a container secret; only the explicit AI checkbox triggers external API requests. API provider retention and abuse monitoring policies still apply even with `store: false`.
- Uploads accept only a short list of media extensions, are probed before use, have a 1 GB per-file limit, and collectively have a 10 GB storage ceiling with 1 GB of disk space reserved. Only one audio analysis or video export runs at a time. Projects are limited to 120 seconds and 100 shots.
- The API rejects cross-site write requests, restricts accepted content types, validates trim ranges, uses generated IDs rather than uploaded filenames for storage paths, avoids a shell when calling FFmpeg, and serves pages with restrictive browser security headers.

This is a **single-user prototype**, not a hardened public service. It lacks account management, automatic storage cleanup, job recovery after restarts, and a security audit of FFmpeg against hostile media. Use only footage you trust and keep the NAS and container image updated. Files remain in `data/` until you remove them.

## Layout

- `server.py`: HTTP API, onset detection, timeline validation, and FFmpeg export.
- `static/`: browser editor.
- `data/`: uploads, project JSON, and exports (excluded from the archive and Git).
- `nas-run.sh`: restricted NAS container launch.

Project JSON records media references, trim values, shot lengths, and reasons for each suggested edit. Moving or trimming shots updates this recipe; export performs the actual video processing.

## Project backup and restore

Open a project and choose **Download backup ZIP**. Auracut saves current timeline edits first, then packages the timeline, story notes, cached AI descriptions, song, and every source clip used by the project. MP4 exports, passwords, and API keys are excluded. Keep the ZIP somewhere separate from the NAS; it is not encrypted.

Choose **Restore project ZIP…** under Saved projects. Restoring adds a separate project and new media copies, preserving existing projects. No AI request is made. Only Auracut ZIPs up to 1 GB are supported, with the existing 10 GB media/export storage ceiling and 1 GB free-space reserve. Larger projects need a NAS backup of the `data/` folder. Restore re-probes all media, so it can take time. Your DSM reverse proxy may also limit upload size or timeout; if it rejects a backup upload, configure its limit for that file size.

The ZIP reader accepts only the manifest and listed media, rejects extra/duplicate entries and oversized expanded contents, and writes generated filenames rather than extracting archive paths. Interrupted or rejected restores clean up newly staged media.

## Beat suggestions

New first cuts analyze only the chosen song segment (up to 120 seconds). A local standard-library tracker uses 20 ms energy onsets, estimates a global tempo from correlation, and follows a sequence of tempo-consistent onsets. A strength and regularity check selects an estimated beat grid; uncertain music falls back to audio peaks or regular timing. This is a lightweight tracker for steady rhythms, not a downbeat or bar detector. Half/double-tempo ambiguity and complex or changing rhythms still need listening and manual edits.

The timing note shows the estimated BPM when a beat grid is available. **Analyze beats** refreshes timing suggestions on an existing project, saves current edits, and keeps shot boundaries in place. It does not rebuild the AI selection or spend API credits. Use **Snap end** to move a boundary manually; new cuts and explicitly rebuilt story suggestions use the timing points automatically. The existing alignment checkbox still controls whether timed story notes can move. Backup and restore preserve beat-grid metadata.

The tempo-and-onset approach is described in the official [librosa beat tracker documentation](https://librosa.org/doc/main/api/generated/librosa.beat.beat_track.html); Auracut uses its own lightweight energy-based implementation and does not install librosa.

## Searchable footage

Expand **Search footage** below the preview. Existing uploaded videos appear automatically. Additional footage can be uploaded in batches of up to 20 files, within the existing 1 GB/file and 10 GB media/export limits. To create a first cut without re-uploading saved videos, choose a song in the sidebar, select library clips, leave the sidebar footage input empty, and use Create first cut. AI first-cut selection still supports at most eight clips.

Select 1–4 clips and choose **Index selected (AI)**. Each unindexed clip sends two small frames from each of up to 12 evenly spaced sections to OpenAI in one paid request. Full video and audio stay on the NAS. Descriptions are cached; indexing the same unchanged clip again reuses the cache. Failed batches retain completed indexes. Indexing is opt-in and blocks other heavy operations until finished.

Search is local keyword matching over filenames and section descriptions. All entered keywords must match; use short terms from the descriptions. It is not semantic embedding search, speech transcription, or exhaustive scene detection. Sections divide the whole clip into up to 12 portions, so long clips have coarse timestamps and brief moments can be missed. Empty search shows at most 100 results; narrow by filename or descriptive keywords.

Use **Preview section** to inspect muted source footage. Select a timeline shot, then **Replace selected shot** on a result to change its source while preserving its duration; the section must be long enough. **Add to end** adds up to 3.5 seconds when the song and 120-second timeline limit leave room. Both actions save current timeline edits and the resulting change, so duplicate a project first when experimenting. Indexed descriptions for all project source clips are included in project backup ZIPs and restored with new media IDs. Automatic section selection is available through the separate section-cut action below.

## Automatic cuts from indexed sections

In Search footage, select **1–20 indexed clips**, enter story notes and a target length in the sidebar, then choose **Create cut from indexed sections (AI)**. Choose a song file or reuse the open project's saved song. Clips must be indexed first; this action does not silently send frames or index additional footage. It sends the cached descriptions and notes in one paid text-only AI request and creates a new saved project. Existing projects are preserved.

Timing still follows the detected rhythm and the story-alignment checkbox. AI chooses a section for each planned shot from a duration-compatible list; source playback starts within that section and progresses when the section is reused, looping inside it when needed. Server validation rejects unknown section indexes, short sections and invalid shot counts before saving. The shot reason names the selected source section and description. These are sampled descriptions, so inspect the footage to judge the actual action and framing.

Section cuts support Update AI suggestions with timed story notes, retaining section selection when rebuilding. Manual trims, replacements, duplication, beat analysis, MP4 export, and backup/restore continue to work; backups include source indexes for future revisions. New music-led cuts remain limited to 120 seconds and 100 shots. This is a suggested edit from descriptions, not full-video understanding or speech editing.

## Export timing accuracy

MP4 exports allocate frames from cumulative shot boundaries at 30 fps. Each transition is rounded to the nearest frame (within about 17 ms), avoiding accumulated per-shot rounding drift. A short source-end frame hold handles frame rounding at the end of footage. Snap end reports when the selected suggestion already equals the current endpoint; choose another dropdown time to move it. Beat suggestions remain estimates, not confirmed downbeats.

## Dynamic pacing

Enable **Dynamic pacing** before creating a first cut or **Create cut from indexed sections (AI)**. It analyzes the song locally, uses relative sustained energy for longer shots in calmer passages and shorter shots in energetic passages, and ranks nearby rhythm suggestions by accent strength and proximity. It adds no paid requests beyond the selected AI cutting mode. This is an energy/accent heuristic, not a downbeat or musical phrase detector. It does not add sound effects or align actions within source footage.

Timed story boundaries are retained, after optional scene alignment. Target shot lengths vary approximately from 1.5 to 4.5 seconds; short footage sections and story boundaries may limit this variation. If no reliable rhythm is found, pacing falls back to regular lengths rather than inventing beats. The target duration remains unchanged and frame allocation remains cumulative.

The checkbox is off by default and applies only when creating or rebuilding a cut. It is restored on open/duplicate/backup restore. On an existing AI project, use timed story notes and **Update AI suggestions** to rebuild with this setting; this replaces trims and makes one paid text-only AI selection request. Duplicate a preferred cut before rebuilding. **Analyze beats** refreshes suggestions without changing shot durations.

Dynamic pacing now gives substantially stronger nearby accents more weight than proximity to the target shot length, searching up to 1.1 seconds around it. Similar-strength accents still favour the closer time. This can change later shot boundaries when a cut moves; story markers and the overall target duration remain fixed. Existing saved cuts are not retimed until rebuilt. Musical correctness still requires listening.

## Percussion-sensitive rhythm analysis

New cuts and AI story rebuilds now use harmonic/percussive spectrogram masking and spectral flux rather than broadband energy changes. The editor labels refreshed results **percussion-based beat grid**, or percussion onsets when a steady grid cannot be established. These are estimates, not identified bar starts or downbeats, and a strong percussive sound is not necessarily the best musical edit point. **Analyze beats** refreshes saved suggestions without moving shots; a new cut or AI rebuild applies the new timing to automatic placement. Existing projects and exports are retained.

Analysis runs locally using NumPy 2.3.5, installed inside the Docker image. Update the **Dockerfile** along with server.py and static files, then rebuild using nas-run.sh. The NAS host Python does not need changes. No song or percussion stems are uploaded for this analysis. At most 120 seconds are analyzed; temporary median operations run in chunks.

Algorithm references: [harmonic/percussive median masking](https://librosa.org/doc/0.11.0/generated/librosa.decompose.hpss.html) and [spectral flux with frequency maximum filtering](https://librosa.org/doc/0.11.0/generated/librosa.onset.onset_strength.html). This implementation uses NumPy with the existing tracker, not the librosa package.

## Prefer musical changes

Enable **Prefer musical changes** before creating a new cut or rebuilding AI suggestions. It computes a chunked pitch-class (chroma) representation locally and compares tonal distributions over short and broader windows. Estimated changes are paired with a beat/onset suggestion within 240 ms when available. Eligible tonal changes are ranked together with nearby percussion emphasis, cue strength, structural novelty, and proximity, within footage and story limits. A strong ordinary accent can outrank a weak tonal cue; otherwise the planner uses its rhythm/length fallback. The planner discourages endings shorter than 1.5 seconds when source lengths and story markers allow it. These are estimates, not confirmed bar or phrase boundaries. Dynamic pacing can be enabled alongside it; with both enabled, calmer passages may hold up to about 5.5 seconds, bounded by the selected footage, rather than forcing every ordinary beat into a cut.

This is estimated tonal/structural novelty, not chord-name recognition, a confirmed phrase detector, or a downbeat detector. Melody changes can also produce cues. Timing labels show the cue count; Snap end dropdowns mark **tonal cue** points. Saved cuts are not retimed by toggling the checkbox or Analyze beats. Create a new indexed cut for comparison, or duplicate before rebuilding AI suggestions. Opening, saving, duplication and ZIP backup/restore retain the setting and cue metadata. No additional AI request is made for music analysis; existing AI selection uses the newly planned positions.

Harmonic feature reference: [chroma representation](https://librosa.org/doc/0.10.2/generated/librosa.feature.chroma_stft.html). Auracut uses its own NumPy implementation and compares pitch-class distributions; it does not load librosa or a chord model.

## AI editing studio (SeeCut-inspired V1)

Open **AI editing studio** beneath Search footage. This adds four reviewable workflows alongside the existing musical montage editor; it does not copy or depend on SeeCut code.

1. **Transcript Editor + Smart Cuts.** Select one saved speech video in Search footage (indexing is unnecessary), or choose one footage file on the left, then click **Transcribe selected footage**. No song is required. The first 120 seconds of its source audio are sent to OpenAI `whisper-1` for word timestamps; results are cached by source size/mtime. Uncheck words to remove them. **Suggest smart cuts (AI)** uses a paid text-only request to propose filler, repeated phrase and false-start removals; check the suggested words before applying. Pause shortening uses timestamp gaps over 0.45 seconds. **Apply reviewed transcript edit** creates a separate project from the original source and retains its audio. Keep enough word context for each retained span to be at least 0.2 seconds. Speech projects currently use one source clip and up to 100 spans, with a 120-second limit. Zero-duration ASR tokens are preserved for review; words crossing the 120-second boundary are clipped, and wholly out-of-window tokens are excluded. The response is cached before local timing validation so retries can reuse it. Timestamp accuracy and proposed removals require listening and review.
2. **Automatic Captions.** After transcript edits, click **Generate captions**. Timestamped words are mapped through source trims into the edited timeline and grouped into short readable captions. Edit caption text, save, and use **Download SRT** or burned-in captions in MP4. Export uses bottom placement, outline, sensible line breaks and Noto CJK fonts. Manual timeline trim/reorder changes clear old captions; generate them again to avoid stale timing. Speech preview uses **Render preview with audio and captions**; the music-only browser playback controls are disabled for speech edits. Speech export retains source audio; it does not mix in additional music in this version.
3. **AI Editing Plan.** New AI music cuts are proposed saved drafts. **Review AI editing plan** sends the proposed timeline/reasons and brief for a structured summary, story order, coverage/repetition warnings, and shot rows with source names/durations. Inspect source shots, revise the brief and create another draft if needed, or edit trims and review again. **Accept plan** is required before exporting a new AI draft; stale plans cannot be accepted. This review makes one additional paid text-only request. Existing saved music projects are not converted to drafts.
4. **AI Director Review.** Render a preview and review up to 12 sampled rendered frames, the timeline/captions, and local mean/peak audio measurements with one paid image/text request. The UI shows issues and proposed source-trim changes. **Apply Director changes to a copy** validates all trims and creates a separate project, regenerating captions where transcripts exist. Stale reports are rejected. The original project remains available. This is sampled visual review, not continuous video/audio understanding: it cannot confirm beat feel, speech intelligibility, music/dialogue balance, every brief visual glitch, or all transitions. User listening remains necessary. Coverage replacements and multi-pass autonomous edits are not applied automatically.

The existing API key secret is reused; no new credential file is needed. Transcription is the only new operation that uploads audio (mono 16 kHz WAV, at most 120 seconds). AI requests use fixed HTTPS endpoints; transcript smart cuts/plan requests send text; Director requests send sampled low-resolution images plus measurements. Do not transcribe confidential footage unless that external processing is appropriate. Rendered previews, source transcripts, captions and proposals are stored with project data on the NAS. Backup/restore supports single-source speech projects and remaps transcript media IDs. Review reports should be regenerated after backup restoration; a restored pending draft still needs plan acceptance. Existing localhost-only publishing, Basic authentication, request checks, process locks and container restrictions remain in place.

Update **server.py**, **studio.py**, **accounts.py**, **Dockerfile** and **static/** in `/volume1/docker/auracut`, then rebuild/restart with `nas-run.sh`. Copying only server.py will not work because the new studio module is required.

Local verification: `python tests/test_studio.py` from the extracted project folder (requires FFmpeg). Tests use synthetic media and mocked AI/transcription responses, not paid API calls. They cover multipart transcription/cache reuse, approved speech copies, caption timing, real source-audio/subtitle rendering, ZIP restoration, plan acceptance and stale Director protection. Actual recognition/suggestion quality and DSM/browser layout need testing on your NAS with recorded speech.

Export resolution: choose 720p (default), 1080p or 4K UHD (3840×2160) next to Export MP4. Output keeps 30 fps, aspect ratio and letterboxing. Libass scales captions to the output canvas. Previews and Director Review render at 720p. Lower-resolution sources are upscaled, not enhanced. 4K uses two encoder/filter threads and allows up to two hours per render; actual NAS runtime needs validation.

Speech projects offer optional Normalize speech volume (off by default). Save the setting before preview/export; preview and Director Review use it too. FFmpeg loudnorm processes the assembled source audio with a -16 LUFS target, -1.5 dBTP peak target and loudness range target 11, then outputs 48 kHz audio. This single-pass setting can boost background noise and does not repair transcription errors. Music projects keep their existing soundtrack processing. Backups retain the setting; changing it invalidates prior plan/Director approval fingerprints.

Caption languages: after generating/correcting captions, choose Original, Simplified Chinese, Traditional Chinese or English, then Apply caption language. AI conversion sends text only in batches of up to 20 captions, retains timings, and stores original captions for free restoration. Original-language manual corrections become the source for later conversions. Generate captions replaces corrections/conversions; changing shot trims clears captions and requires regeneration. See V1_RELEASE.md for supported workflows, validation and limits.

## V1 multiuser (1.1.0)

Sign in with the existing auracut administrator account and open Manage user accounts in the sidebar. Create invited accounts with lowercase usernames and passwords of at least 16 characters. Paid AI starts disabled for new accounts; enabling it allows that user to consume the shared NAS API key. Administrators can reset passwords, disable/enable accounts and switch AI access on/off. Users cannot create accounts or view account administration.

Each user has an isolated media/project/export/job workspace. Existing projects remain with auracut without moving files. New account data is under data/users/<internal-account-id>; salted scrypt hashes and account settings are in data/accounts.json with restrictive permissions. Project ZIPs contain only that user's selected project and media, not the account database. Preserve the whole NAS data directory for account-level disaster recovery.

Use the same private HTTPS URL over LAN/WireGuard. The browser's Basic-auth prompt accepts each new username/password. Use a separate browser profile, private window or another device to test another account because browsers cache Basic-auth credentials. There is no custom login/logout page in V1. Account disable/password reset is enforced on subsequent authenticated requests; an already-running authorized render may finish.

The admin account retains the existing mounted password file. No sharing/collaboration between workspaces, public registration, password recovery email, or per-user AI billing budget is included. Storage checks apply per workspace (existing 10 GB media/export allowance) plus global free-space checks. The global analysis/render lock still permits one heavy operation at a time across all users to protect the NAS.

Additional regression: python tests/test_accounts.py checks account lifecycle, password hashes and permissions, role enforcement, paid-AI grants, private uploads/projects/media/jobs/exports/backups and background worker identity. Existing editor regression checks still pass.
