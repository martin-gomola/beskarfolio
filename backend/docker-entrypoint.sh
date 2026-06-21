#!/bin/bash
# Reconcile container's appuser uid/gid with PUID/PGID env vars so that
# the bind-mounted /app/data volume is writable. Without this step, the
# host-owned data files (written by the cron job that runs as the host
# user) cannot be overwritten by the in-container process, and price
# updates triggered from the UI silently fail to persist.
#
# Behavior:
#   - If PUID/PGID match the existing appuser/appgroup, do nothing.
#   - If they differ, usermod/groupmod and fix ownership of writable dirs.
#   - If PUID/PGID are unset, fall back to whoever currently owns /app/data
#     on the bind mount, so users who only set up a volume (no env vars)
#     still get the right behavior.
set -euo pipefail

DATA_DIR="/app/data"

# Determine target uid/gid, in order of precedence:
#   1. Explicit PUID / PGID env vars
#   2. Owner of /app/data (host bind mount)
#   3. Default 1000:1000 (image default)
if [ -n "${PUID:-}" ]; then
    TARGET_UID="$PUID"
elif [ -d "$DATA_DIR" ]; then
    TARGET_UID="$(stat -c '%u' "$DATA_DIR")"
else
    TARGET_UID=1000
fi

if [ -n "${PGID:-}" ]; then
    TARGET_GID="$PGID"
elif [ -d "$DATA_DIR" ]; then
    TARGET_GID="$(stat -c '%g' "$DATA_DIR")"
else
    TARGET_GID=1000
fi

CURRENT_UID="$(id -u appuser)"
CURRENT_GID="$(id -g appuser)"

if [ "$CURRENT_GID" != "$TARGET_GID" ]; then
    echo "[entrypoint] aligning appgroup gid: $CURRENT_GID -> $TARGET_GID"
    groupmod -o -g "$TARGET_GID" appgroup
fi

if [ "$CURRENT_UID" != "$TARGET_UID" ]; then
    echo "[entrypoint] aligning appuser uid: $CURRENT_UID -> $TARGET_UID"
    usermod -o -u "$TARGET_UID" -g "$TARGET_GID" appuser
fi

# Make sure writable dirs are owned by the (possibly new) appuser.
# Skip /app/data ownership rewrite when the host volume already matches —
# chowning a large host directory can be slow on first start.
chown -R appuser:appgroup /app/logs /app/config 2>/dev/null || true
if [ -d "$DATA_DIR" ]; then
    OWNER_UID="$(stat -c '%u' "$DATA_DIR")"
    if [ "$OWNER_UID" != "$TARGET_UID" ]; then
        echo "[entrypoint] chown $DATA_DIR -> appuser:appgroup"
        chown -R appuser:appgroup "$DATA_DIR" || true
    fi
fi

echo "[entrypoint] starting as appuser ($(id -u appuser):$(id -g appuser))"
exec gosu appuser "$@"
