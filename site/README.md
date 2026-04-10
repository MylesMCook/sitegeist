# Sitegeist Site

Static landing and install pages for Sitegeist.

## Development

```bash
npm install
./run.sh dev
```

The Vite dev server runs at `http://localhost:8080`.

## Build

```bash
./run.sh build
```

Output goes to `site/dist/`.

## Deploy

Deploy is environment-driven:

```bash
SITEGEIST_SITE_DEPLOY_HOST=example.com \
SITEGEIST_SITE_DEPLOY_PATH=/var/www/sitegeist \
./run.sh deploy
```

No production host is hardcoded in this repo.
