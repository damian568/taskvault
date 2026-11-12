# Troubleshooting: "ERROR: connection timeout"

## The scenario

The app is running, but users get an error. The app logs show:

```
Connecting to database... ERROR: connection timeout ... Retrying... ERROR: connection timeout
```

**Goal:** find the cause with evidence **before** changing anything. Work from the outside in, one layer at a time, and write down what each step shows.

---

## What I observed when I reproduced it

I froze the database with `docker compose pause db`, then restarted the app.

| Where | What I saw |
|---|---|
| Browser / `curl https://localhost/api/tasks` | `500` after ~5 s, then **`502 Bad Gateway`** once the app restarted |
| `curl https://localhost/health` | `503 {"status":"error","database":"unreachable"}` |
| `docker compose ps` | app `Up (health: starting)` · db **`Up (Paused)`** |
| `docker compose logs app` | the log below |

```
ERROR GET /api/tasks: Query read timeout
Health check failed: Connection terminated due to connection timeout
SIGTERM received, shutting down...
Shutdown complete
Connecting to database db:5432 (attempt 1/10)...
ERROR: connection timeout
Retrying in 3s...
Connecting to database db:5432 (attempt 2/10)...
ERROR: connection timeout
Retrying in 3s...
```

After `docker compose unpause db`, the app logged `Database connection OK` and `/health` returned `200`. **No other change was needed.**

**Why the users see 500, then 502:**
- **500:** the app is still running, but its database query times out after 5 s, so it returns an error.
- **502:** while the app restarts and retries, it doesn't listen on port 3000 yet, so nginx has nothing to forward to.

**Why log lines can look out of order:** `ERROR` lines go to **stderr** and normal lines go to **stdout**. Docker merges the two streams, so "Retrying" can occasionally print before its "ERROR". Use `docker compose logs -t app` to see timestamps.

---

## The error message tells you which layer to look at

| Error in the app log | Meaning | Likely causes |
|---|---|---|
| `getaddrinfo ENOTFOUND db` | **DNS:** the name `db` doesn't resolve | db container stopped or removed; app and db not on the same network; typo in `DB_HOST` |
| `connect ECONNREFUSED 172.x.x.x:5432` | Host reachable, but **nothing listening** on the port | Postgres crashed or is restarting; wrong `DB_PORT` |
| `connection timeout` | Packets sent, **no answer at all** | db frozen or paused, overloaded or out of memory; still initialising; firewall or wrong network route |
| `password authentication failed` | Network fine, **credentials** wrong | `.env` changed after the volume was created (the db keeps the old password) |

When I stopped the db (`docker compose stop db`) instead of pausing it, the log said `ENOTFOUND db`, not timeout. **Different error, different cause.**

---

## Structured investigation

### 1. Container status
```powershell
docker compose ps
```
- **db is `Exited`, `Restarting` or `Paused`:** the db is the problem. Go to step 2.
- **db is `Up (unhealthy)`:** Postgres is running but not answering correctly. Go to steps 2 and 3.
- **db is `Up (healthy)` and the app still times out:** suspect the network path. Go to steps 4–7.

### 2. Database logs
```powershell
docker compose logs --tail 100 db
```
Look for:
- `database system is ready to accept connections`: it's up.
- `FATAL`, `PANIC`, `could not write`, `No space left on device`: a crash or a full disk.
- Still running `init.sh` or `CREATE TABLE`: the **first-time init isn't finished yet**.
- Messages about being `killed` or `out of memory`.

### 3. Database healthcheck
```powershell
docker inspect --format "{{json .State.Health}}" taskvault-db-1
docker compose exec db pg_isready -h 127.0.0.1
```
- `accepting connections` means Postgres itself is fine, so the problem is between the app and the db.
- The `Health.Log` entries show *when* the db started failing.

### 4. Do app and db share a network?
```powershell
docker network inspect taskvault_backend --format "{{range .Containers}}{{.Name}} {{end}}"
```
- **Expected:** `taskvault-app-1 taskvault-db-1`. If either is missing, check `networks:` in `docker-compose.yml`.

### 5. The app's database settings
```powershell
docker compose exec app printenv DB_HOST DB_PORT DB_NAME DB_USER
```
- **Expected:** `db`, `5432`, `taskvault`, `taskvault_app`.
- **Never print `DB_PASSWORD`** into logs or tickets.
- Common mistakes: a wrong host such as `localhost`, which inside a container means *the container itself*, or a wrong port.

### 6. DNS resolution from inside the app container
```powershell
docker compose exec app nslookup db
```
- **Gets an IP:** DNS works.
- **`NXDOMAIN` or `bad address`:** the db container isn't running, or isn't on the app's network.

### 7. TCP reachability from inside the app container
```powershell
docker compose exec app nc -zv -w 3 db 5432
```
- **`open`:** the network path works. Look at db load, credentials or the app config.
- **Hangs, then times out:** packets are dropped. Check whether the db is paused or overloaded, and look for firewall rules.
- **`Connection refused`:** the db container is reachable but Postgres isn't listening.

### 8. Is the database still initialising?
On the **first** start, with an empty volume, Postgres runs `init.sh` before it accepts TCP connections.
- The db healthcheck uses `pg_isready -h 127.0.0.1`, which stays unhealthy until init is complete.
- On a slow disk this takes longer. Check whether step 2 shows init messages and wait for `ready to accept connections`.

### 9. Firewall, ports and resource limits
```powershell
docker stats --no-stream
```
- **Memory or CPU near the limit:** an OOM-killed or swapping db answers slowly or not at all. Also check **Docker Desktop → Settings → Resources** and free disk space.
- **On the host:** ports 80 and 443 must be free (`Get-NetTCPConnection -LocalPort 80,443`). A VPN or corporate firewall can interfere with Docker networking.

---

## What NOT to do before you understand the problem

- ❌ **Don't delete volumes** (`docker compose down -v`, `docker volume rm`). That deletes all data, and it destroys the evidence.
- ❌ **Don't publish the db port** (`5432:5432`) "to test it". That exposes the database to the host and network, and bypasses the internal network design.
- ❌ **Don't disable security:** no removing TLS, healthchecks or `internal: true`, and no switching the app to the superuser.
- ❌ **Don't change several things at once.** If it starts working, you won't know why, and if it gets worse, you won't know what broke it.
- ❌ **Don't restart everything blindly.** A restart can hide the cause, for example a container that was out of memory. Collect logs first.
- ✅ **Do:** collect evidence (`ps`, logs, `inspect`), form one hypothesis, make **one** change, re-check, and write down what you found.

---

## Reproduce it yourself

```powershell
docker compose pause db          # freeze Postgres -> timeouts
docker compose restart app
docker compose logs -f app       # watch "ERROR: connection timeout" / "Retrying..."
docker compose unpause db        # the app recovers on its own

docker compose stop db           # compare: stopped db -> "ENOTFOUND db"
docker compose restart app
docker compose start db
```
