# AI Disclosure

## Tools and resources used

| Tool / resource | Used for |
|---|---|
| Claude Code (AI coding assistant in VS Code, Anthropic) | Planning the build step by step; explaining concepts (LF vs CRLF, `.env` vs `.env.example`, Docker networks, healthchecks, least privilege); generating most of the code, configuration and documentation in this repository; diagnosing my Windows setup (WSL 2, Docker Desktop); running build and test commands; reproducing the troubleshooting scenario |
| Claude (AI assistant, Anthropic) | A step-by-step build guide in Bulgarian, with an explanation of every file |
| Docker Desktop (WSL 2) | Running and inspecting the containers, networks and volumes |
| VS Code, Git, GitHub | Editing, version control, branches and pull requests |
| winget | Installing Docker Desktop and Node.js from the command line |

## How they helped

**What the AI did.** Claude Code generated most of the files in this repository: the app, the Dockerfile, `docker-compose.yml`, the nginx config, the certificate scripts and the documentation. Every file has comments explaining what each part does and why. It explained each step before or after building it, ran the tests, and found two bugs during testing:
- `generate-cert.sh` could not write files in Git Bash on Windows (a path-conversion problem);
- the app logged an empty `ERROR:` message for some connection failures.

**What I did.**
- **Set up my machine.** I installed WSL 2, Docker Desktop and Node.js and worked through the problems on the way. Virtual Machine Platform was listed as enabled but never applied, because a pending Windows update was blocking it until I used "Update and restart".
- **Decided how to work:** explanations first, building one step at a time, and asking before destructive actions.
- **Reviewed and ran everything.** I read the files, ran the stack and tested it in the browser. I also checked the certificate's SHA-256 fingerprint against the one the browser showed.
- **Handled the Git workflow:** I created, reviewed and merged the pull requests.
- **Built a second version myself.** I typed every file following a step-by-step guide, to make sure I understand and can explain each part.

**How I verified it.**
- **Status and health:** `docker compose ps` showed all services healthy, and `/health` returned 200.
- **The app:** the HTTP→HTTPS redirect worked, all four API operations worked, and invalid input was rejected.
- **Security:**
  - the security headers were present;
  - the database had no published port and no internet access, and nginx could not reach it;
  - the app ran as non-root;
  - the app's database user could not `DROP` or `CREATE` tables.
- **Persistence:** data survived `docker compose down` / `up`.
- **The troubleshooting scenario:** I reproduced it with `docker compose pause db`.

**What I can now explain on my own:**
- why there are two networks and why the backend one is internal;
- why there are two database users;
- how `healthcheck` and `depends_on: service_healthy` control the start order;
- why the database init runs only once;
- why the browser warns about a self-signed certificate even though the connection is encrypted.

## One example where I corrected, adapted or rejected a suggestion

**Rejected: building before I understood the plan.** At the start I gave the AI the full project plan, and it immediately began creating files. I stopped it, had it delete everything it had created, and asked for a complete step-by-step plan explaining *why* each part exists. Only after that did I let it build, one step at a time. The task says I must be able to explain and modify everything I submit. A finished repository I did not understand would have been worse than a slower start.

**Adapted: the empty error message.** In my own build I saw that a failed database connection sometimes logged only `ERROR:` with no reason. On Node 20+, a host name with both an IPv6 and an IPv4 address produces an `AggregateError` with an empty `.message` when every attempt fails. The real cause is in `.errors` and `.code`. I checked whether this repository had the same problem. It did, so the logging now falls back to `.errors` and `.code`. Logs are the main evidence when troubleshooting, so an empty error message is a real problem, not a cosmetic one.
