# AGENTS.md

## Cursor Cloud specific instructions

- Cloud agents should use `.cursor/environment.json` to provision dependencies before tasks run.
- Keep dependency installation lockfile-based with `npm ci` so `npm run build` works immediately.
- Do not execute Netlify production deploys from cloud-agent sessions.
- If Netlify validation is needed, use preview-only workflows and avoid production push/deploy commands.
