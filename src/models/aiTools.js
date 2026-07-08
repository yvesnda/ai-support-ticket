const { db } = require('../db');

function list() {
  return db.prepare('SELECT * FROM ai_tools ORDER BY name ASC').all();
}

function listEnabled() {
  return db.prepare('SELECT * FROM ai_tools WHERE enabled = 1 ORDER BY name ASC').all();
}

function findById(id) {
  return db.prepare('SELECT * FROM ai_tools WHERE id = ?').get(id);
}

function create({ name, description, type, schema_json, config_json }) {
  const info = db
    .prepare(
      `INSERT INTO ai_tools (name, description, type, schema_json, config_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, description, type, schema_json, config_json);
  return findById(info.lastInsertRowid);
}

function update(id, { name, description, type, schema_json, config_json }) {
  db.prepare(
    `UPDATE ai_tools SET name = ?, description = ?, type = ?, schema_json = ?, config_json = ? WHERE id = ?`
  ).run(name, description, type, schema_json, config_json, id);
}

function setEnabled(id, enabled) {
  db.prepare('UPDATE ai_tools SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

function remove(id) {
  db.prepare('DELETE FROM ai_tools WHERE id = ?').run(id);
}

module.exports = { list, listEnabled, findById, create, update, setEnabled, remove };
