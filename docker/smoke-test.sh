#!/usr/bin/env bash
# Local Docker smoke test for the Kanso production image.
#
#   bash docker/smoke-test.sh
#
# Builds the image, runs it against a named volume, checks /api/health, writes a
# guest identity + workspace through the app, restarts the container, and
# verifies the SQLite rows on the volume survived. Exits non-zero on failure and
# leaves the container/volume in place for inspection.
set -euo pipefail

IMAGE="${IMAGE:-kanso:test}"
NAME="${NAME:-kanso-test}"
VOLUME="${VOLUME:-kanso-data}"
# Deliberately not named PORT: some shells export PORT for their own use (this
# machine exports PORT=0), which would publish a random host port.
HOST_PORT="${HOST_PORT:-3211}"
BASE="http://127.0.0.1:${HOST_PORT}"

# Git Bash on Windows does not refresh PATH for shells started before install.
if ! command -v docker >/dev/null 2>&1; then
  PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
  export PATH
fi

# Git Bash rewrites arguments that look like POSIX paths, turning container
# paths such as /var/data/kanso.db into C:/Users/... before docker.exe sees them.
# It is disabled per docker call rather than exported, because a global setting
# also stops curl's native Windows binary from resolving /dev/null.

fail() {
  echo "FAIL: $*" >&2
  echo "--- last 60 log lines ---" >&2
  docker logs --tail 60 "$NAME" >&2 2>&1 || true
  exit 1
}

wait_healthy() {
  local label="$1" code i
  for i in $(seq 1 90); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/health" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then
      echo "  ${label}: /api/health -> 200 after $((i * 2))s"
      return 0
    fi
    sleep 2
  done
  return 1
}

# Row counts straight from the SQLite file on the mounted volume.
counts() {
  docker exec "$NAME" node -e '
    const Database = require("better-sqlite3");
    const db = new Database(process.env.DATABASE_PATH || "/var/data/kanso.db", { readonly: true });
    const tables = db.prepare("select name from sqlite_master where type = ? order by name").all("table").map((t) => t.name);
    const out = {};
    for (const t of ["users", "workspaces", "workspace_members", "apps", "app_records", "schema_migrations"]) {
      if (tables.includes(t)) out[t] = db.prepare(`select count(*) c from ${t}`).get().c;
    }
    console.log(JSON.stringify(out));
  '
}

# Per-table difference between two counts() payloads.
delta() {
  node -e '
    const [a, b] = process.argv.slice(1).map((s) => JSON.parse(s));
    const out = {};
    for (const k of Object.keys(b)) {
      if (typeof b[k] === "number" && b[k] !== (a[k] || 0)) out[k] = b[k] - (a[k] || 0);
    }
    console.log(JSON.stringify(out));
  ' "$1" "$2"
}

# GET /dashboard as a given device. Production cookies are Secure, so the id is
# sent as a header rather than through a curl cookie jar over plain http.
dashboard_status() {
  curl -s -o /dev/null -w '%{http_code}' -H "Cookie: kanso_device=$1" "${BASE}/dashboard"
}

echo "== 1/7 engine =="
docker info --format '  server {{.ServerVersion}} / {{.OSType}}/{{.Architecture}}' \
  || fail "docker engine is not responding"

echo "== 2/7 clean slate =="
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker volume rm "$VOLUME" >/dev/null 2>&1 || true
echo "  removed any previous $NAME container and $VOLUME volume"

echo "== 3/7 build =="
docker build -t "$IMAGE" . || fail "image build failed"

echo "== 4/7 run with named volume =="
MSYS_NO_PATHCONV=1 docker run -d --name "$NAME" \
  -p "${HOST_PORT}:3000" \
  -e PORT=3000 \
  -e DATABASE_PATH=/var/data/kanso.db \
  -v "${VOLUME}:/var/data" \
  "$IMAGE" >/dev/null

