# OAuth Local Harness And Provider-First Setup

- Sitegeist auth now centers on a small runtime in `src/oauth/` with three explicit seams: provider adapter, browser driver, and HTTP transport. Keep `oauthLogin`, `oauthRefresh`, and `resolveApiKey` as the public entrypoints over that runtime.
- Keep subscription-backed OAuth providers as the primary setup path in dialogs and settings. API keys stay supported, but they belong behind the advanced path instead of competing with OAuth in the primary copy.
- Treat ChatGPT OAuth as one current default model, `gpt-5.4`, plus a tiny legacy alias map for persisted older OpenAI/Codex ids. Do not grow a local archive of historical model fallbacks in app code.
- Auth automation is local-first. Unit coverage and the fake auth server should prove redirect success, denial, malformed responses, refresh behavior, and dialog recovery without hitting live providers. Live provider checks stay manual.
- Extension E2E should run only against an already-built `dist-chrome` artifact from the user-managed dev session. Do not build the extension in an agent pass that is supposed to stay local and deterministic.
- The fake auth server should fail closed with a deterministic JSON `500` on unexpected request-path errors so local tests never hang waiting for a response.
- OAuth dialog success should resolve immediately after credentials are stored. Polling is only for the API-key path.
