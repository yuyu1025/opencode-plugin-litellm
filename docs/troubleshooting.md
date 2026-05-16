# Troubleshooting

## `LiteLLM` Does Not Appear in `/connect`

Check that the plugin is listed in your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@yuyu1025/opencode-plugin-litellm"]
}
```

Restart OpenCode after changing the config. OpenCode loads plugins at startup.

## Models Are Empty

Call LiteLLM directly:

```sh
curl http://127.0.0.1:4000/v1/models
```

If LiteLLM requires auth:

```sh
curl -H "Authorization: Bearer $LITELLM_API_KEY" http://127.0.0.1:4000/v1/models
```

The plugin expects an OpenAI-compatible response:

```json
{
  "data": [
    { "id": "gpt-4o" }
  ]
}
```

If the response has no `data` array, there are no models to import.

## URL Problems

The plugin normalizes these to the same base URL:

```text
http://localhost:4000
http://localhost:4000/
http://localhost:4000/v1
http://localhost:4000/v1/
```

Do not use `/models` in the configured base URL. If you do, the plugin strips it before calling model discovery.

Only `http` and `https` URLs are accepted.

## Auth Problems

If LiteLLM returns `401` or `403`, re-run:

```text
/connect
```

Then choose `LiteLLM` and enter a valid API key. For local unauthenticated LiteLLM, choose `No API key`.

You can also set:

```sh
LITELLM_API_KEY=sk-local
```

## Slow LiteLLM or Proxy

The default model discovery timeout is 2000 ms. Increase it when LiteLLM is behind a slow proxy:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "@yuyu1025/opencode-plugin-litellm",
      {
        "modelsTimeoutMs": 5000
      }
    ]
  ]
}
```

## Manual Model Overrides

If LiteLLM does not return useful model metadata, define the model yourself. The plugin will not overwrite it:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "litellm": {
      "models": {
        "my-model": {
          "name": "my-model",
          "temperature": true,
          "reasoning": false,
          "attachment": false,
          "tool_call": true,
          "modalities": {
            "input": ["text"],
            "output": ["text"]
          },
          "limit": {
            "context": 0,
            "output": 0
          }
        }
      }
    }
  },
  "plugin": ["@yuyu1025/opencode-plugin-litellm"]
}
```
