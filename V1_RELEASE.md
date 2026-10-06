# Auracut V1 multiuser — 1.2.0

Self-hosted editor with administrator-created private accounts for music cuts and short speech videos. Designed for the existing NAS, private reverse proxy and WireGuard deployment.

## Interface update

Clean workspace with focused editing tabs and bundled English, Simplified Chinese and Traditional Chinese labels/help. Classic remains selectable using the same editor controls. Layout/language switching preserves in-progress edits, input values, reviewed word selections and media elements. Browser preferences are isolated by account. Caption translation and AI-generated content remain separate from interface translation.

## Included workflows

- Music cuts: upload a song and footage, use standard or optional AI first cuts, analyze rhythm/musical changes, adjust or snap shot boundaries, preview and export.
- Footage: upload, index sampled sections with AI, search descriptions, preview sections, replace footage while retaining shot duration, or build a cut from indexed sections.
- Speech: transcribe one clip, review the timestamped transcript, suggest conservative Smart Cuts, change kept words, shorten pauses, and create an edited copy. Reviewed word selections persist through plan review and saving.
- Captions: generate from the edited speech timeline, correct text, save, download SRT, and burn captions into rendered previews/exports.
- Caption languages: convert to Simplified Chinese, Traditional Chinese or English with unchanged cue timing. Original restores saved source captions without AI. Correct source captions before conversion. Generate captions replaces existing corrections/conversions.
- AI plan: review a structured summary of the current proposed timeline and accept it before exporting new AI drafts. Review alone does not rebuild or reorder the edit.
- Director Review: render the current edit, inspect up to 12 sampled frames plus caption text and measured audio levels, then review conservative trim suggestions. Approved changes create a copy.
- Speech volume: optional single-pass loudness normalization for rendered speech previews and exports, off by default. It can raise background noise.
- Export: 720p, 1080p or 4K UHD, 30 fps, H.264/AAC MP4. Source aspect ratio is preserved with padding. Rendered previews stay at 720p; lower-resolution footage is upscaled for larger exports.
- Projects: save/open/rename/duplicate and download/restore project ZIPs containing media, timelines, transcripts, captions and settings.

## Short user guide

Music: upload song and clips → Create first cut (or index footage and Create cut from indexed sections) → review AI plan/accept when prompted → preview and adjust → Save timeline → choose resolution → Export MP4.

Speech: select one saved footage clip → Transcribe selected footage → Suggest smart cuts → review kept words → Apply reviewed transcript edit → Generate captions → correct text → Save timeline → optionally Apply caption language and Normalize speech volume → render preview → export.

A caption correction requires Save timeline. Generating captions again overwrites corrections. Changing shot trims/order clears captions on save; regenerate them for the new timeline. Applying transcript edits always creates a copy from the original source clip. Reopened source previews play original footage; use Render preview with audio and captions to check the assembled speech cut and normalized audio.

Language conversion sends caption text only, in batches of up to 20 cues. Each batch makes a paid AI request. All batches must validate before any translated captions are saved. Original restoration makes no AI request. Original-language corrections saved before translation become the preserved source. Corrections made in a translated version remain in that version but do not change the preserved original.

## V1 boundaries

- Administrator-created local accounts with private workspaces. Account creation, password resets, disable/enable and paid-AI grants are available to the administrator. Shared projects and real-time collaboration are future work.
- Each timeline is at most 120 seconds and 100 shots. Speech transcription uses the first 120 seconds of one clip. V1 is suitable for highlights and short speech edits rather than a complete long-form event edit.
- Rhythm analysis estimates useful cut points; it is not a trained downbeat detector. AI selection samples footage and can miss short events.
- Director Review does not receive continuous video or audio. It cannot reliably judge dialogue delivery, beat synchronization or music balance by listening. Its suggestions require user review.
- The AI editing plan summarizes an existing draft; it is not an autonomous multi-pass director. Director application currently adjusts trims rather than sourcing new coverage.
- Speech edits keep source audio; speech plus background-music mixing and automatic B-roll insertion are future work.
- Language conversion is AI-assisted and can mistranslate names, speech or context. Review output before delivery; no bilingual simultaneous subtitle track in V1.
- There is no GPU render worker, generative footage, denoising or detail restoration. 4K uses the NAS CPU and can take longer.

## Deployment and protection

Use the existing nas-run.sh deployment. It binds the app to NAS localhost, uses Basic authentication behind the private HTTPS reverse proxy, mounts API/password secrets separately, and runs with read-only root filesystem, dropped capabilities, no-new-privileges, limited memory and two render threads. The NAS kernel does not support the previously attempted CPU/PID limits. Keep access within LAN/WireGuard; ZIP backups are not encrypted.

AI actions disclose which audio, text or sampled frames are sent externally. Transcripts and frame/index caches reduce repeated requests. No API keys, passwords, project data or user media are included in this release archive. Requests validate IDs/settings; mutating browser requests require the application header and reject cross-site requests. Project mutations and renders are serialized.

## Validation

Automated local tests use synthetic media and mocked AI responses, with no paid API calls:

```bash
python tests/test_studio.py
python tests/test_http.py
python tests/test_accounts.py
node tests/test_transcript_ui.js
```

Checks cover speech edits, caption timing/rendering, 720p/1080p/4K dimensions, source/music audio, cumulative frame timing, normalization, word-selection persistence, backups, original-caption restoration, translation batches and atomic failures, stale approval rejection, authentication and request validation. These do not measure real AI translation quality or NAS render speed.

Existing user tests have confirmed music cuts, English/Chinese speech captions, manual caption corrections, Smart Cuts, plan approval, Director suggestions, backup/restore, 1080p/4K playback and acceptable normalization.

Final V1 acceptance: on the existing Chinese project, save corrected source captions, convert to English, inspect the translation and timing, export, then choose Original and confirm the saved source captions return. Repeat a short conversion to the other Chinese script if desired. Save/reopen the project and confirm its selected language remains.

Multiuser acceptance: sign in as auracut, confirm existing projects, create editor1 with AI off, then use a private window to sign in as editor1. Its project/footage lists should start empty. Upload and save a short project; confirm it does not appear in the administrator workspace. Grant AI only if desired. Test disabling the account and re-enabling it. See README.md for account storage and Basic-auth behavior.

Public-source hardening: supported local-media demuxers/protocols are explicitly restricted; account-specific login failure buckets cannot be cleared by another successful user; unscoped worker threads fail closed; secrets, media, account data and certificates are excluded from the source package. See SECURITY_REVIEW.md.