# Trust the engine's own mapping rather than the requested port.
MAPPED_PORT="$(docker port "$NAME" 3000/tcp | head -1 | sed -E 's/.*:([0-9]+)$/\1/')"
echo "  published port: ${MAPPED_PORT} (requested ${HOST_PORT})"
[ -n "$MAPPED_PORT" ] || fail "no published port for container port 3000"
[ "$MAPPED_PORT" = "$HOST_PORT" ] || fail "host port ${HOST_PORT} was remapped to ${MAPPED_PORT}"
BASE="http://127.0.0.1:${MAPPED_PORT}"

wait_healthy "cold start" || fail "health never returned 200 after start"

# docker exec runs as the image's default user (root); the server itself is
# PID 1, which the entrypoint re-execs as kanso.
RUN_UID="$(docker exec "$NAME" sh -c 'awk "/^Uid:/{print \$2}" /proc/1/status')"
RUN_USER="$(docker exec "$NAME" sh -c "id -un ${RUN_UID} 2>/dev/null || echo uid:${RUN_UID}")"
echo "  server user: ${RUN_USER} (uid ${RUN_UID}, expected kanso)"
[ "$RUN_USER" = "kanso" ] || fail "server is not running as the unprivileged kanso user"

echo "== 5/7 create data through the app =="
# A freshly migrated database only holds the migration-seeded system owner, so
# the guest flow below is what proves the volume accepts writes.
BASE_COUNTS="$(counts)"
echo "  before requests : $BASE_COUNTS"

HDR_FILE="$(mktemp)"
DEVICE_STATUS="$(curl -s -D "$HDR_FILE" -o /dev/null -w '%{http_code}' "${BASE}/api/device")"
DEVICE_ID="$(grep -i '^set-cookie' "$HDR_FILE" | sed -nE 's/.*kanso_device=([a-f0-9]{32}).*/\1/p' | head -1)"
rm -f "$HDR_FILE"
echo "  /api/device -> ${DEVICE_STATUS}, device id ${DEVICE_ID:-<none>}"
[ "$DEVICE_STATUS" = "307" ] || fail "expected 307 from /api/device, got $DEVICE_STATUS"
printf '%s' "$DEVICE_ID" | grep -qE '^[a-f0-9]{32}$' || fail "no kanso_device cookie was minted"

DASH_CODE="$(dashboard_status "$DEVICE_ID")"
echo "  /dashboard  -> ${DASH_CODE}"
[ "$DASH_CODE" = "200" ] || fail "expected 200 from /dashboard, got $DASH_CODE"

CREATED_COUNTS="$(counts)"
echo "  after  requests : $CREATED_COUNTS"
echo "  delta           : $(delta "$BASE_COUNTS" "$CREATED_COUNTS")"
[ "$CREATED_COUNTS" != "$BASE_COUNTS" ] || fail "the app wrote nothing to the volume"
echo "$CREATED_COUNTS" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const c = JSON.parse(s);
    if (!(c.users >= 2)) { console.error("expected >= 2 users after the guest flow, got " + c.users); process.exit(1); }
    if (!(c.workspaces >= 1)) { console.error("expected >= 1 workspace after the guest flow, got " + c.workspaces); process.exit(1); }
  });
' || fail "the guest identity did not create its user/workspace rows"

echo "== 6/7 restart container =="
docker restart "$NAME" >/dev/null
wait_healthy "after restart" || fail "health never returned 200 after restart"

POST_RESTART_DASH="$(dashboard_status "$DEVICE_ID")"
echo "  /dashboard as the same guest -> ${POST_RESTART_DASH}"
[ "$POST_RESTART_DASH" = "200" ] || fail "the guest identity stopped resolving after the restart"

AFTER_COUNTS="$(counts)"
echo "  before restart  : $CREATED_COUNTS"
echo "  after  restart  : $AFTER_COUNTS"
[ "$CREATED_COUNTS" = "$AFTER_COUNTS" ] || fail "database contents changed across restart"

echo "== 7/7 files on the volume =="
MSYS_NO_PATHCONV=1 docker run --rm --entrypoint ls -v "${VOLUME}:/var/data" "$IMAGE" -la /var/data

echo
echo "PASS: image built, served /api/health, and kept its data across a restart."
echo "Clean up with:  docker rm -f $NAME && docker volume rm $VOLUME"
