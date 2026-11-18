#!/bin/sh
# Applies migrations to the database on the persistent disk, then serves the app.
# Runs as root only long enough to claim the mount; the server runs as `kanso`.
set -eu

DB_PATH="${DATABASE_PATH:-/var/data/kanso.db}"
DATA_DIR="$(dirname "$DB_PATH")"
PORT="${PORT:-3000}"

mkdir -p "$DATA_DIR"

if [ "$(id -u)" -eq 0 ]; then
  chown -R kanso:kanso "$DATA_DIR"
  exec setpriv --reuid=kanso --regid=kanso --init-groups -- \
    sh -c "node scripts/migrate.mjs && exec ./node_modules/.bin/next start -p ${PORT} -H 0.0.0.0"
fi

exec sh -c "node scripts/migrate.mjs && exec ./node_modules/.bin/next start -p ${PORT} -H 0.0.0.0"
