# =============================================================================
# generate-cert.ps1 - creates a self-signed TLS certificate for local HTTPS (Windows).
# -----------------------------------------------------------------------------
# Output:  nginx/certs/taskvault.crt  (certificate - public)
#          nginx/certs/taskvault.key  (private key - SECRET, never commit it)
# Usage (from the repo root):   .\scripts\generate-cert.ps1
#        overwrite existing:    .\scripts\generate-cert.ps1 -Force
#
# Uses openssl if it is installed; otherwise runs openssl in a throw-away Docker
# container, so nothing extra has to be installed on Windows.
# The browser will warn about this certificate: no trusted Certificate Authority
# signed it. That's expected locally - production would use a real certificate.
# =============================================================================

param(
    [switch]$Force    # overwrite an existing certificate
)

# Stop on the first error instead of continuing with a broken state.
$ErrorActionPreference = 'Stop'

# Folder of this script -> ..\nginx\certs (works no matter where it is called from).
$certDir = Join-Path $PSScriptRoot '..\nginx\certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$certDir = (Resolve-Path $certDir).Path
$crt = Join-Path $certDir 'taskvault.crt'
$key = Join-Path $certDir 'taskvault.key'

# Safety: don't silently replace an existing key.
if ((Test-Path $crt) -and -not $Force) {
    Write-Host "Certificate already exists: $crt"
    Write-Host "Use -Force to overwrite it."
    exit 0
}

# openssl arguments (same in both branches below):
#   req -x509        create a self-signed certificate (not a signing request)
#   -nodes           don't encrypt the key with a passphrase (nginx must read it unattended)
#   -newkey rsa:2048 generate a new 2048-bit RSA key pair
#   -days 365        valid for one year
#   -subj /CN=...    subject: the certificate is for "localhost"
#   -addext SAN      Subject Alternative Names - modern browsers only check these
$subject = '/CN=localhost'
$san     = 'subjectAltName=DNS:localhost,IP:127.0.0.1'

if (Get-Command openssl -ErrorAction SilentlyContinue) {
    Write-Host 'Using local openssl...'
    & openssl req -x509 -nodes -newkey rsa:2048 -days 365 `
        -keyout $key -out $crt -subj $subject -addext $san
} else {
    Write-Host 'openssl not found - using a one-off Docker container (alpine + openssl)...'
    # --rm         delete the container afterwards
    # -v dir:/certs mount nginx/certs into the container, so the files land on the host
    docker run --rm -v "${certDir}:/certs" alpine:3.24 sh -c `
        "apk add --no-cache openssl >/dev/null && openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout /certs/taskvault.key -out /certs/taskvault.crt -subj '$subject' -addext '$san'"
}

# PowerShell doesn't stop on a failing external program by itself - check its exit code.
if ($LASTEXITCODE -ne 0) { throw "Certificate generation failed (exit code $LASTEXITCODE)." }

Write-Host ''
Write-Host "Created: $crt"
Write-Host "Created: $key   (private key - never commit it)"
