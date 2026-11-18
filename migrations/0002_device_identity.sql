-- Kanso no longer has sign-in for now. Each browser is identified by an opaque
-- device id kept in an httpOnly cookie; the row in `users` is a guest identity.

ALTER TABLE users ADD COLUMN device_id TEXT;
ALTER TABLE users ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device ON users(device_id);

-- Exactly one workspace is shared by every guest browser that opens the app.
ALTER TABLE workspaces ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_workspaces_shared ON workspaces(is_shared);
