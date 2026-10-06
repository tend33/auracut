# Source security review — 2026-10-06

Release: 1.1.1, V1 multiuser. Scope: the source release, local HTTP behavior and synthetic-media regression tests. No existing Git history was present in the development folder. The public source package was assembled from an explicit file allowlist.

## Changes made

- Restricted FFmpeg/ffprobe inputs to local-file protocols and supported media demuxers, rejecting playlist/concat content disguised with an accepted file extension.
- Separated account and source-address login failure buckets. Successful authentication by one user cannot clear another account's failed attempts.
- Removed the implicit administrator identity fallback from uninitialized request/worker threads. Startup initializes the administrator workspace explicitly; authenticated requests and background workers carry their own account context.
- Expanded Git/Docker exclusions for account records, media, secrets, environment files and certificates/private keys.
- Removed deployment-specific NAS addressing and folder names from the public documentation; added setup, security policy and MIT license.

## Verification

Passed test_studio.py, test_http.py, test_accounts.py, test_security.py and test_transcript_ui.js. The checks cover real captioned 720p/1080p/4K exports, speech and music timing/audio, translation timing/atomic failures, project restoration, per-user media/project/job/export/backup access, account roles/lifecycle, AI grants, cross-site mutation rejection, invalid IDs/settings, indirect-media rejection and login throttling. Tests use temporary data and dummy credentials, with mocked paid AI calls.

The source package contains no runtime password/API-key files, account database, user footage/exports, local certificates or private keys. Static text scanning checks common credential/private-key patterns. There is no prior Git history to scan. Dummy values in tests are deliberately non-production fixtures.

## Limits

This is a source review plus targeted regression tests, not an independent penetration test. An external dependency/CVE scanner and a fresh Docker-image vulnerability scan were not run. Python, FFmpeg and operating-system packages still need routine updates. Deployment remains authenticated private LAN/VPN use behind HTTPS, with no direct public internet service exposure. Public source publication does not publish a running instance.
