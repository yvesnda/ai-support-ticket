const { db } = require('../db');

async function create({ subject, customer_name, customer_email, channel = 'web', source_plugin = null, external_ref = null }) {
  const info = await db
    .prepare(
      `INSERT INTO tickets (subject, customer_name, customer_email, channel, source_plugin, external_ref)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(subject, customer_name, customer_email, channel, source_plugin, external_ref);
  return findById(info.lastInsertRowid);
}

async function findById(id) {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
}

async function findByExternalRef(external_ref) {
  return db.prepare('SELECT * FROM tickets WHERE external_ref = ?').get(external_ref);
}

async function list({ status, assigned_to } = {}) {
  let sql = `SELECT t.*, u.name AS assigned_name
             FROM tickets t LEFT JOIN users u ON u.id = t.assigned_to WHERE 1=1`;
  const params = [];
  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (assigned_to) {
    sql += ' AND t.assigned_to = ?';
    params.push(assigned_to);
  }
  sql += ' ORDER BY t.updated_at DESC';
  return db.prepare(sql).all(...params);
}

async function touch(id) {
  await db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(id);
}

async function setStatus(id, status) {
  await db.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

async function setAssignee(id, userId) {
  await db.prepare("UPDATE tickets SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?").run(userId, id);
}

module.exports = { create, findById, findByExternalRef, list, touch, setStatus, setAssignee };
