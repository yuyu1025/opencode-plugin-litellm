# Roadmap

The project should earn adoption by solving one problem well: make LiteLLM usable from OpenCode with minimal config.

## Near Term

- Publish the package to npm after GitHub is live.
- Add an end-to-end smoke test against a tiny local OpenAI-compatible fixture.
- Document common LiteLLM deployments, including local, Docker, and reverse proxy setups.
- Collect real `/v1/models` response shapes from users and add parser tests for them.

## Not Goals

- Replacing LiteLLM configuration.
- Becoming a general OpenCode provider registry.
- Hiding provider failures with fake model data.
- Adding config layers that users cannot debug.
