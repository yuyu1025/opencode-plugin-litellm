import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS,
  PROVIDER_ID,
  PROVIDER_NAME,
  discoverLiteLLMModels,
  encodeAuthKey,
  mergeProviderConfig,
  normalizeBaseURL,
  readStoredAuth,
  resolveSettings,
} from "./litellm.js"

async function log(client, level, message, extra = {}) {
  try {
    await client?.app?.log?.({
      body: {
        service: "opencode-plugin-litellm",
        level,
        message,
        extra,
      },
    })
  } catch {
    // Logging must never affect opencode startup.
  }
}

export async function LiteLLMPlugin({ client }, options = {}) {
  return {
    auth: {
      provider: PROVIDER_ID,
      loader: async (auth, provider) => {
        const settings = resolveSettings({
          auth: await auth(),
          provider,
          options,
        })

        const result = { baseURL: settings.baseURL }
        result.apiKey = settings.apiKey ?? ""
        return result
      },
      methods: [
        {
          type: "api",
          label: "API key",
          prompts: [
            {
              type: "text",
              key: "baseURL",
              message: "LiteLLM base URL",
              placeholder: DEFAULT_BASE_URL,
              validate(value) {
                try {
                  normalizeBaseURL(value || DEFAULT_BASE_URL)
                  return undefined
                } catch (error) {
                  return error instanceof Error ? error.message : "Invalid URL"
                }
              },
            },
          ],
        },
        {
          type: "oauth",
          label: "No API key",
          prompts: [
            {
              type: "text",
              key: "baseURL",
              message: "LiteLLM base URL",
              placeholder: DEFAULT_BASE_URL,
              validate(value) {
                try {
                  normalizeBaseURL(value || DEFAULT_BASE_URL)
                  return undefined
                } catch (error) {
                  return error instanceof Error ? error.message : "Invalid URL"
                }
              },
            },
          ],
          async authorize(inputs = {}) {
            const baseURL = normalizeBaseURL(inputs.baseURL || DEFAULT_BASE_URL)
            return {
              url: baseURL,
              method: "auto",
              instructions: "Saving LiteLLM connection without an API key.",
              async callback() {
                return {
                  type: "success",
                  key: encodeAuthKey({ baseURL, apiKey: "" }),
                  metadata: { baseURL },
                }
              },
            }
          },
        },
      ],
    },

    async config(config) {
      config.provider ??= {}
      const provider = config.provider[PROVIDER_ID]
      const auth = await readStoredAuth(PROVIDER_ID)
      const settings = resolveSettings({ auth, provider, options })
      const discovered = await discoverLiteLLMModels({
        baseURL: settings.baseURL,
        apiKey: settings.apiKey,
        timeoutMs: settings.timeoutMs ?? DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS,
        onWarning: (message, extra) => log(client, "warn", message, extra),
      })

      mergeProviderConfig(config, {
        baseURL: settings.baseURL,
        apiKey: apiKeyForConfig({ auth, provider, options }),
        models: discovered,
      })

      const count = Object.keys(discovered).length
      if (count > 0) {
        await log(client, "info", `Discovered ${count} LiteLLM model${count === 1 ? "" : "s"}.`, {
          provider: PROVIDER_NAME,
        })
      }
    },

    provider: {
      id: PROVIDER_ID,
      async models(provider, context = {}) {
        const settings = resolveSettings({
          auth: context.auth,
          provider,
          options,
        })
        return discoverLiteLLMModels({
          baseURL: settings.baseURL,
          apiKey: settings.apiKey,
          timeoutMs: settings.timeoutMs ?? DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS,
          onWarning: (message, extra) => log(client, "warn", message, extra),
        })
      },
    },
  }
}

function apiKeyForConfig({ auth, provider, options }) {
  if (auth) return undefined
  if (provider?.options?.apiKey !== undefined) return undefined
  if (typeof options.apiKey === "string") return options.apiKey
  if (typeof process.env.LITELLM_API_KEY === "string" && process.env.LITELLM_API_KEY.trim() !== "") return undefined
  return ""
}

export default LiteLLMPlugin
