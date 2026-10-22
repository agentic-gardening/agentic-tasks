# agent-repo-catalog

Publishes `repositories.json`, the list of repositories watched by the agentic-gardening tech-debt
agents. Every other agent reads that file instead of listing organisations itself.

- Input: `catalog.yaml` (explicit `repositories:` and optional `patterns:`; commented lines are
  candidates waiting to be enabled).
- Output: `repositories.json` on `main`, refreshed daily at 05:30 UTC and on every push that touches
  `catalog.yaml`. Raw URL:
  `https://raw.githubusercontent.com/agentic-gardening/agentic-tasks/main/packages/agent-repo-catalog/repositories.json`
- A repository is listed only if it is not archived and has a `pnpm-lock.yaml` and a `package.json`
  at the head of its default branch. `package_json_paths` includes workspace packages declared in
  `pnpm-workspace.yaml`.

```json
[{
  "owner": "podman-desktop",
  "name": "extension-podman-quadlet",
  "default_branch": "main",
  "head": "<oid>",
  "package_json_paths": ["package.json", "packages/backend/package.json"],
  "bot_has_write": false
}]
```

## Secrets

| name | required | purpose |
|---|---|---|
| `GITHUB_TOKEN` | workflow | `contents: write` (commits `repositories.json`); `bot_has_write` is always false |

## Local run

```
pnpm install && pnpm build
GITHUB_TOKEN=$(gh auth token) node dist/entrypoint.js
```
