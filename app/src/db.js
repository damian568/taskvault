// db.js - everything about talking to PostgreSQL, in one place.

// "pg" is the PostgreSQL client library. Pool = a set of reusable connections.
const { Pool } = require('pg');

// All settings come from environment variables (set by docker-compose.yml from .env).
const DB_HOST = process.env.DB_HOST;                  // "db" = Compose service name
const DB_PORT = Number(process.env.DB_PORT) || 5432;  // PostgreSQL default port

// A pool keeps a few connections open and reuses them (faster, protects the db).
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,          // the LIMITED app user, never the superuser
  password: process.env.DB_PASSWORD,  // never logged
  max: 5,                             // at most 5 open connections
  connectionTimeoutMillis: 5000,      // give up connecting after 5 s
  query_timeout: 5000,                // give up waiting for a query after 5 s
});

// If an idle connection breaks, log it. Without a listener Node would crash.
pool.on('error', (err) => {
  console.error(`ERROR: idle database connection lost: ${err.message}`);
});

// Turn driver errors into short log lines. All timeouts -> "connection timeout".
function describe(err) {
  if (/timeout/i.test(err.message)) return 'connection timeout';
  return err.message || err.code || 'unknown error';   // AggregateError has an empty message
}

// Wait for ms milliseconds.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Called once at startup. Try up to maxAttempts times, waiting delayMs between tries.
async function connectWithRetry(maxAttempts = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Connecting to database ${DB_HOST}:${DB_PORT} (attempt ${attempt}/${maxAttempts})...`);
    try {
      await pool.query('SELECT 1');   // cheapest "are you there?" query
      console.log('Database connection OK');
      return;
    } catch (err) {
      console.error(`ERROR: ${describe(err)}`);
      if (attempt < maxAttempts) {
        console.log(`Retrying in ${delayMs / 1000}s...`);
        await sleep(delayMs);
      }
    }
  }
  throw new Error(`Could not connect to database after ${maxAttempts} attempts`);
}

// Give server.js access to the pool and the retry function.
module.exports = { pool, connectWithRetry };
