#!/usr/bin/env bash
set -euo pipefail

: "${HOMEBRIDGE_HOST:?Set HOMEBRIDGE_HOST, e.g. homebridge.local}"
HOMEBRIDGE_USER="${HOMEBRIDGE_USER:-pi}"
REMOTE_PATH="${HOMEBRIDGE_REMOTE_PATH:-/tmp}"
RESTART_COMMAND="${HOMEBRIDGE_RESTART_COMMAND:-sudo hb-service restart}"

npm test
npm run lint
npm run build
PACKAGE_PATH="$(npm pack --json | node -e 'let out=""; process.stdin.on("data", c => out += c); process.stdin.on("end", () => console.log(JSON.parse(out)[0].filename));')"
tar -tzf "$PACKAGE_PATH" | grep -Eq '^package/(package.json|config.schema.json)$'
tar -tzf "$PACKAGE_PATH" | grep -q '^package/dist/'

scp "$PACKAGE_PATH" "${HOMEBRIDGE_USER}@${HOMEBRIDGE_HOST}:${REMOTE_PATH}/"
ssh "${HOMEBRIDGE_USER}@${HOMEBRIDGE_HOST}" \
  "sudo hb-shell -c 'hb-service add ${REMOTE_PATH}/${PACKAGE_PATH}' && ${RESTART_COMMAND}"
