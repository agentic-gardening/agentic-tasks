# agent-dep-detector

Finds outdated dependencies in the repositories listed by
[agent-repo-catalog](https://github.com/agentic-gardening/agent-repo-catalog) and opens tickets in
[agentic-gardening/agentic-tasks](https://github.com/agentic-gardening/agentic-tasks): one **Epic** per
`package -> target` and one **Task** sub-issue per repository.

## Rules

| situation | epic | reason |
|---|---|---|
| a newer **major** exists | `[dep] vitest -> 5` | `major` |
| newer minor/patch, released 5+ days ago, open dependabot PR looks stuck (red, force-pushed by dependabot, 7+ days between creation and last update) | `[dep] eslint-plugin-sonarjs -> 4.2.2` | `failing-dependabot` |
| newer minor/patch, released 5+ days ago, no open dependabot PR | same | `stale` |

- `pnpm` is tracked through the `packageManager` field (version part only).
- `@types/node` never targets a major above the repository's `engines.node`.
- Ranges like `workspace:`, `catalog:`, `link:`, `file:`, `npm:`, git URLs are ignored.
- A closed epic is replaced by a new one when the repository is still outdated.
- Epics labelled `kind/manual` are never touched. Task sub-issues are closed automatically once the
  repository satisfies the target.

Runs as a loop (every 6 h) restarted by the hourly cron; a push runs once.

## State

Orphan branch `state`: `manifests.json` (per repo, keyed by head commit), `registry.json` (npm
metadata with ETags), `issues.json` (epic title to issue number), `last-run.txt` (keep-alive).

## Secrets

| name | required | purpose |
|---|---|---|
| `GITHUB_TOKEN` | automatic | push the `state` branch; fallback read token for public repositories |
| `TECHDEBTY_TOKEN` | org secret | classic PAT of `podman-desktop-bot` (`repo`, `workflow`): reads catalogued repositories, writes issues on `agentic-gardening/agentic-tasks` |

## Local dry run

```
pnpm install && pnpm build
GITHUB_TOKEN=$(gh auth token) node dist/entrypoint.js --dry-run   # READ_TOKEN / TASKS_TOKEN default to it
```
