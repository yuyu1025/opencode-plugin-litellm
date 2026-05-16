# opencode-plugin-litellm

[![CI](https://github.com/yuyu1025/opencode-plugin-litellm/actions/workflows/ci.yml/badge.svg)](https://github.com/yuyu1025/opencode-plugin-litellm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/yuyu1025/opencode-plugin-litellm?style=social)](https://github.com/yuyu1025/opencode-plugin-litellm/stargazers)

OpenCode plugin that makes LiteLLM show up as a first-class provider.

It registers a `LiteLLM` provider in `/connect`, stores the LiteLLM base URL, configures OpenCode's OpenAI-compatible provider at runtime, and discovers models from LiteLLM's `/v1/models` endpoint.

## Why

LiteLLM is useful because it puts many model vendors behind one OpenAI-compatible API. OpenCode is useful because it is fast to run in real projects. The annoying part is keeping OpenCode provider config and model lists in sync with LiteLLM.

This plugin removes that manual config:

- add one plugin entry
- connect to your LiteLLM server from `/connect`
- let the plugin discover models automatically
- keep OpenCode startup working even when LiteLLM is temporarily down

If this saves you from hand-editing provider config, star the repo so other OpenCode + LiteLLM users can find it.

## Requirements

- OpenCode with plugin support
- LiteLLM exposing an OpenAI-compatible API, usually `http://127.0.0.1:4000/v1`
- Node.js 22 or newer for local development and tests

OpenCode supports loading plugins from npm through the `plugin` config option. See the official OpenCode plugin docs: <https://opencode.ai/docs/plugins/>.

## Quick Start

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-plugin-litellm"]
}
```

Restart OpenCode, then run:

```text
/connect
```

Choose `LiteLLM`, select `API key` or `No API key`, and enter your LiteLLM base URL. The default is:

```text
http://127.0.0.1:4000/v1
```

Then run:

```text
/models
```

Select a model discovered from LiteLLM.

## Configuration

You can provide plugin defaults directly in OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-plugin-litellm",
      {
        "baseURL": "http://127.0.0.1:4000/v1",
        "apiKey": "",
        "modelsTimeoutMs": 2000
      }
    ]
  ]
}
```

Environment variables are also supported:

| Variable | Purpose | Default |
| --- | --- | --- |
| `LITELLM_BASE_URL` | LiteLLM OpenAI-compatible base URL | `http://127.0.0.1:4000/v1` |
| `LITELLM_API_KEY` | LiteLLM API key | empty |
| `LITELLM_MODELS_TIMEOUT_MS` | Timeout for model discovery | `2000` |

Base URLs are normalized. These inputs all become `http://localhost:4000/v1`:

```text
http://localhost:4000
http://localhost:4000/
http://localhost:4000/v1
http://localhost:4000/v1/
```

## Runtime Behavior

The plugin injects this provider shape at startup:

```json
{
  "provider": {
    "litellm": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LiteLLM",
      "options": {
        "baseURL": "http://127.0.0.1:4000/v1"
      }
    }
  }
}
```

Models are discovered from:

```text
GET {baseURL}/models
```

Discovered models are merged into `provider.litellm.models` without overwriting models you configured yourself.

If LiteLLM is down, unreachable, unauthorized, slow, or returns invalid JSON, OpenCode startup continues. The plugin keeps a temporary `Connect LiteLLM` placeholder model so `LiteLLM` remains visible in `/connect`.

When LiteLLM does not return context or output limits, the plugin leaves those values as `0` to mean unknown instead of inventing fake limits. You can override a model manually in `provider.litellm.models` if you need exact limits.

## Troubleshooting

Start with [docs/troubleshooting.md](docs/troubleshooting.md).

Common checks:

- confirm LiteLLM is reachable at `GET http://127.0.0.1:4000/v1/models`
- confirm `/connect` has a `LiteLLM` provider
- re-run `/connect` after changing the LiteLLM URL or API key
- increase `modelsTimeoutMs` if LiteLLM is behind a slow proxy

## Development

```sh
npm test
npm run pack:check
```

The implementation is intentionally small:

- `src/index.js` defines the OpenCode plugin hooks
- `src/litellm.js` handles URL normalization, auth decoding, model discovery, and provider config merging
- `test/litellm.test.js` covers behavior that should not regress

## Contributing

Bug reports and small focused pull requests are welcome. Include your OpenCode version, LiteLLM version, relevant config, and the exact symptom.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
