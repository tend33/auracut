# Security policy

## Supported deployment

V1 is designed for authenticated private LAN/VPN use behind a trusted HTTPS reverse proxy. Do not publish its HTTP port directly to the internet. Use unique account passwords and keep the host, Docker base image and FFmpeg packages patched.

The default NAS launcher binds to host loopback, mounts password/API secrets read-only, drops capabilities and enables a read-only root filesystem and no-new-privileges. Account passwords use salted scrypt hashes. Workspace paths and background jobs are isolated by authenticated account. Account administration and paid AI permissions are enforced by the server.

Browser mutations require an application request header and reject cross-site requests. Basic authentication is checked on each request. Login failures are throttled by account and source address; resetting or disabling an account affects subsequent requests. In-progress authorized operations may finish.

User media is processed with local-file-only protocols and a supported-format allowlist. ZIP restores validate member names, metadata and size limits and copy media into generated filenames. Subprocesses receive argument arrays, not shell strings. Browser text is rendered through textContent/form values rather than executable HTML.

## Secrets and data

Never commit password.txt, ai-key.txt, accounts.json, data/, environment secrets, local certificates or private keys. Source releases exclude them. Git ignore rules are a guard, not a substitute for inspecting a staged commit. Back up the full private data directory separately; project ZIPs include only selected project media and editor metadata.

AI requests use the shared administrator-configured API key, with per-user permission grants. These grants do not impose monetary budgets. Enable only for trusted accounts. AI output and translation quality require user review.

## Reporting a vulnerability

Use GitHub private vulnerability reporting if it is enabled on the repository. If no private reporting channel is available, open an issue asking for a private contact without posting exploit details, credentials or user media. Do not test against other people's deployed instances.

## Review scope

The included regression tests check account isolation, request protections, indirect-media rejection, login throttling and editor behavior. Passing tests and a source review are not an independent penetration test or a guarantee against future dependency vulnerabilities. No external dependency-vulnerability scanner was run in the local review.
