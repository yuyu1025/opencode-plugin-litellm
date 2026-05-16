# Publishing

This document is for maintainers.

## GitHub

Recommended repository:

```text
yuyu1025/opencode-plugin-litellm
```

Use a public repository. README badges and package metadata assume that repository.

Recommended npm package:

```text
@yuyu1025/opencode-plugin-litellm
```

The unscoped npm name `opencode-plugin-litellm` is already owned by another maintainer. Do not use it in this project.

## Release Checklist

1. Run tests.

   ```sh
   npm test
   npm run pack:check
   ```

2. Update `CHANGELOG.md`.
3. Commit the release.
4. Create a GitHub release with the same version as `package.json`.
5. Publish to npm.

   ```sh
   npm publish
   ```

6. Verify the public install path in a clean OpenCode config:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": ["@yuyu1025/opencode-plugin-litellm"]
   }
   ```

OpenCode npm plugins are installed automatically at startup, so npm publication is the path that makes the plugin easy for normal users.
