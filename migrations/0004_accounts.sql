-- Accounts return, but additively: a guest row can be claimed in place, keeping
-- its id so every membership, personal interface and revision keeps pointing at
-- the same user. Rows that are never claimed stay guests with NULL credentials.
--
-- No table is rebuilt here, so this migration rewrites no data: it adds columns
-- and a partial unique index (guests all share NULL, and SQLite allows repeated
-- NULLs in a unique index) plus the session table used to recognise a returning
-- browser on a different device.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON users(email) WHERE email IS NOT NULL;

-- Only the SHA-256 of the cookie token is stored, so a leaked database file
-- cannot be replayed as a live session.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
