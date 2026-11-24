# Changelog

## 0.2.0

- Support OpenCode 2.x: the default export is now a plugin definition (`{ id, server, setup }`) that loads on both OpenCode 1.x and 2.x. Fixes `Plugin must export a default definition with an id and an effect or setup function`.
- On OpenCode 2.x, register a LiteLLM integration and provider via the V2 plugin API, with periodic model re-discovery (`refreshIntervalMs`).

## 0.1.2

- Use the publishable npm package name `@finger_xie/opencode-plugin-litellm`.

## 0.1.1

- Use the scoped npm package name `@yuyu1025/opencode-plugin-litellm` to avoid the existing unscoped `opencode-plugin-litellm` package.

## 0.1.0

- Register `LiteLLM` as an OpenCode provider.
- Support `/connect` with API-key and no-key flows.
- Normalize LiteLLM base URLs to a single `/v1` suffix.
- Discover models from OpenAI-compatible `/v1/models`.
- Merge discovered models without overwriting user-defined models.
- Keep OpenCode startup working when model discovery fails.
