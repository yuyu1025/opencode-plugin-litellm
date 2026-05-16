# Contributing

This project should stay small. It exists to make OpenCode work cleanly with LiteLLM, not to become a generic provider framework.

## Good Issues

Useful reports include:

- OpenCode version
- LiteLLM version
- Node.js version
- the relevant OpenCode config
- whether LiteLLM requires an API key
- the response shape from `GET /v1/models` with secrets removed
- exact expected behavior and actual behavior

Do not paste API keys, full auth files, or private model endpoints.

## Development

```sh
npm test
npm run pack:check
```

Keep changes focused. Add tests when changing URL normalization, auth handling, model parsing, provider config merging, or startup failure behavior.

## Pull Requests

Before opening a PR:

- run `npm test`
- run `npm run pack:check`
- update README or troubleshooting docs when behavior changes
- avoid unrelated formatting churn

Small PRs are easier to review and faster to merge.
