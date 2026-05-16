# Security Policy

## Supported Versions

Only the latest released version is supported.

## Reporting a Vulnerability

Use GitHub private vulnerability reporting if it is enabled for the repository. Otherwise, open a minimal issue that describes the affected behavior without exposing secrets, tokens, private URLs, or model names you cannot share.

This plugin should never log API keys. If you find a path that leaks credentials through OpenCode logs, auth metadata, errors, or model discovery output, treat it as a security bug.

## Secrets

Do not include these in issues or pull requests:

- `LITELLM_API_KEY`
- OpenCode auth files
- private LiteLLM base URLs
- proxy credentials
- full request headers
