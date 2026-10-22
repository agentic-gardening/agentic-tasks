# techdebt-common

Shared TypeScript library for the [agentic-gardening](https://github.com/agentic-gardening) tech-debt agents.
Consumed by the other packages as a workspace dependency with TypeScript sources (no build step):

```json
"techdebt-common": "workspace:*"
```

Consumers must inline it in vite/vitest (`ssr.noExternal` / `test.server.deps.inline`) because the
sources use inversify decorators.

## What is inside

| module | purpose |
|---|---|
| `OctokitBuilder`, `OctokitNames` | build `Octokit` instances; named bindings `tasks`, `bot`, `dispatch`, `read` |
| `CatalogClient`, `Repository` | fetch `repositories.json` published by `agent-repo-catalog` |
| `IssueService` | read/create Epic + Task issues, sub-issues, `state/*` label transitions, comments |
| `PermissionGuard` | only actors with write access on `tasks` may drive the agents |
| `WorkflowDispatcher` | `workflow_dispatch` on another agent repo |
| `StateBranch` | JSON key/value store on an orphan `state` branch, plus keep-alive commit |
| `LoopRunner` | long-running loop restarted by the hourly cron (`--once` for single runs) |
| `ProcessRunner`, `CheckSuite` | run `git`/`pnpm`; `install → lint:check → format:check → typecheck → test → build` |
| `labels.ts` | `STATE`, `KIND`, `MARKER`, title keys, `<!-- techdebt -->` machine block |

`commonModule` binds all services; agents bind their named `Octokit` instances and options.

## Scripts

- `scripts/bootstrap-tasks.sh [owner/repo]` creates the `state/*` and `kind/*` labels on `tasks`.
  The `Epic` issue type has to exist in the org.

## Development

```
pnpm install
pnpm lint:check && pnpm format:check && pnpm typecheck && pnpm test
```
