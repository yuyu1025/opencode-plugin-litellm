import assert from "node:assert/strict"
import test from "node:test"

import plugin, { LiteLLMPlugin } from "../src/index.js"
import { createModel } from "../src/litellm.js"
import { PLUGIN_ID, V2_PROVIDER_PACKAGE, applyProvider, toV2Model } from "../src/v2.js"

test("default export satisfies both OpenCode 1.x and 2.x module shapes", () => {
  assert.equal(plugin.id, PLUGIN_ID)
  assert.equal(plugin.server, LiteLLMPlugin)
  assert.equal(typeof plugin.setup, "function")
})

test("converts discovered models to OpenCode 2.x Model.Info", () => {
  const model = toV2Model(
    createModel("vision", {
      supports_vision: true,
      supports_function_calling: false,
      max_input_tokens: 100_000,
      max_output_tokens: 8_000,
      input_cost_per_token: 0.000001,
    }),
  )
  assert.equal(model.id, "vision")
  assert.equal(model.modelID, "vision")
  assert.equal(model.providerID, "litellm")
  assert.deepEqual(model.capabilities, { tools: false, input: ["text", "image"], output: ["text"], temperature: true })
  assert.deepEqual(model.limit, { context: 100_000, input: 100_000, output: 8_000 })
  assert.equal(model.cost[0].input, 1)
  assert.equal(model.enabled, true)
  assert.deepEqual(model.variants, [])
})

test("uses positive default limits when LiteLLM reports none", () => {
  const model = toV2Model(createModel("bare"))
  assert.ok(model.limit.context > 0)
  assert.ok(model.limit.output > 0)
  assert.deepEqual(model.cost, [])
})

function fakeEditor(existing) {
  const calls = { added: undefined, updated: undefined, models: undefined }
  return {
    calls,
    get: () => existing,
    add: (input) => (calls.added = input),
    update: (_id, fn) => {
      calls.updated = structuredClone(existing.provider)
      fn(calls.updated)
    },
    models: { set: (_id, models) => (calls.models = models) },
  }
}

test("adds the LiteLLM provider with discovered models", () => {
  const editor = fakeEditor(undefined)
  applyProvider(editor, { baseURL: "http://x/v1", apiKey: "k", models: { a: createModel("a") } })
  assert.equal(editor.calls.added.info.package, V2_PROVIDER_PACKAGE)
  assert.equal(editor.calls.added.info.activation, "enabled")
  assert.deepEqual(editor.calls.added.info.settings, { baseURL: "http://x/v1", provider: "litellm", apiKey: "k" })
  assert.deepEqual(
    editor.calls.added.models.map((m) => m.id),
    ["a"],
  )
})

test("does not add an empty provider when discovery found nothing", () => {
  const editor = fakeEditor(undefined)
  applyProvider(editor, { baseURL: "http://x/v1", models: {} })
  assert.equal(editor.calls.added, undefined)
})

test("keeps user-configured provider settings and models", () => {
  const existing = {
    provider: { id: "litellm", name: "Mine", activation: "auto", package: "", settings: { baseURL: "http://mine/v1" } },
    models: new Map([["a", { id: "a", name: "custom" }]]),
  }
  const editor = fakeEditor(existing)
  applyProvider(editor, { baseURL: "http://x/v1", models: { a: createModel("a"), b: createModel("b") } })
  assert.equal(editor.calls.updated.name, "Mine")
  assert.equal(editor.calls.updated.package, V2_PROVIDER_PACKAGE)
  assert.equal(editor.calls.updated.settings.baseURL, "http://mine/v1")
  assert.deepEqual(
    editor.calls.models.map((m) => [m.id, m.name]),
    [
      ["a", "custom"],
      ["b", "b"],
    ],
  )
})
