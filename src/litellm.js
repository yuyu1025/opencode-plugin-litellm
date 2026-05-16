import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export const PROVIDER_ID = "litellm"
export const PROVIDER_NAME = "LiteLLM"
export const PROVIDER_NPM = "@ai-sdk/openai-compatible"
export const DEFAULT_BASE_URL = "http://127.0.0.1:4000/v1"
export const DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS = 2_000
export const AUTH_KEY_PREFIX = "opencode-plugin-litellm:"
export const LEGACY_AUTH_KEY_PREFIX = "opencode-litellm:"
export const PLACEHOLDER_MODEL_ID = "opencode-plugin-litellm-connect"

const TEXT_MODALITY = Object.freeze({ text: true, audio: false, image: false, video: false, pdf: false })

export function normalizeBaseURL(input = DEFAULT_BASE_URL) {
  let value = String(input || DEFAULT_BASE_URL).trim()
  if (!value) value = DEFAULT_BASE_URL
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`

  let url
  try {
    url = new URL(value)
  } catch (cause) {
    throw new TypeError(`Invalid LiteLLM baseURL: ${input}`, { cause })
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError(`LiteLLM baseURL must use http or https: ${input}`)
  }

  let pathname = url.pathname.replace(/\/+$/, "")
  pathname = pathname.replace(/\/models$/, "")
  if (!pathname) pathname = "/v1"
  if (!pathname.endsWith("/v1")) pathname = `${pathname}/v1`

  url.pathname = pathname
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

export function modelsEndpoint(baseURL) {
  const url = new URL(normalizeBaseURL(baseURL))
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`
  return url.toString()
}

export function encodeAuthKey(input) {
  const payload = {
    version: 1,
    baseURL: normalizeBaseURL(input.baseURL),
    apiKey: String(input.apiKey ?? ""),
  }
  return `${AUTH_KEY_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`
}

export function decodeAuthKey(key) {
  const value = String(key ?? "")
  const prefix = [AUTH_KEY_PREFIX, LEGACY_AUTH_KEY_PREFIX].find((item) => value.startsWith(item))
  if (!prefix) return { apiKey: value }

  try {
    const raw = Buffer.from(value.slice(prefix.length), "base64url").toString("utf8")
    const parsed = JSON.parse(raw)
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      baseURL: typeof parsed.baseURL === "string" ? normalizeBaseURL(parsed.baseURL) : undefined,
    }
  } catch {
    return { apiKey: "" }
  }
}

export function authInfoToSettings(auth) {
  if (!auth || auth.type !== "api") return {}
  const decoded = decodeAuthKey(auth.key)
  const metadataBaseURL =
    auth.metadata && typeof auth.metadata.baseURL === "string" ? safeNormalize(auth.metadata.baseURL) : undefined
  return {
    apiKey: decoded.apiKey,
    baseURL: metadataBaseURL ?? decoded.baseURL,
  }
}

export async function readStoredAuth(providerID = PROVIDER_ID) {
  const fromEnv = process.env.OPENCODE_AUTH_CONTENT
  const content = fromEnv ?? (await readAuthFile())
  if (!content) return undefined

  try {
    const data = JSON.parse(content)
    const auth = data?.[providerID] ?? data?.[providerID.replace(/\/+$/, "")]
    return auth && typeof auth === "object" ? auth : undefined
  } catch {
    return undefined
  }
}

export function resolveSettings({ auth, provider, options = {}, env = process.env } = {}) {
  const authSettings = authInfoToSettings(auth)
  const providerOptions = provider?.options ?? {}
  const baseURL = normalizeBaseURL(
    firstString(authSettings.baseURL, providerOptions.baseURL, options.baseURL, options.baseUrl, env.LITELLM_BASE_URL) ??
      DEFAULT_BASE_URL,
  )
  const apiKey =
    auth && Object.hasOwn(authSettings, "apiKey")
      ? authSettings.apiKey
      : firstString(providerOptions.apiKey, options.apiKey, env.LITELLM_API_KEY)
  const timeoutMs = positiveInteger(
    options.modelsTimeoutMs ?? options.discoveryTimeoutMs ?? options.timeoutMs ?? env.LITELLM_MODELS_TIMEOUT_MS,
  )

  return {
    baseURL,
    apiKey,
    timeoutMs: timeoutMs ?? DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS,
  }
}

