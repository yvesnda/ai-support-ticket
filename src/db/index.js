const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'supporter.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(db.prepare('SELECT name FROM migrations').all().map((r) => r.name));
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // Some migrations recreate a table that others reference by foreign key
    // (SQLite has no ALTER TABLE for constraint changes). FK enforcement can
    // only be toggled outside a transaction, so it wraps the BEGIN/COMMIT.
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
      console.log(`[db] applied migration ${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}

module.exports = { db, runMigrations };
