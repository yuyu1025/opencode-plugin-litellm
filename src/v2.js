// OpenCode 2.x plugin: registers a LiteLLM integration (API key / env) and a
// LiteLLM provider whose models are discovered from the proxy's /v1/models.
import {
  DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS,
  PROVIDER_ID,
  PROVIDER_NAME,
  decodeAuthKey,
  discoverLiteLLMModels,
  resolveSettings,
} from "./litellm.js"

export const PLUGIN_ID = "opencode-plugin-litellm"
export const V2_PROVIDER_PACKAGE = "@opencode/ai/providers/openai-compatible"
export const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const DEFAULT_CONTEXT = 128_000
const DEFAULT_OUTPUT = 16_384
const MODALITIES = ["text", "audio", "image", "video", "pdf"]

/** Converts a model produced by `createModel` into an OpenCode 2.x `Model.Info`. */
export function toV2Model(model) {
  const caps = model.capabilities ?? {}
  const input = MODALITIES.filter((key) => caps.input?.[key])
  const output = MODALITIES.filter((key) => caps.output?.[key])
  const cost = model.cost ?? {}
  const priced = [cost.input, cost.output, cost.cache?.read, cost.cache?.write].some((value) => value > 0)
  const context = positiveInt(model.limit?.context) ?? DEFAULT_CONTEXT
  const inputLimit = positiveInt(model.limit?.input)

  return {
    id: model.id,
    modelID: model.id,
    providerID: PROVIDER_ID,
    name: model.name || model.id,
    ...(model.family ? { family: model.family } : {}),
    capabilities: {
      tools: caps.toolcall ?? true,
      input: input.length ? input : ["text"],
      output: output.length ? output : ["text"],
      temperature: caps.temperature ?? true,
    },
    variants: [],
    time: { released: releasedAt(model.release_date) },
    cost: priced
      ? [
          {
            input: cost.input ?? 0,
            output: cost.output ?? 0,
            cache: { read: cost.cache?.read ?? 0, write: cost.cache?.write ?? 0 },
          },
        ]
      : [],
    status: "active",
    enabled: true,
    limit: {
      context,
      ...(inputLimit === undefined ? {} : { input: inputLimit }),
      output: Math.min(positiveInt(model.limit?.output) ?? DEFAULT_OUTPUT, context),
    },
  }
}

/** Applies the discovered LiteLLM provider to an OpenCode 2.x provider editor. */
export function applyProvider(editor, { baseURL, apiKey, models }) {
  const existing = editor.get(PROVIDER_ID)
  const settings = { baseURL, provider: PROVIDER_ID, ...(apiKey ? { apiKey } : {}) }
  const discovered = Object.values(models ?? {}).map(toV2Model)

  if (!existing) {
    if (discovered.length === 0) return
    editor.add({
      info: { id: PROVIDER_ID, name: PROVIDER_NAME, activation: "enabled", package: V2_PROVIDER_PACKAGE, settings },
      models: discovered,
    })
    return
  }

  // A provider declared in the user's config wins: only fill in what it leaves out.
  editor.update(PROVIDER_ID, (provider) => {
    provider.name ||= PROVIDER_NAME
    provider.package ||= V2_PROVIDER_PACKAGE
    if (provider.activation !== "disabled") provider.activation = "enabled"
    provider.settings = { ...settings, ...provider.settings }
  })
  const merged = new Map(existing.models)
  for (const model of discovered) if (!merged.has(model.id)) merged.set(model.id, model)
  editor.models.set(PROVIDER_ID, [...merged.values()])
}

export const LiteLLMPluginV2 = {
  id: PLUGIN_ID,
  async setup(ctx) {
    const options = ctx.options ?? {}
    const base = resolveSettings({ options })
    const intervalMs = positiveInt(options.refreshIntervalMs) ?? DEFAULT_REFRESH_INTERVAL_MS
    const state = { baseURL: base.baseURL, apiKey: base.apiKey, models: {}, hash: "{}" }

    await ctx.integration.transform((editor) => {
      editor.update(PROVIDER_ID, (integration) => {
        integration.name = PROVIDER_NAME
      })
      editor.method.update({ integrationID: PROVIDER_ID, method: { type: "env", names: ["LITELLM_API_KEY"] } })
      editor.method.update({ integrationID: PROVIDER_ID, method: { type: "key", label: "LiteLLM API key" } })
    })

    await ctx.provider.transform((editor) => applyProvider(editor, state))

    const refresh = async () => {
      const stored = await storedKey(ctx)
      const baseURL = stored?.baseURL ?? base.baseURL
      const apiKey = stored?.apiKey ?? base.apiKey
      const models = await discoverLiteLLMModels({
        baseURL,
        apiKey,
        timeoutMs: base.timeoutMs ?? DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS,
        onWarning: (message, extra) => console.warn(`[${PLUGIN_ID}] ${message}`, extra ?? ""),
      })
      // Keep the last good model list when the proxy is briefly unreachable.
      if (Object.keys(models).length === 0 && Object.keys(state.models).length > 0) return
      const hash = JSON.stringify([baseURL, apiKey ? "key" : "", models])
      if (hash === state.hash) return
      Object.assign(state, { baseURL, apiKey: base.apiKey, models, hash })
      await ctx.provider.reload()
    }

    await refresh().catch(() => {})
    const timer = setInterval(() => refresh().catch(() => {}), intervalMs)
    timer.unref?.()
    return () => clearInterval(timer)
  },
}

/** API key (and optional base URL) from the LiteLLM integration's active connection. */
async function storedKey(ctx) {
  try {
    const connection = await ctx.integration.connection.active(PROVIDER_ID)
    if (!connection) return undefined
    const credential = await ctx.integration.connection.resolve(connection)
    if (credential?.type !== "key") return undefined
    return decodeAuthKey(credential.key)
  } catch {
    return undefined
  }
}

function positiveInt(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

function releasedAt(value) {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value
  if (typeof number === "number" && Number.isFinite(number) && number > 0) return number < 1e12 ? number * 1000 : number
  const parsed = typeof value === "string" ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
