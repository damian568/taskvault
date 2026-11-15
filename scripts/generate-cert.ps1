# generate-cert.ps1 - creates a self-signed TLS certificate for local HTTPS (Windows).
# Output: nginx/certs/taskvault.crt (public) and nginx/certs/taskvault.key (SECRET)
# Usage:  .\scripts\generate-cert.ps1          overwrite: .\scripts\generate-cert.ps1 -Force

param(
    [switch]$Force    # overwrite an existing certificate
)

$ErrorActionPreference = 'Stop'

$certDir = Join-Path $PSScriptRoot '..\nginx\certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$certDir = (Resolve-Path $certDir).Path
$crt = Join-Path $certDir 'taskvault.crt'
$key = Join-Path $certDir 'taskvault.key'

if ((Test-Path $crt) -and -not $Force) {
    Write-Host "Certificate already exists: $crt"
    Write-Host "Use -Force to overwrite it."
    exit 0
}

$subject = '/CN=localhost'
$san     = 'subjectAltName=DNS:localhost,IP:127.0.0.1'

if (Get-Command openssl -ErrorAction SilentlyContinue) {
    Write-Host 'Using local openssl...'
    & openssl req -x509 -nodes -newkey rsa:2048 -days 365 `
        -keyout $key -out $crt -subj $subject -addext $san
} else {
    Write-Host 'openssl not found - using a one-off Docker container (alpine + openssl)...'
    docker run --rm -v "${certDir}:/certs" alpine:3.24 sh -c `
        "apk add --no-cache openssl >/dev/null && openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout /certs/taskvault.key -out /certs/taskvault.crt -subj '$subject' -addext '$san'"
}

if ($LASTEXITCODE -ne 0) { throw "Certificate generation failed (exit code $LASTEXITCODE)." }

Write-Host ''
Write-Host "Created: $crt"
Write-Host "Created: $key   (private key - never commit it)"
