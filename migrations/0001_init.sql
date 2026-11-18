BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at   TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS apps (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  template     TEXT NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apps_workspace ON apps(workspace_id);

CREATE TABLE IF NOT EXISTS app_pages (
  id     TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  key    TEXT NOT NULL,
  title  TEXT NOT NULL,
  icon   TEXT NOT NULL DEFAULT 'circle',
  sort   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (app_id, key)
);

CREATE TABLE IF NOT EXISTS app_records (
  id              TEXT PRIMARY KEY,
  app_id          TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('task', 'note')),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT CHECK (status IN ('todo', 'in_progress', 'done')),
  priority        TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date        TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  assignee_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_app ON app_records(app_id, kind);
CREATE INDEX IF NOT EXISTS idx_records_status ON app_records(app_id, status);
CREATE INDEX IF NOT EXISTS idx_records_due ON app_records(app_id, due_date);

-- The shared, generated interface for an application (the base experience).
CREATE TABLE IF NOT EXISTS interface_definitions (
  id         TEXT PRIMARY KEY,
  app_id     TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  page_key   TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (app_id, page_key)
);

-- One personal interface document per user per application.
CREATE TABLE IF NOT EXISTS user_interfaces (
  id         TEXT PRIMARY KEY,
  app_id     TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document   TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (app_id, user_id)
);

CREATE TABLE IF NOT EXISTS interface_revisions (
  id                TEXT PRIMARY KEY,
  user_interface_id TEXT NOT NULL REFERENCES user_interfaces(id) ON DELETE CASCADE,
  app_id            TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('init', 'ai', 'manual', 'restore', 'undo')),
  label             TEXT NOT NULL,
  document          TEXT NOT NULL,
  operations        TEXT NOT NULL DEFAULT '[]',
  ai_request_id     TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_interface
  ON interface_revisions(user_interface_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_requests (
  id                 TEXT PRIMARY KEY,
  app_id             TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt             TEXT NOT NULL,
  provider           TEXT NOT NULL,
  model              TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('proposed', 'applied', 'discarded', 'failed')),
  summary            TEXT NOT NULL DEFAULT '',
  message            TEXT NOT NULL DEFAULT '',
  operations         TEXT NOT NULL DEFAULT '[]',
  warnings           TEXT NOT NULL DEFAULT '[]',
  proposed_document  TEXT,
  base_document      TEXT,
  error              TEXT,
  latency_ms         INTEGER,
  tokens_in          INTEGER,
  tokens_out         INTEGER,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_requests_app ON ai_requests(app_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket ON rate_limit_events(bucket, created_at);

COMMIT;
