-- Kanso has no accounts any more, so two things have to change:
--   1. the rows that only existed for sign-in (cookie sessions, a password hash,
--      an email unique key) should not linger in the schema;
--   2. the shared workspace must not belong to whichever browser arrived first,
--      because clearing that browser's cookie would leave it with no manager at
--      all: every later guest joined as `member` and nobody could change a role
--      or retire the stale guest row.
--
-- After this migration the shared workspace is owned by a system identity, and
-- every guest joins it as an equal admin. No browser can own it, so no browser
-- going away can break it.

DROP TABLE IF EXISTS sessions;

ALTER TABLE users DROP COLUMN password_hash;

-- `email` carried the account's UNIQUE constraint, and SQLite refuses to drop a
-- UNIQUE column, so the table is rebuilt: create the replacement, copy, swap. The
-- migration runner applies files with foreign-key enforcement off and runs
-- `PRAGMA foreign_key_check` before recording them, which is what makes a
-- parent-table swap like this safe — no cascade fires on the temporary drop, and
-- a broken reference would fail the migration instead of committing.
CREATE TABLE users_next (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  device_id  TEXT,
  is_system  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO users_next (id, name, created_at, device_id, is_system)
  SELECT id, name, created_at, device_id, 0 FROM users;

DROP TABLE users;
ALTER TABLE users_next RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_system ON users(is_system);

-- The tenant itself owns the shared workspace. Its id is a constant because
-- `lib/repo/workspaces.ts` looks the row up by it.
INSERT OR IGNORE INTO users (id, name, created_at, device_id, is_system)
  VALUES (
    'usr_shared_owner',
    'Kanso workspace',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    NULL,
    1
  );

-- Whoever happened to be first is now an ordinary admin like every other guest.
UPDATE workspace_members
   SET role = 'admin'
 WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_shared = 1)
   AND role <> 'admin';

UPDATE workspaces
   SET owner_id = 'usr_shared_owner'
 WHERE is_shared = 1;

INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at)
  SELECT id, 'usr_shared_owner', 'owner', created_at
    FROM workspaces
   WHERE is_shared = 1;
