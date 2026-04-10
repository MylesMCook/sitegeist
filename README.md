<p align="center">
  <img src="media/hero.png" alt="Sitegeist" width="400">
</p>

Sitegeist is an AI browser agent that lives in your sidebar. You guide it, it works the page.

It can navigate sites, fill forms, scrape structured data, compare results across tabs, and turn what it finds into documents, spreadsheets, or other artifacts. Sitegeist runs as a Chromium side panel extension and supports both subscription-backed logins and API keys.

## Download

Get the latest build from [GitHub Releases](https://github.com/MylesMCook/sitegeist/releases/latest).

Requires Chrome 141+ or another Chromium browser with the same extension APIs.

## Local setup

Install dependencies:

```bash
npm install
(cd site && npm install)
```

Optional local overrides live in `sitegeist.config.local.json`. Start from `sitegeist.config.example.json` if you want to point the extension at a fake auth server, a custom update feed, or a personal proxy.

## Development

`./dev.sh` starts the extension watcher, the local fake auth server, and the static site dev server.

```bash
./dev.sh
```

Load the extension from `dist-chrome/`:

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select `sitegeist/dist-chrome/`
5. Enable `Allow user scripts`
6. Enable `Allow access to file URLs`

The default dev loop is local-first. Subscription login flows point at the fake auth server started by `./dev.sh`.

## Local auth test loop

Run the local checks and auth harness:

```bash
./check.sh
npm run test:local
```

For a manual local smoke:

```bash
npm run auth:fake
```

Then launch the extension with `SITEGEIST_FAKE_AUTH_URL=http://127.0.0.1:48652` set in `sitegeist.config.local.json` or your shell.

## Live provider smoke

Automated tests stay local. Use live providers only for occasional manual verification:

1. Remove or unset `fakeAuthUrl`
2. Reload the unpacked extension
3. Connect the real provider
4. Confirm the provider can answer a prompt and refresh its token

Proxy usage is explicit. Sitegeist does not ship with a public proxy default.

## Checks

```bash
./check.sh
```

This runs Biome and TypeScript checks for the extension and the static site.

## Website

The landing page lives in `site/src/frontend/`.

```bash
cd site && ./run.sh dev
cd site && ./run.sh build
```

`./run.sh deploy` is environment-driven. Set `SITEGEIST_SITE_DEPLOY_HOST` and `SITEGEIST_SITE_DEPLOY_PATH` before using it.

## Publish

`publish.sh` builds the extension zip and optional `version.json`, then uploads them to a host you control.

Set:

- `SITEGEIST_UPLOAD_HOST`
- `SITEGEIST_UPLOAD_PATH`

before running it.

## Release

```bash
./release.sh patch
./release.sh minor
./release.sh major
```

This updates `static/manifest.chrome.json`, finalizes the changelog, tags the release, and pushes it.

## License

AGPL-3.0. See [LICENSE](LICENSE).
