const { db } = require('../db');

async function count() {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM users').get();
  return row.c;
}

async function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

async function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function listAll() {
  return db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at ASC').all();
}

async function create({ name, email, password_hash, role }) {
  const info = await db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email.toLowerCase(), password_hash, role);
  return findById(info.lastInsertRowid);
}

async function setActive(id, active) {
  await db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

async function updateRole(id, role) {
  await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

async function listSupporters() {
  return db
    .prepare("SELECT id, name, email FROM users WHERE active = 1 ORDER BY name ASC")
    .all();
}

module.exports = { count, findByEmail, findById, listAll, create, setActive, updateRole, listSupporters };
