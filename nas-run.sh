#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data
chmod 700 data

if [[ ! -f password.txt ]]; then
  while true; do
    read -r -s -p 'Set an Auracut password (at least 16 characters): ' auracut_password
    printf '\n'
    if [[ ${#auracut_password} -ge 16 ]]; then break; fi
    printf 'Please use at least 16 characters.\n' >&2
  done
  (umask 077; printf '%s' "$auracut_password" > password.txt)
  unset auracut_password
fi
chmod 600 password.txt

ai_mount=()
if [[ -f ai-key.txt ]]; then
  chmod 600 ai-key.txt
  ai_mount=(-v "$PWD/ai-key.txt:/run/secrets/auracut_ai_key:ro" -e AURACUT_AI_KEY_FILE=/run/secrets/auracut_ai_key)
fi

sudo docker build -t auracut:local .
if sudo docker container inspect auracut >/dev/null 2>&1; then
  printf 'An Auracut container already exists. Stop and remove it before starting a replacement.\n' >&2
  exit 1
fi

sudo docker run -d \
  --name auracut \
  --restart unless-stopped \
  --user "$(id -u):$(id -g)" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=128m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --memory 2g \
  -p 127.0.0.1:8000:8000 \
  -v "$PWD/data:/app/data:rw" \
  -v "$PWD/password.txt:/run/secrets/auracut_password:ro" \
  -e AURACUT_PASSWORD_FILE=/run/secrets/auracut_password \
  "${ai_mount[@]}" \
  auracut:local

printf 'Auracut is listening only on NAS localhost:8000. Add a Synology HTTPS reverse proxy to access it from your browser.\n'
