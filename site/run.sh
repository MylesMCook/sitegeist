#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

case "$1" in
dev)
    echo "Starting dev server at http://localhost:8080"
    npx vite --config infra/vite.config.ts
    ;;

build)
    echo "Building static site..."
    npx vite build --config infra/vite.config.ts
    echo "Done. Output in dist/"
    ;;

deploy)
    if [ -z "${SITEGEIST_SITE_DEPLOY_HOST:-}" ] || [ -z "${SITEGEIST_SITE_DEPLOY_PATH:-}" ]; then
        echo "Set SITEGEIST_SITE_DEPLOY_HOST and SITEGEIST_SITE_DEPLOY_PATH before deploying."
        exit 1
    fi

    npm install
    npx vite build --config infra/vite.config.ts

    echo "Uploading to ${SITEGEIST_SITE_DEPLOY_HOST}..."
    ssh "${SITEGEIST_SITE_DEPLOY_HOST}" "mkdir -p ${SITEGEIST_SITE_DEPLOY_PATH}/uploads"
    rsync -avz --delete dist/ "${SITEGEIST_SITE_DEPLOY_HOST}:${SITEGEIST_SITE_DEPLOY_PATH}/dist/"
    echo "Deployed."
    ;;

*)
    echo "Usage: $0 {dev|build|deploy}"
    exit 1
    ;;
esac
