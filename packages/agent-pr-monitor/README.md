# agent-pr-monitor

Hourly loop over every Task sub-issue in `state/pr-open` on
[agentic-gardening/agentic-tasks](https://github.com/agentic-gardening/agentic-tasks). The PR URL comes from the
`<!-- pr -->` comment left by agent-fixer.

| pull request | action |
|---|---|
| merged | close the Task; close the Epic with `state/done` once every child is closed |
| closed unmerged by a human | `state/skipped` + comment |
| conflicting | rebase on the upstream default branch; conflicts only in `pnpm-lock.yaml` are solved with `pnpm install --lockfile-only`; anything else: `state/conflict` + comment (the dispatcher re-queues the fixer) |
| checks failed | `state/ci-failed` + comment with the failing jobs |
| only secret-dependent jobs failed (e2e, playwright, codecov, argos, publish, release) | `state/needs-human` |
| pending or green | nothing |

No LLM. Needs `git` and `pnpm` on the runner.

## Secrets

| name | required | purpose |
|---|---|---|
| `TECHDEBTY_TOKEN` | org secret | classic PAT of `podman-desktop-bot` (`repo`, `workflow`): issues on `tasks`, read PRs, push rebased branches to the bot's forks |

`BOT_LOGIN` env (default `podman-desktop-bot`): PRs closed by this login are not treated as "skipped by a human". Workflow env vars `TASKS_TOKEN` and `BOT_TOKEN` are both fed from `TECHDEBTY_TOKEN`.
