const { db } = require('../db');

function count() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listAll() {
  return db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at ASC').all();
}

function create({ name, email, password_hash, role }) {
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email.toLowerCase(), password_hash, role);
  return findById(info.lastInsertRowid);
}

function setActive(id, active) {
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

function updateRole(id, role) {
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

function listSupporters() {
  return db
    .prepare("SELECT id, name, email FROM users WHERE active = 1 ORDER BY name ASC")
    .all();
}

module.exports = { count, findByEmail, findById, listAll, create, setActive, updateRole, listSupporters };
