// =============================================================================
// server.js - the TaskVault web application (entry point).
//   - serves the static page from public/
//   - REST API:  GET/POST /api/tasks,  PUT/DELETE /api/tasks/:id
//   - GET /health for Docker's healthcheck
//   - connects to the db at startup (with retries) and shuts down gracefully
// =============================================================================

const path = require('path');                          // Node built-in: builds file paths safely
const express = require('express');                    // minimal web framework (routing + JSON)
const { pool, connectWithRetry } = require('./db');    // our db module (db.js)

// Port inside the container. Not published to the host - only nginx talks to it.
const PORT = Number(process.env.PORT) || 3000;
const app = express();

// ---------- Middleware (runs for every request, top to bottom) ----------

// Express adds "X-Powered-By: Express" by default - that tells attackers what to
// target. Remove it (small hardening step).
app.disable('x-powered-by');

// Parse JSON request bodies into req.body. The 10 KB limit stops clients from
// sending huge bodies to exhaust memory - a task title is never that big.
app.use(express.json({ limit: '10kb' }));

// If the URL matches a file in public/ (e.g. "/" -> index.html, "/app.js"),
// send that file. Otherwise the request continues to the routes below.
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Input validation helpers ----------

// The only allowed task states (the db enforces the same rule with a CHECK).
const STATUSES = ['todo', 'done'];

// Accept only positive whole numbers as ids ("5" -> 5). Anything else -> null.
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// A valid title is a string with 1-200 characters after trimming spaces.
function isValidTitle(title) {
  return typeof title === 'string' && title.trim().length >= 1 && title.trim().length <= 200;
}

// ---------- Health check (used by Docker's healthcheck) ----------
// "The process is running" is not the same as "the service works".
// We also ask the db, so 200 = can really serve users, 503 = db unreachable.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'reachable' });
  } catch (err) {
    console.error(`Health check failed: ${err.message}`);
    res.status(503).json({ status: 'error', database: 'unreachable' });   // 503 = Service Unavailable
  }
});

// ---------- REST API ----------
// SECURITY: every query uses placeholders ($1, $2) and passes values separately.
// PostgreSQL treats those values strictly as DATA, never as SQL code,
// so SQL injection is not possible no matter what the user sends.

// GET /api/tasks -> list all tasks, newest first. 200 + JSON array.
app.get('/api/tasks', async (req, res) => {
  const result = await pool.query(
    'SELECT id, title, status, created_at FROM tasks ORDER BY created_at DESC, id DESC'
  );
  res.json(result.rows);
});

// POST /api/tasks  body: {"title": "..."} -> create a task. 201 Created + the new task.
app.post('/api/tasks', async (req, res) => {
  const { title } = req.body ?? {};          // req.body is undefined if no body was sent
  if (!isValidTitle(title)) {
    return res.status(400).json({ error: 'title must be 1-200 characters' });   // 400 = client error
  }
  // RETURNING sends back the inserted row, so no second SELECT is needed.
  const result = await pool.query(
    'INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, status, created_at',
    [title.trim()]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/tasks/:id  body: {"status": "done"} -> change a task's status.
// 200 + updated task, 400 bad input, 404 no task with that id.
app.put('/api/tasks/:id', async (req, res) => {
  const id = parseId(req.params.id);         // :id from the URL, e.g. /api/tasks/3
  const { status } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'invalid id' });
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: "status must be 'todo' or 'done'" });
  }
  const result = await pool.query(
    'UPDATE tasks SET status = $1 WHERE id = $2 RETURNING id, title, status, created_at',
    [status, id]
  );
  // rowCount = how many rows were changed. 0 means the id does not exist.
  if (result.rowCount === 0) return res.status(404).json({ error: 'task not found' });
  res.json(result.rows[0]);
});

// DELETE /api/tasks/:id -> delete a task. 204 No Content, 400 bad id, 404 not found.
app.delete('/api/tasks/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'task not found' });
  res.status(204).end();
});

// ---------- Error handling ----------

// Any /api/... URL that matched no route above -> JSON 404 (instead of an HTML page).
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// Central error handler (Express knows it is one because it has 4 parameters).
// Express 5 automatically forwards errors thrown in async routes here - e.g. when
// the db is down. The real details go to the LOG; the client only gets a generic
// message, because table names / SQL / stack traces would help attackers.
// ("next" is unused, but must be listed - Express counts the parameters.)
app.use((err, req, res, next) => {
  console.error(`ERROR ${req.method} ${req.path}: ${err.message}`);
  // Client mistakes (e.g. 400 malformed JSON, 413 body too large) keep their 4xx code;
  // everything else is a 500 Internal Server Error.
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'internal server error' : 'bad request' });
});

// ---------- Startup ----------

let server;   // the HTTP server - set once we start listening

async function start() {
  try {
    // Wait for the db BEFORE accepting traffic (see db.js for the retry logic).
    await connectWithRetry();
  } catch (err) {
    console.error(`FATAL: ${err.message}. Exiting.`);
    // Exit code 1 = "failed". Docker's restart policy will start a fresh container,
    // and the reason stays visible in "docker compose logs app".
    process.exit(1);
  }
  server = app.listen(PORT, () => console.log(`TaskVault app listening on port ${PORT}`));
}

// ---------- Graceful shutdown ----------
// "docker compose stop" sends SIGTERM ("please stop"). If we ignored it, Docker
// would wait 10 s and then SIGKILL us (hard kill, requests cut in half).
// Instead: stop accepting new requests, let running ones finish, close db, exit.
// This only works because the Dockerfile starts "node" directly (it is PID 1),
// not via "npm start" - npm does not reliably pass signals on.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  if (!server) process.exit(0);          // still starting up - nothing to clean up
  server.close(async () => {             // runs once all open requests are finished
    await pool.end();                    // close all db connections cleanly
    console.log('Shutdown complete');
    process.exit(0);                     // exit code 0 = clean exit
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));   // sent by Docker
process.on('SIGINT', () => shutdown('SIGINT'));     // Ctrl+C when running locally

start();
