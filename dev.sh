#!/bin/bash

set -e

FAKE_AUTH_URL="${SITEGEIST_FAKE_AUTH_URL:-http://127.0.0.1:48652}"

echo "Starting Sitegeist local development..."
echo "Fake auth URL: ${FAKE_AUTH_URL}"
echo ""

trap 'echo ""; echo "Stopping local services..."; kill 0' EXIT INT TERM

echo "Starting fake auth server..."
npm run auth:fake &

echo "Starting extension watcher..."
SITEGEIST_FAKE_AUTH_URL="${FAKE_AUTH_URL}" npm run dev &

echo "Starting site dev server..."
(cd site && ./run.sh dev) &

echo ""
echo "Services running:"
echo "  fake auth: ${FAKE_AUTH_URL}"
echo "  extension: dist-chrome watcher"
echo "  site: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop"
echo ""

wait
