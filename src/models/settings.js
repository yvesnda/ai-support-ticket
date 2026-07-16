const { db } = require('../db');

const DEFAULTS = {
  ai_enabled: 'true',
  ai_system_prompt:
    "You are a helpful customer support assistant. Read the whole conversation so far and answer the customer's latest message clearly and concisely. Use tools when they help you find accurate information.\n\n" +
    "If you cannot understand what the customer wants, or you don't have enough information or tools to actually help them, do not guess or make up an answer. Instead, honestly tell them you're not sure you understand or that you can't help with this, and let them know a member of the support team will follow up.\n\n" +
    'If the customer\'s issue is fully resolved — they confirm the problem is fixed, or you have completely answered their question and there is nothing left to help with — write your final reply and then call the close_ticket tool.',
  ai_model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  ai_auto_send: 'false',
};

async function get(key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULTS[key] ?? null;
}

async function getAll() {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

async function set(key, value) {
  await db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

async function setMany(obj) {
  await db.exec('BEGIN');
  try {
    for (const [k, v] of Object.entries(obj)) await set(k, v);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { get, getAll, set, setMany, DEFAULTS };
