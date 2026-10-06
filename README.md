# Auracut

A self-hosted music and speech video editor for private LAN/VPN deployment. Create a suggested music cut, edit speech through a transcript, review captions and AI suggestions, and export MP4. Runs in Docker on a NAS or Linux machine.

## Interface

Use the header selectors to switch **Clean / Classic** and **English / 简体中文 / 繁體中文**. Clean groups editing tools into Edit, Media library, and Speech & captions tabs. Classic retains the original layout and controls. Switching does not reload the editor or change project data. Language and layout preferences are stored in this browser separately for each signed-in account; they do not sync between devices. Interface language is independent of caption language. No AI request is made for interface translation. User-written content and AI-generated descriptions/reports remain in their original language; unrecognized server/service errors may remain in English.

## V1 features

- Standard or optional AI-assisted music cuts, beat/musical-change analysis and editable shot boundaries.
- Footage upload, sampled visual indexing, search and replacement of shots while keeping timing.
- Speech transcription and conservative Smart Cuts with reviewed word selections and shorter pauses.
- Editable captions, SRT download, burned-in captions, Simplified/Traditional Chinese conversion and English translation with unchanged cue timing.
- AI editing-plan approval and Director Review of sampled rendered frames, captions and measured audio levels.
- Optional speech volume normalization; 720p, 1080p and 4K UHD exports at 30 fps.
- Saved projects, duplication, ZIP backup/restore and administrator-created accounts with private workspaces and individual AI permissions.

## Docker / Synology setup

Requires Docker and enough local storage for source media and exports.

```bash
bash nas-run.sh
```

The script prompts for the administrator password (at least 16 characters), builds the image and starts the container. The administrator username is `auracut`.

The app is bound to `127.0.0.1:8000` on the host. Put a trusted HTTPS reverse proxy in front of it and access it within your LAN or VPN. In Synology DSM, create a reverse-proxy rule with your own HTTPS hostname/port and destination HTTP `127.0.0.1:8000`. Configure your own DNS and certificate trust on client devices. V1 is not intended for direct public internet exposure.

Optional AI: create a private `ai-key.txt` beside `nas-run.sh` with your OpenAI API key, then restart/rebuild. The script mounts it as a read-only secret. Never commit this file. AI requires a separately billed API account; ordinary editing and standard music cuts do not require AI.

Persistent files are in `data/`. Keep that directory and the separate secrets when updating. To replace an existing container:

```bash
sudo docker stop auracut
sudo docker rm auracut
bash nas-run.sh
```

## Accounts

Sign in as `auracut` and open **Manage user accounts** to create invited accounts, reset passwords, disable/enable access or allow paid AI. New users have empty private workspaces; existing projects stay with the administrator. AI permissions use the shared host API key and are off by default for new accounts.

Sign in as another user using a separate browser profile/private window because browsers cache Basic-auth credentials. Heavy analysis/rendering is serialized across users. No public signup or collaborative shared projects are included.

## Editing

**Music:** upload a song and footage → Create first cut, or index footage and create a cut from indexed sections → review/accept the AI plan when prompted → preview and adjust → save → choose export resolution → Export MP4.

**Speech:** select one saved speech clip → Transcribe selected footage → Suggest smart cuts → review the kept words → Apply reviewed transcript edit → Generate captions → correct text and Save timeline → optionally convert caption language/normalize volume → render preview → export.

Generate captions replaces manual corrections. Changing trims or shot order clears captions on save; regenerate them for the new timing. Original restores the saved source captions after translation. Review translated text before delivery.

## Privacy, security and limits

AI actions disclose what is sent: speech audio for transcription, selected text for plans/caption conversion, and sampled frames for indexing/review. Full videos stay local. Paid requests are explicit and cached results are reused where supported.

Each timeline is limited to 120 seconds and 100 shots. Transcription uses the first 120 seconds of one clip. Beat detection is an estimate. Director Review samples up to 12 frames and does not listen to continuous audio/video. The editing plan summarizes a current draft rather than autonomously rebuilding it. 4K upscales smaller footage without restoring detail.

See [SECURITY.md](SECURITY.md), [V1_RELEASE.md](V1_RELEASE.md) and [DEVELOPMENT.md](DEVELOPMENT.md) for deployment boundaries and implementation details. Media decoders remain a dependency that must be kept patched. Project ZIPs are not encrypted and do not back up the account database; preserve the full data directory for disaster recovery.

## Local development and tests

Use Python 3.10+ (Docker uses 3.12), NumPy 2.3.5, FFmpeg/ffprobe and a Chinese font such as Noto Sans CJK for caption rendering.

```bash
python3 -m pip install numpy==2.3.5
python3 server.py
```

Passwordless development is permitted only on loopback. Set `AURACUT_PASSWORD_FILE` to a private password file before binding beyond localhost. Local tests use synthetic media, temporary data and mocked AI responses; no paid API calls are made.

```bash
python3 tests/test_studio.py
python3 tests/test_http.py
python3 tests/test_accounts.py
python3 tests/test_security.py
node tests/test_transcript_ui.js
```

## License

MIT. External tools, fonts and dependencies retain their own licenses.

Optional interface regression checks (development only): install `jsdom` in your test environment and run `node tests/test_interface.js`. No Node dependency is needed on the NAS.
