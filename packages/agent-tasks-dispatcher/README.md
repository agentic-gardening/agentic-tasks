# agent-tasks-dispatcher

The only always-hot agent. Every 60 s it polls the open issues of
[agentic-gardening/agentic-tasks](https://github.com/agentic-gardening/agentic-tasks) updated since its cursor and
routes them. Loop restarted by the hourly cron (`sync.yml` pattern).

## Rules (Epic issues only, actor must have write access on `tasks`)

| state | condition | actions |
|---|---|---|
| no `state/*` label | human-created epic | add `kind/manual` (unless `kind/dependency`) and `state/triaging` |
| `state/triaging` | no `<!-- triage -->` comment | `workflow_dispatch` on `agent-triage` with `issue=N` |
| `state/ready` | no `<!-- ping -->` comment | comment pinging the approver to add `state/approved` |
| `state/approved` | added by someone else than the approver | back to `state/ready` + comment |
| `state/approved` | added by the approver | `state/in-progress`, `workflow_dispatch` on `agent-fixer` |
| `state/conflict` | | `state/in-progress`, `workflow_dispatch` on `agent-fixer` |

Events from actors without write access are ignored.

## Secrets

| name | required | purpose |
|---|---|---|
| `GITHUB_TOKEN` | automatic | push the `state` branch (cursor, keep-alive) |
| `TECHDEBTY_TOKEN` | org secret | classic PAT of `podman-desktop-bot` (`repo`, `workflow`): issues on `tasks`, `workflow_dispatch` on `agent-triage` and `agent-fixer` |

`APPROVER` env (default `benoitf`) is the only login allowed to add `state/approved`. Workflow env vars `TASKS_TOKEN` and `DISPATCH_TOKEN` are both fed from `TECHDEBTY_TOKEN`.
