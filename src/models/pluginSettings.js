const { db } = require('../db');

async function get(plugin_name) {
  return db.prepare('SELECT * FROM plugin_settings WHERE plugin_name = ?').get(plugin_name);
}

async function listAll() {
  return db.prepare('SELECT * FROM plugin_settings').all();
}

async function upsert(plugin_name, { config_json, enabled }) {
  await db.prepare(
    `INSERT INTO plugin_settings (plugin_name, config_json, enabled) VALUES (?, ?, ?)
     ON CONFLICT(plugin_name) DO UPDATE SET config_json = excluded.config_json, enabled = excluded.enabled`
  ).run(plugin_name, config_json, enabled ? 1 : 0);
}

module.exports = { get, listAll, upsert };
