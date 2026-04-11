#!/bin/sh
# Runtime injection of webapp config at container startup.
#
# The nginx:alpine base image runs every `*.sh` file in
# `/docker-entrypoint.d/` before starting nginx (see
# /docker-entrypoint.sh in that image). This script reads
# JOURNAL_API_TOKEN from the environment and writes it into
# /usr/share/nginx/html/config.js, overwriting the placeholder
# stub that was baked into the image at build time.
#
# The webapp bundle (src/api/client.ts) reads the value from
# `window.__JOURNAL_CONFIG__.apiToken` at request time and attaches
# it as `Authorization: Bearer <token>` on every /api/* and /mcp
# call. The token must match `JOURNAL_API_TOKEN` on journal-server.
#
# Fails closed: if JOURNAL_API_TOKEN is empty or contains characters
# outside the URL-safe base64 alphabet, the container exits non-zero
# before nginx starts. Both mirror journal-server's refusal to boot
# without a valid token.

set -eu

CONFIG_FILE=/usr/share/nginx/html/config.js
TOKEN="${JOURNAL_API_TOKEN:-}"

if [ -z "$TOKEN" ]; then
    echo "40-journal-config: FATAL — JOURNAL_API_TOKEN is not set." >&2
    echo "40-journal-config: Generate one with:" >&2
    echo "    python -c \"import secrets; print(secrets.token_urlsafe(32))\"" >&2
    echo "40-journal-config: and add it to the VM's .env, then pass it" >&2
    echo "40-journal-config: into the journal-webapp service in compose." >&2
    exit 1
fi

# Tokens generated with `secrets.token_urlsafe(32)` are URL-safe
# base64: [A-Za-z0-9_-]. Refuse anything else so a mis-set env var
# can't inject JavaScript into config.js via quote/newline escaping.
# (The token is written inside a double-quoted JS string below.)
if ! printf '%s' "$TOKEN" | grep -Eq '^[A-Za-z0-9_-]+$'; then
    echo "40-journal-config: FATAL — JOURNAL_API_TOKEN contains" >&2
    echo "40-journal-config: characters outside [A-Za-z0-9_-]." >&2
    echo "40-journal-config: Refusing to write config.js." >&2
    exit 1
fi

cat > "$CONFIG_FILE" <<EOF
// Written at container startup by docker/40-journal-config.sh.
// Do not edit — any manual change is overwritten on the next boot.
window.__JOURNAL_CONFIG__ = { apiToken: "${TOKEN}" }
EOF

# nginx workers run as the unprivileged `nginx` user; make sure they
# can read the file we just wrote as root.
chmod 0644 "$CONFIG_FILE"

echo "40-journal-config: wrote $CONFIG_FILE with runtime token"