export async function discoverLiteLLMModels({
  baseURL = DEFAULT_BASE_URL,
  apiKey,
  timeoutMs = DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  onWarning,
} = {}) {
  let endpoint
  try {
    endpoint = modelsEndpoint(baseURL)
  } catch (error) {
    warn(onWarning, "Invalid LiteLLM baseURL; model discovery skipped.", { error: messageOf(error) })
    return {}
  }

  if (typeof fetchImpl !== "function") {
    warn(onWarning, "No fetch implementation is available; model discovery skipped.")
    return {}
  }

  const headers = { accept: "application/json" }
  if (typeof apiKey === "string" && apiKey.trim() !== "") {
    headers.authorization = `Bearer ${apiKey.trim()}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    })

    if (!response.ok) {
      const authHint =
        response.status === 401 || response.status === 403 ? " Re-run /connect with a valid LiteLLM API key." : ""
      warn(onWarning, `LiteLLM model discovery failed with HTTP ${response.status}.${authHint}`, {
        status: response.status,
      })
      return {}
    }

    let body
    try {
      body = await response.json()
    } catch (error) {
      warn(onWarning, "LiteLLM /models returned invalid JSON; model discovery skipped.", { error: messageOf(error) })
      return {}
    }

    return modelsFromOpenAIResponse(body, { baseURL: normalizeBaseURL(baseURL) })
  } catch (error) {
    const timedOut = error?.name === "AbortError"
    warn(onWarning, timedOut ? "LiteLLM model discovery timed out." : "LiteLLM model discovery failed.", {
      error: messageOf(error),
    })
    return {}
  } finally {
    clearTimeout(timeout)
  }
}

export function modelsFromOpenAIResponse(body, { baseURL = DEFAULT_BASE_URL } = {}) {
  if (!body || !Array.isArray(body.data)) return {}

  const models = {}
  for (const item of body.data) {
    const id = typeof item?.id === "string" ? item.id.trim() : ""
    if (!id || models[id]) continue
    models[id] = createModel(id, item, normalizeBaseURL(baseURL))
  }
  return models
}

export function toConfigModels(models) {
  const result = {}
  for (const [id, model] of Object.entries(models ?? {})) {
    const entry = {
      name: model.name ?? id,
      temperature: model.capabilities?.temperature ?? true,
      reasoning: model.capabilities?.reasoning ?? false,
      attachment: model.capabilities?.attachment ?? false,
      tool_call: model.capabilities?.toolcall ?? true,
      modalities: modalitiesFromCapabilities(model.capabilities),
    }

    const context = model.limit?.context
    const output = model.limit?.output
    if (isFiniteNumber(context) || isFiniteNumber(output)) {
      entry.limit = {
        context: isFiniteNumber(context) ? context : 0,
        output: isFiniteNumber(output) ? output : 0,
      }
      if (isFiniteNumber(model.limit?.input)) entry.limit.input = model.limit.input
    }

    const cost = model.cost ?? {}
    if (hasPositiveCost(cost)) {
      entry.cost = {
        input: isFiniteNumber(cost.input) ? cost.input : 0,
        output: isFiniteNumber(cost.output) ? cost.output : 0,
      }
      if (isFiniteNumber(cost.cache?.read)) entry.cost.cache_read = cost.cache.read
      if (isFiniteNumber(cost.cache?.write)) entry.cost.cache_write = cost.cache.write
    }

    result[id] = entry
  }
  return result
}

export function mergeProviderConfig(config, { baseURL, apiKey, models = {} } = {}) {
  config.provider ??= {}
  const provider = (config.provider[PROVIDER_ID] ??= {})

  provider.name ??= PROVIDER_NAME
  provider.npm ??= PROVIDER_NPM
  provider.env ??= ["LITELLM_API_KEY"]
  provider.options ??= {}
  provider.options.baseURL = normalizeBaseURL(baseURL ?? provider.options.baseURL ?? DEFAULT_BASE_URL)

  if (apiKey !== undefined && provider.options.apiKey === undefined) {
    provider.options.apiKey = apiKey
  }

  provider.models ??= {}
  const configModels = toConfigModels(models)
  if (Object.keys(configModels).length === 0 && Object.keys(provider.models).length === 0) {
    configModels[PLACEHOLDER_MODEL_ID] = {
      name: "Connect LiteLLM",
      temperature: true,
      reasoning: false,
      attachment: false,
      tool_call: true,
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      limit: {
        context: 0,
        output: 0,
      },
    }
  }

  for (const [id, model] of Object.entries(configModels)) {
    provider.models[id] ??= model
  }

  return provider
}

export function createModel(id, raw = {}, baseURL = DEFAULT_BASE_URL) {
  const info = raw.model_info && typeof raw.model_info === "object" ? raw.model_info : {}
  const context = firstNumber(
    raw.context_window,
    raw.max_context_tokens,
    raw.max_input_tokens,
    raw.input_token_limit,
    raw.max_tokens,
    info.context_window,
    info.max_context_tokens,
    info.max_input_tokens,
    info.input_token_limit,
    info.max_tokens,
  )
  const output = firstNumber(
    raw.max_output_tokens,
    raw.output_token_limit,
    raw.max_completion_tokens,
    info.max_output_tokens,
    info.output_token_limit,
    info.max_completion_tokens,
  )
  const inputLimit = firstNumber(raw.max_input_tokens, raw.input_token_limit, info.max_input_tokens, info.input_token_limit)

  const inputModalities = readModalities(raw.modalities?.input ?? raw.input_modalities ?? info.modalities?.input)
  const outputModalities = readModalities(raw.modalities?.output ?? raw.output_modalities ?? info.modalities?.output)
  const supportsVision = firstBoolean(raw.supports_vision, raw.supports_image_input, info.supports_vision)
  const supportsPdf = firstBoolean(raw.supports_pdf_input, info.supports_pdf_input)
  const supportsAudio = firstBoolean(raw.supports_audio_input, info.supports_audio_input)
  const supportsVideo = firstBoolean(raw.supports_video_input, info.supports_video_input)

  const input = {
    text: true,
    audio: inputModalities.includes("audio") || supportsAudio === true,
    image: inputModalities.includes("image") || supportsVision === true,
    video: inputModalities.includes("video") || supportsVideo === true,
    pdf: inputModalities.includes("pdf") || supportsPdf === true,
  }
  const outputMods = {
    ...TEXT_MODALITY,
    audio: outputModalities.includes("audio"),
    image: outputModalities.includes("image"),
    video: outputModalities.includes("video"),
    pdf: outputModalities.includes("pdf"),
  }

  return {
    id,
    providerID: PROVIDER_ID,
    api: {
      id,
      url: normalizeBaseURL(baseURL),
      npm: PROVIDER_NPM,
    },
    name: firstString(raw.name, info.name) ?? id,
    family: firstString(raw.family, info.family) ?? "",
    capabilities: {
      temperature: firstBoolean(raw.supports_temperature, info.supports_temperature) ?? true,
      reasoning: firstBoolean(raw.supports_reasoning, info.supports_reasoning) ?? false,
      attachment: input.audio || input.image || input.video || input.pdf,
      toolcall:
        firstBoolean(
          raw.supports_function_calling,
          raw.supports_tool_calling,
          info.supports_function_calling,
          info.supports_tool_calling,
        ) ?? true,
      input,
      output: outputMods,
      interleaved: false,
    },
    cost: {
      input: perMillion(firstNumber(raw.input_cost_per_token, info.input_cost_per_token)) ?? 0,
      output: perMillion(firstNumber(raw.output_cost_per_token, info.output_cost_per_token)) ?? 0,
      cache: {
        read: perMillion(firstNumber(raw.cache_read_input_token_cost, info.cache_read_input_token_cost)) ?? 0,
        write: perMillion(firstNumber(raw.cache_creation_input_token_cost, info.cache_creation_input_token_cost)) ?? 0,
      },
    },
    limit: {
      context: context ?? 0,
      ...(inputLimit === undefined ? {} : { input: inputLimit }),
      output: output ?? 0,
    },
    status: "active",
    options: {},
    headers: {},
    release_date: firstString(raw.created, info.created, raw.release_date, info.release_date) ?? "",
    variants: {},
  }
}

function modalitiesFromCapabilities(capabilities = {}) {
  return {
    input: modalitiesToArray(capabilities.input ?? TEXT_MODALITY),
    output: modalitiesToArray(capabilities.output ?? TEXT_MODALITY),
  }
}

function modalitiesToArray(modalities) {
  return ["text", "audio", "image", "video", "pdf"].filter((key) => modalities[key])
}

function readModalities(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => ["text", "audio", "image", "video", "pdf"].includes(item))
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim()
  }
  return undefined
}

function firstNumber(...values) {
  for (const value of values) {
    const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value
    if (typeof number === "number" && Number.isFinite(number) && number >= 0) return number
  }
  return undefined
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true
      if (value.toLowerCase() === "false") return false
    }
  }
  return undefined
}

function positiveInteger(value) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value
  if (typeof number === "number" && Number.isInteger(number) && number > 0) return number
  return undefined
}

function perMillion(value) {
  return value === undefined ? undefined : value * 1_000_000
}

function safeNormalize(value) {
  try {
    return normalizeBaseURL(value)
  } catch {
    return undefined
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function hasPositiveCost(cost) {
  return [cost.input, cost.output, cost.cache?.read, cost.cache?.write].some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  )
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function warn(onWarning, message, extra = {}) {
  if (typeof onWarning === "function") onWarning(message, extra)
}

async function readAuthFile() {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
  try {
    return await fs.readFile(path.join(dataHome, "opencode", "auth.json"), "utf8")
  } catch {
    return undefined
  }
}
