# TaskVault

A small internal task tracker for a team. You can list, create, complete and delete tasks. It runs as three Docker containers behind HTTPS.

## 1. What did I build?

A deliberately simple web app whose focus is the **infrastructure** around it:

- **nginx** is the reverse proxy and the only public entry point. It terminates HTTPS (self-signed certificate), redirects HTTP to HTTPS and adds security headers.
- **app** is a Node.js + Express REST API and a plain HTML/JS page. It has a `/health` endpoint and retries the database connection at startup.
- **db** is PostgreSQL. It stores data in a named volume, and the app accesses it through a least-privilege user.

Everything is defined in `docker-compose.yml`. No Kubernetes, no extra services.

## 2. How does the solution work?

```
Browser ──HTTPS 443──▶ nginx ──HTTP 3000──▶ app ──TCP 5432──▶ db ──▶ volume
                       [ frontend network ]   [ backend network, internal ]
```

- **Two Docker networks.**
  - `frontend` connects nginx and the app.
  - `backend` connects the app and the db, and is `internal: true`, so it has no outside access.
  - nginx can't reach the db. Only nginx publishes ports.
- **API:** `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id` and `DELETE /api/tasks/:id`. All SQL uses parameterized queries.
- **Health:**
  - The db healthcheck runs `pg_isready`. The app's healthcheck calls `GET /health`, which runs `SELECT 1` and returns 200 or 503.
  - Containers start in order: db, then app, then nginx (`depends_on: service_healthy`).
- **Database init:** on the first start only, `db/init.sh` runs `db/init.sql`. It creates the `tasks` table, a limited app user and dummy data. Credentials come from `.env`.

Details and diagram: [docs/architecture.md](docs/architecture.md).

## 3. How to run it

**Requirements:** Docker Desktop (WSL 2 on Windows) and Git. Ports 80 and 443 must be free.

```powershell
# 1. Clone
git clone https://github.com/damian568/taskvault.git
cd taskvault

# 2. Create your .env and set your own passwords (no $, quotes, spaces or #)
copy .env.example .env          # Linux/macOS: cp .env.example .env

# 3. Generate the self-signed certificate (uses Docker if openssl is not installed)
.\scripts\generate-cert.ps1     # Linux/macOS/Git Bash: sh scripts/generate-cert.sh

# 4. Build and start
docker compose up --build -d
docker compose ps               # db and app should show "healthy"
```

**5. Open the app.** Go to **https://localhost** and accept the certificate warning: *Advanced → Proceed*. It's expected, because the certificate is self-signed.

**Quick checks:**
- `curl.exe -k https://localhost/health` should return `{"status":"ok",...}`.
- `curl.exe -I http://localhost` should return `301`, a redirect to HTTPS.

**Stop:** `docker compose down` keeps the data. `docker compose down -v` **deletes** the database volume.

## 4. Security considerations

- **Minimal exposure.** Only nginx publishes ports. The db has no published port and sits on an internal network.
- **TLS.** Only TLS 1.2 and 1.3 are allowed, and HTTP redirects to HTTPS.
- **Security headers.** nginx sends HSTS, CSP (`default-src 'self'`), `X-Frame-Options`, `nosniff`, a Referrer-Policy and a Permissions-Policy, and hides its version.
- **Least privilege in the database.** The app user only has `SELECT/INSERT/UPDATE/DELETE` on `tasks`. Tested: `DROP TABLE` gives *must be owner*, and `CREATE TABLE` gives *permission denied*. The superuser is only used for initialisation.
- **No secrets in Git.**
  - Credentials live in `.env`, which is gitignored. Only `.env.example` with placeholders is committed.
  - Certificates and keys are generated locally and gitignored.
  - `.dockerignore` keeps them out of images.
- **Hardened container.** The app runs as the non-root user `node` on a pinned Alpine image, built in two stages with `npm ci` from a lockfile. Its code files are read-only for the app user.
- **Application.**
  - Parameterized queries prevent SQL injection, and input is validated on the server and by a DB `CHECK` constraint.
  - The frontend uses `textContent`, which prevents XSS.
  - Request bodies are size-limited, and clients get generic error messages.

## 5. What I would improve for production

- **Managed database:** e.g. Azure Database for PostgreSQL, with automated **backups**, point-in-time restore and high availability.
- **Secrets manager:** e.g. Azure Key Vault instead of a `.env` file, with rotated credentials or managed identities.
- **Real certificates:** Let's Encrypt or a company CA, renewed automatically. Also **TLS between app and db** (`sslmode=verify-full`).
- **User authentication:** e.g. SSO with Entra ID / OIDC, plus authorisation and rate limiting.
- **Centralised logging and monitoring:** structured JSON logs sent to e.g. Azure Monitor, Log Analytics or Grafana, with metrics and alerts on `/health`.
- **CI/CD pipeline:**
  - lint, test and build on every PR;
  - **container image scanning** (e.g. Trivy, Defender for Containers);
  - dependency scanning (`npm audit`, Dependabot);
  - images pinned by digest and pushed to a private registry.
- **Runtime hardening:** CPU and memory limits, read-only root filesystem, `no-new-privileges`, and a WAF in front of nginx.

## 6. Most difficult part

> _To be written by me._
