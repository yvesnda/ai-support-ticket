-- Replace the open/pending/resolved/closed pipeline with tags that reflect who
-- acted last: open (customer is waiting on a reply), ai_replied (AI sent a
-- reply autonomously), replied (a supporter sent/approved a reply), closed.
CREATE TABLE tickets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ai_replied', 'replied', 'closed')),
  assigned_to INTEGER REFERENCES users(id),
  source_plugin TEXT,
  external_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO tickets_new (id, subject, customer_name, customer_email, channel, status, assigned_to, source_plugin, external_ref, created_at, updated_at)
SELECT id, subject, customer_name, customer_email, channel,
  CASE status
    WHEN 'pending' THEN 'ai_replied'
    WHEN 'resolved' THEN 'closed'
    ELSE status
  END,
  assigned_to, source_plugin, external_ref, created_at, updated_at
FROM tickets;

DROP TABLE tickets;
ALTER TABLE tickets_new RENAME TO tickets;

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_external_ref ON tickets(external_ref);
