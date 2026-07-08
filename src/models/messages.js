const { db } = require('../db');

function create({ ticket_id, sender_type, sender_id = null, body, is_ai_draft = false }) {
  const info = db
    .prepare(
      `INSERT INTO messages (ticket_id, sender_type, sender_id, body, is_ai_draft)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(ticket_id, sender_type, sender_id, body, is_ai_draft ? 1 : 0);
  return findById(info.lastInsertRowid);
}

function findById(id) {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

function listForTicket(ticket_id) {
  return db
    .prepare(
      `SELECT m.*, u.name AS sender_name
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = ? ORDER BY m.created_at ASC, m.id ASC`
    )
    .all(ticket_id);
}

function listSince(ticket_id, afterId) {
  return db
    .prepare(
      `SELECT m.*, u.name AS sender_name
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = ? AND m.id > ? ORDER BY m.id ASC`
    )
    .all(ticket_id, afterId || 0);
}

function markSent(id) {
  db.prepare('UPDATE messages SET is_ai_draft = 0 WHERE id = ?').run(id);
}

function findByMessageId(message_id) {
  return db.prepare('SELECT * FROM messages WHERE message_id = ?').get(message_id);
}

function setMessageId(id, message_id) {
  db.prepare('UPDATE messages SET message_id = ? WHERE id = ?').run(message_id, id);
}

function updateBody(id, body) {
  db.prepare('UPDATE messages SET body = ? WHERE id = ?').run(body, id);
}

function remove(id) {
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

module.exports = { create, findById, listForTicket, listSince, markSent, updateBody, remove, findByMessageId, setMessageId };
