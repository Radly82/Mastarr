#!/bin/sh
set -e

PUID="${PUID:-99}"
PGID="${PGID:-100}"

# Resolve the node binary path and app directory.
NODE_BIN="/usr/local/bin/node"
APP_DIR="/app"
CONFIG_DIR="${CONFIG_DIR:-/config}"

# Ensure the config directory exists and is owned by the requested user/group.
mkdir -p "$CONFIG_DIR"
chown -R "$PUID:$PGID" "$CONFIG_DIR" 2>/dev/null || true
chmod 700 "$CONFIG_DIR" 2>/dev/null || true

# Also fix ownership of the app directory so node can read its files.
chown -R "$PUID:$PGID" "$APP_DIR" 2>/dev/null || true

echo "Mastarr starting as UID=$PUID GID=$PGID"

# Drop privileges and exec the app as the requested user.
exec su-exec "$PUID:$PGID" "$NODE_BIN" "server.js"
