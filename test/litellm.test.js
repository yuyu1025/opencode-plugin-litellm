import assert from "node:assert/strict"
import test from "node:test"

import {
  AUTH_KEY_PREFIX,
  DEFAULT_BASE_URL,
  LEGACY_AUTH_KEY_PREFIX,
  decodeAuthKey,
  discoverLiteLLMModels,
  encodeAuthKey,
  mergeProviderConfig,
  modelsEndpoint,
  modelsFromOpenAIResponse,
  normalizeBaseURL,
  resolveSettings,
  toConfigModels,
} from "../src/litellm.js"

test("normalizes LiteLLM base URLs to a single /v1 suffix", () => {
  assert.equal(normalizeBaseURL("http://localhost:4000"), "http://localhost:4000/v1")
  assert.equal(normalizeBaseURL("http://localhost:4000/"), "http://localhost:4000/v1")
  assert.equal(normalizeBaseURL("http://localhost:4000/v1"), "http://localhost:4000/v1")
  assert.equal(normalizeBaseURL("http://localhost:4000/v1/"), "http://localhost:4000/v1")
  assert.equal(normalizeBaseURL("http://localhost:4000/v1/models"), "http://localhost:4000/v1")
  assert.equal(normalizeBaseURL("localhost:4000"), "http://localhost:4000/v1")
  assert.equal(modelsEndpoint("http://localhost:4000/v1/"), "http://localhost:4000/v1/models")
})

test("rejects invalid LiteLLM base URLs", () => {
  assert.throws(() => normalizeBaseURL("ftp://localhost:4000"), /http or https/)
  assert.throws(() => normalizeBaseURL("http:// "), /Invalid LiteLLM baseURL/)
})

test("encodes auth key payloads so baseURL survives opencode auth storage", () => {
  const key = encodeAuthKey({ baseURL: "localhost:4000", apiKey: "sk-test" })
  const legacyKey = `${LEGACY_AUTH_KEY_PREFIX}${key.slice(AUTH_KEY_PREFIX.length)}`

  assert.ok(key.startsWith(AUTH_KEY_PREFIX))
  assert.deepEqual(decodeAuthKey(key), {
    baseURL: "http://localhost:4000/v1",
    apiKey: "sk-test",
  })
  assert.deepEqual(decodeAuthKey(legacyKey), {
    baseURL: "http://localhost:4000/v1",
    apiKey: "sk-test",
  })
  assert.deepEqual(decodeAuthKey("sk-raw"), { apiKey: "sk-raw" })
})

test("prefers auth settings over provider, plugin, and environment settings", () => {
  const authKey = encodeAuthKey({ baseURL: "http://auth.example/v1", apiKey: "auth-key" })
  const settings = resolveSettings({
    auth: { type: "api", key: authKey },
    provider: { options: { baseURL: "http://provider.example/v1", apiKey: "provider-key" } },
    options: { baseURL: "http://plugin.example/v1", apiKey: "plugin-key" },
    env: { LITELLM_BASE_URL: "http://env.example/v1", LITELLM_API_KEY: "env-key" },
  })

  assert.equal(settings.baseURL, "http://auth.example/v1")
  assert.equal(settings.apiKey, "auth-key")
})

test("keeps an intentionally blank auth API key blank", () => {
  const authKey = encodeAuthKey({ baseURL: "http://auth.example/v1", apiKey: "" })
  const settings = resolveSettings({
    auth: { type: "api", key: authKey },
    env: { LITELLM_API_KEY: "env-key" },
  })

  assert.equal(settings.apiKey, "")
})

test("parses OpenAI-compatible /models responses into opencode model entries", () => {
  const models = modelsFromOpenAIResponse(
    {
      data: [
        {
          id: "gpt-4o",
          model_info: {
            max_input_tokens: 128000,
            max_output_tokens: 4096,
            input_cost_per_token: 0.0000025,
            output_cost_per_token: 0.00001,
            supports_function_calling: true,
            supports_vision: true,
          },
        },
        { id: "claude-sonnet-4-5" },
        { id: "" },
        {},
      ],
    },
    { baseURL: DEFAULT_BASE_URL },
  )

  assert.deepEqual(Object.keys(models), ["gpt-4o", "claude-sonnet-4-5"])
  assert.equal(models["gpt-4o"].limit.input, 128000)
  assert.equal(models["gpt-4o"].limit.output, 4096)
  assert.equal(models["gpt-4o"].cost.input, 2.5)
  assert.equal(models["gpt-4o"].capabilities.input.image, true)
  assert.equal(models["claude-sonnet-4-5"].name, "claude-sonnet-4-5")
})

test("converts full model entries to opencode config model overrides", () => {
  const models = modelsFromOpenAIResponse(
    {
      data: [{ id: "qwen/qwen3-coder", model_info: { supports_tool_calling: true, max_output_tokens: 8192 } }],
    },
    { baseURL: DEFAULT_BASE_URL },
  )
  const configModels = toConfigModels(models)

  assert.equal(configModels["qwen/qwen3-coder"].name, "qwen/qwen3-coder")
  assert.equal(configModels["qwen/qwen3-coder"].tool_call, true)
  assert.equal(configModels["qwen/qwen3-coder"].limit.context, 0)
  assert.equal(configModels["qwen/qwen3-coder"].limit.output, 8192)
})

test("adds a placeholder model when no LiteLLM models are discovered", () => {
  const config = {}

  mergeProviderConfig(config, { baseURL: "http://localhost:4000", models: {} })

  assert.equal(config.provider.litellm.name, "LiteLLM")
  assert.equal(config.provider.litellm.models["opencode-plugin-litellm-connect"].name, "Connect LiteLLM")
})

test("discovers models and only sends authorization when an API key exists", async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return Response.json({ data: [{ id: "gpt-4o" }] })
  }

  const models = await discoverLiteLLMModels({
    baseURL: "http://localhost:4000",
    apiKey: "sk-test",
    fetchImpl,
  })

  assert.deepEqual(Object.keys(models), ["gpt-4o"])
  assert.equal(calls[0].url, "http://localhost:4000/v1/models")
  assert.equal(calls[0].init.headers.authorization, "Bearer sk-test")

  calls.length = 0
  await discoverLiteLLMModels({ baseURL: "http://localhost:4000", apiKey: "", fetchImpl })
  assert.equal("authorization" in calls[0].init.headers, false)
})

test("returns an empty model map instead of throwing on discovery failures", async () => {
  const warnings = []
  const models = await discoverLiteLLMModels({
    baseURL: "http://localhost:4000",
    fetchImpl: async () => {
      throw new Error("connection refused")
    },
    onWarning: (message) => warnings.push(message),
  })

  assert.deepEqual(models, {})
  assert.equal(warnings.length, 1)
})
