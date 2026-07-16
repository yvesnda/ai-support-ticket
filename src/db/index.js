const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'supporter.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const raw = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastInsertRowid: this.lastID });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    raw.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// sqlite3 has no synchronous API, so every model in this app is async. This
// shim keeps the familiar `db.prepare(sql).get(...)` shape (just Promise-
// returning now) rather than a real cached prepared statement — this app
// never reuses a statement often enough for that to matter.
const db = {
  prepare(sql) {
    return {
      get: (...params) => get(sql, params),
      all: (...params) => all(sql, params),
      run: (...params) => run(sql, params),
    };
  },
  exec,
};

async function init() {
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec('PRAGMA foreign_keys = ON');
}

async function runMigrations() {
  await db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const appliedRows = await db.prepare('SELECT name FROM migrations').all();
  const applied = new Set(appliedRows.map((r) => r.name));
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // Some migrations recreate a table that others reference by foreign key
    // (SQLite has no ALTER TABLE for constraint changes). FK enforcement can
    // only be toggled outside a transaction, so it wraps the BEGIN/COMMIT.
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec('BEGIN');
    try {
      await db.exec(sql);
      await db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
      await db.exec('COMMIT');
      console.log(`[db] applied migration ${file}`);
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

module.exports = { db, init, runMigrations };
