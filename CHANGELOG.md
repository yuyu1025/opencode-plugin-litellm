# Changelog

## 0.1.0

- Register `LiteLLM` as an OpenCode provider.
- Support `/connect` with API-key and no-key flows.
- Normalize LiteLLM base URLs to a single `/v1` suffix.
- Discover models from OpenAI-compatible `/v1/models`.
- Merge discovered models without overwriting user-defined models.
- Keep OpenCode startup working when model discovery fails.
