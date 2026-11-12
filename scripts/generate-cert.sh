#!/bin/sh
# =============================================================================
# generate-cert.sh - creates a self-signed TLS certificate for local HTTPS
# (Linux, macOS, WSL or Git Bash on Windows).
# -----------------------------------------------------------------------------
# Output:  nginx/certs/taskvault.crt  (certificate - public)
#          nginx/certs/taskvault.key  (private key - SECRET, never commit it)
# Usage (from the repo root):   sh scripts/generate-cert.sh
#        overwrite existing:    sh scripts/generate-cert.sh --force
#
# Uses openssl if installed; otherwise runs openssl in a throw-away Docker container.
# =============================================================================

# Stop on the first error.
set -e

# Git Bash on Windows rewrites arguments starting with "/" into Windows paths
# ("/CN=localhost" -> "C:/Program Files/Git/CN=localhost"). This turns that off.
export MSYS_NO_PATHCONV=1

# Folder of this script -> ../nginx/certs (works no matter where it's called from).
# On Git Bash, "pwd -W" gives a Windows path (C:/...). Because path conversion is off
# (see above), Windows programs like openssl.exe and Docker Desktop need that form.
# On Linux/macOS "pwd -W" doesn't exist, so it falls back to plain "pwd".
CERT_DIR="$(cd "$(dirname "$0")/../nginx/certs" && (pwd -W 2>/dev/null || pwd))"
CRT="$CERT_DIR/taskvault.crt"
KEY="$CERT_DIR/taskvault.key"

# Safety: don't silently replace an existing key.
if [ -f "$CRT" ] && [ "$1" != "--force" ]; then
  echo "Certificate already exists: $CRT"
  echo "Use --force to overwrite it."
  exit 0
fi

# See generate-cert.ps1 for what each openssl option means.
SUBJECT="/CN=localhost"
SAN="subjectAltName=DNS:localhost,IP:127.0.0.1"

if command -v openssl >/dev/null 2>&1; then
  echo "Using local openssl..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "$KEY" -out "$CRT" -subj "$SUBJECT" -addext "$SAN"
else
  echo "openssl not found - using a one-off Docker container (alpine + openssl)..."
  # --rm           delete the container afterwards
  # -v dir:/certs  mount nginx/certs into the container, so the files land on the host
  docker run --rm -v "$CERT_DIR:/certs" alpine:3.24 sh -c \
    "apk add --no-cache openssl >/dev/null && openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout /certs/taskvault.key -out /certs/taskvault.crt -subj '$SUBJECT' -addext '$SAN'"
fi

# Private key readable only by its owner (on Linux/macOS; ignored on Windows).
chmod 600 "$KEY" 2>/dev/null || true

echo ""
echo "Created: $CRT"
echo "Created: $KEY   (private key - never commit it)"
