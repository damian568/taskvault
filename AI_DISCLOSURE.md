# AI Disclosure

## Tools and resources used

| Tool / resource | Used for |
|---|---|
| Claude (AI assistant, Anthropic) | A step-by-step build guide in Bulgarian, with an explanation of every file |
| Claude Code (AI coding assistant in VS Code, Anthropic) | Explaining concepts (LF vs CRLF, `.env` vs `.env.example`, Docker networks, healthchecks, least privilege); checking my files after each step (syntax, location, line endings); running test commands; diagnosing my Windows setup (WSL 2, Docker Desktop); drafting the documentation |
| Docker Desktop (WSL 2) | Running and inspecting the containers, networks and volumes |
| VS Code, Git, GitHub | Writing the code, version control, branches and pull requests |
| winget | Installing Docker Desktop and Node.js from the command line |

## How they helped

**What the AI did.**
- Gave me a step-by-step guide with the content of each file and an explanation of why it is needed.
- Checked my files after each step and ran test commands: the API, the security checks and a reproduction of the troubleshooting scenario.
- Explained the errors I ran into.
- Drafted the documentation (`README.md`, `docs/architecture.md`, `TROUBLESHOOTING.md`), which I reviewed. Section 6 of the README is my own.

**What I did.**
- **Wrote the code myself.** I created and typed every code and configuration file: the app, the Dockerfile, `docker-compose.yml`, the nginx config, the database scripts and the certificate scripts.
- **Ran every command and checked each result.**
- **Set up my machine:** WSL 2, Docker Desktop and Node.js. That included a problem where Virtual Machine Platform was listed as enabled but never applied, until I used "Update and restart" for a pending Windows update.
- **Fixed problems myself:**
  - line-ending issues (CRLF vs LF);
  - files saved in the wrong folders;
  - false SQL errors from the VS Code MSSQL extension, which I proved wrong by running the SQL in real PostgreSQL;
  - a project-name and volume clash with an earlier test project.
- **Created and merged the pull requests.**

**How I verified it.**
- **Status and health:** `docker compose ps` showed all services healthy, and `/health` returned 200.
- **The app:** the HTTP→HTTPS redirect worked, all four API operations worked in the browser and with curl, and invalid input was rejected.
- **Security:**
  - the security headers were present;
  - the database had no published port and no internet access, and nginx could not reach it;
  - the app ran as non-root;
  - the app's database user could not `DROP` or `CREATE` tables.
- **Persistence:** data survived `docker compose down` / `up`.

**What I can now explain on my own:**
- why there are two networks and why the backend one is internal;
- why there are two database users;
- how `healthcheck` and `depends_on: service_healthy` control the start order;
- why the database init runs only once;
- why the browser warns about a self-signed certificate even though the connection is encrypted.

## One example where I corrected, adapted or rejected a suggestion

**Adapted: the empty error message.** When the database was unreachable, the guide expected a log line like `ERROR: connect ECONNREFUSED`, but my app printed only `ERROR:` with nothing after it.
- **The cause:** on Node 20+, a host name with both an IPv6 and an IPv4 address (like `localhost`) produces an `AggregateError` when every connection attempt fails. Its `.message` is empty, and the real cause is in `.code` and `.errors`.
- **My fix:** the log falls back to `err.code` when the message is empty.
- **Why it matters:** logs are the main evidence when troubleshooting, so an empty error message hides exactly what you need.

**Rejected: building before I understood the plan.** At one point I gave Claude Code the whole project plan, and it immediately started creating files. I stopped it, had it delete everything, and asked for a step-by-step explanation of *why* each part exists first. The task says I must be able to explain and modify everything I submit. A finished repository I did not understand would have been worse than a slower start.
