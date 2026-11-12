// =============================================================================
// db.js - everything about talking to PostgreSQL, in one place.
//   1. Creates a connection POOL that the rest of the app uses for queries.
//   2. Provides connectWithRetry(), called once at startup.
// =============================================================================

// "pg" (node-postgres) is the PostgreSQL client library. Pool = connection pool.
const { Pool } = require('pg');

// All settings come from ENVIRONMENT VARIABLES (set by docker-compose.yml from .env).
// Nothing is hard-coded, so the same code runs locally, in test or in production.
const DB_HOST = process.env.DB_HOST;                 // "db" = the Compose service name, resolved by Docker's DNS
const DB_PORT = Number(process.env.DB_PORT) || 5432; // 5432 = PostgreSQL's default port

// A POOL keeps a few database connections open and REUSES them.
// Opening a new connection for every HTTP request would be slow
// (TCP handshake + authentication) and could overload the database.
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,          // the LIMITED app user - never the superuser
  password: process.env.DB_PASSWORD,  // never logged anywhere
  max: 5,                             // at most 5 open connections - protects the db
  connectionTimeoutMillis: 5000,      // give up CONNECTING after 5 s instead of hanging
  query_timeout: 5000,                // give up waiting for a QUERY after 5 s (e.g. frozen db)
});

// If an IDLE connection inside the pool breaks (e.g. the db restarted), pg emits
// an 'error' event. In Node an 'error' event nobody listens to CRASHES the process,
// so we listen and just log it. The pool opens a fresh connection next time.
pool.on('error', (err) => {
  console.error(`ERROR: idle database connection lost: ${err.message}`);
});

// Turn low-level driver errors into short, readable log lines.
// All timeout variants become "connection timeout"; anything else is shown as-is
// (e.g. "getaddrinfo ENOTFOUND db" = DNS problem, "connect ECONNREFUSED" = nothing listening).
function describe(err) {
  if (/timeout/i.test(err.message)) return 'connection timeout';
  return err.message;
}

// Helper: wait for the given number of milliseconds (used between retries).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Called ONCE at startup by server.js.
// Tries to reach the database up to maxAttempts times, waiting delayMs between tries.
// WHY retry? The db may be restarting or still initialising - short (transient)
// failures are normal, especially in the cloud. Retrying is cheap resilience.
// WHY give up eventually? If the db is really broken, retrying forever hides the
// problem. We throw, server.js exits with code 1, and Docker restarts the container.
async function connectWithRetry(maxAttempts = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Connecting to database ${DB_HOST}:${DB_PORT} (attempt ${attempt}/${maxAttempts})...`);
    try {
      await pool.query('SELECT 1');   // cheapest possible "are you there?" query
      console.log('Database connection OK');
      return;                         // success - stop retrying
    } catch (err) {
      console.error(`ERROR: ${describe(err)}`);
      if (attempt < maxAttempts) {
        console.log(`Retrying in ${delayMs / 1000}s...`);
        await sleep(delayMs);
      }
    }
  }
  // All attempts failed - let the caller (server.js) decide what to do.
  throw new Error(`Could not connect to database after ${maxAttempts} attempts`);
}

// Make the pool and the retry function available to server.js via require('./db').
module.exports = { pool, connectWithRetry };
