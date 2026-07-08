ALTER TABLE messages ADD COLUMN message_id TEXT;
CREATE INDEX idx_messages_message_id ON messages(message_id);
