const { db } = require('../db');

async function list() {
  return db.prepare('SELECT * FROM ai_tools ORDER BY name ASC').all();
}

async function listEnabled() {
  return db.prepare('SELECT * FROM ai_tools WHERE enabled = 1 ORDER BY name ASC').all();
}

async function findById(id) {
  return db.prepare('SELECT * FROM ai_tools WHERE id = ?').get(id);
}

async function create({ name, description, type, schema_json, config_json }) {
  const info = await db
    .prepare(
      `INSERT INTO ai_tools (name, description, type, schema_json, config_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, description, type, schema_json, config_json);
  return findById(info.lastInsertRowid);
}

async function update(id, { name, description, type, schema_json, config_json }) {
  await db.prepare(
    `UPDATE ai_tools SET name = ?, description = ?, type = ?, schema_json = ?, config_json = ? WHERE id = ?`
  ).run(name, description, type, schema_json, config_json, id);
}

async function setEnabled(id, enabled) {
  await db.prepare('UPDATE ai_tools SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

async function remove(id) {
  await db.prepare('DELETE FROM ai_tools WHERE id = ?').run(id);
}

module.exports = { list, listEnabled, findById, create, update, setEnabled, remove };
