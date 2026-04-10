# OAuth Runtime Boundaries

- Keep provider-specific auth quirks inside the provider adapter. Generic auth code should handle orchestration, persistence, and refresh, not provider wire formats.
- If a provider needs a special API-key serialization shape, expose it as an adapter hook and keep `resolveApiKey` generic. Gemini's `{ token, projectId }` payload is the model for this boundary.
- Browser redirect handling, token transport, and provider URL/token logic should stay separable so auth paths can be tested locally without real tabs or real providers.
- When an auth flow can complete immediately from stored OAuth credentials, resolve the UI immediately. Do not leave success behind a polling loop that exists only for slower fallback paths.
