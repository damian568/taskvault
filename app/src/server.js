// server.js - the TaskVault web application (entry point).

const path = require('path');                          // builds file paths safely
const express = require('express');                    // web framework
const { pool, connectWithRetry } = require('./db');    // our db module

// Port inside the container. Only nginx talks to it.
const PORT = Number(process.env.PORT) || 3000;
const app = express();

// ---------- Middleware (runs for every request, top to bottom) ----------

// Don't tell attackers we use Express.
app.disable('x-powered-by');

// Read JSON bodies into req.body. Reject bodies over 10 KB.
app.use(express.json({ limit: '10kb' }));

// Serve files from public/ ("/" -> index.html).
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Input validation helpers ----------

// The only allowed states (the db enforces the same rule with CHECK).
const STATUSES = ['todo', 'done'];

// Only positive whole numbers are valid ids. Anything else -> null.
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// A valid title is a string with 1-200 characters after trimming spaces.
function isValidTitle(title) {
  return typeof title === 'string' && title.trim().length >= 1 && title.trim().length <= 200;
}

// ---------- Health check (used by Docker) ----------
// 200 = the app AND the db work. 503 = db unreachable.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'reachable' });
  } catch (err) {
    console.error(`Health check failed: ${err.message}`);
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

// ---------- REST API ----------
// SECURITY: $1, $2 placeholders -> values are sent separately -> no SQL injection.

// GET /api/tasks -> all tasks, newest first.
app.get('/api/tasks', async (req, res) => {
  const result = await pool.query(
    'SELECT id, title, status, created_at FROM tasks ORDER BY created_at DESC, id DESC'
  );
  res.json(result.rows);
});

// POST /api/tasks  {"title": "..."} -> 201 + new task, or 400.
app.post('/api/tasks', async (req, res) => {
  const { title } = req.body ?? {};
  if (!isValidTitle(title)) {
    return res.status(400).json({ error: 'title must be 1-200 characters' });
  }
  const result = await pool.query(
    'INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, status, created_at',
    [title.trim()]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/tasks/:id  {"status": "done"} -> 200, 400 or 404.
app.put('/api/tasks/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { status } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'invalid id' });
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: "status must be 'todo' or 'done'" });
  }
  const result = await pool.query(
    'UPDATE tasks SET status = $1 WHERE id = $2 RETURNING id, title, status, created_at',
    [status, id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'task not found' });
  res.json(result.rows[0]);
});

// DELETE /api/tasks/:id -> 204, 400 or 404.
app.delete('/api/tasks/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'task not found' });
  res.status(204).end();
});

// ---------- Error handling ----------

// Unknown /api/... URL -> JSON 404.
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// Central error handler (4 parameters). Details go to the log,
// the client only gets a generic message.
app.use((err, req, res, next) => {
  console.error(`ERROR ${req.method} ${req.path}: ${err.message}`);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'internal server error' : 'bad request' });
});

// ---------- Startup ----------

let server;

async function start() {
  try {
    await connectWithRetry();     // wait for the db BEFORE accepting traffic
  } catch (err) {
    console.error(`FATAL: ${err.message}. Exiting.`);
    process.exit(1);              // Docker restarts the container
  }
  server = app.listen(PORT, () => console.log(`TaskVault app listening on port ${PORT}`));
}

// ---------- Graceful shutdown ----------
// Docker sends SIGTERM: stop new requests, finish running ones, close db, exit.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  if (!server) process.exit(0);
  server.close(async () => {
    await pool.end();
    console.log('Shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));   // from Docker
process.on('SIGINT', () => shutdown('SIGINT'));     // Ctrl+C locally

start();
