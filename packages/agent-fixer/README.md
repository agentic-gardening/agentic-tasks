# agent-fixer

LLM agent (Claude Code on Vertex AI, inside an OpenShell sandbox) wrapped in deterministic TypeScript. Dispatched by
agent-tasks-dispatcher once a maintainer added `state/approved` on an epic.

| job | what |
|---|---|
| `plan` | `FixPlanner` reads the epic, its `<!-- triage -->` comment and open Task sub-issues; skips repositories where the bot already has an open PR; emits one matrix entry per repository |
| `fix` (matrix, max 3 in parallel) | forks + clones the repository on branch `techdebt/<package>-<target>`, Claude follows `prompts/fix.md` (bump, apply the playbook fix, run the check suite until green), then `FixFinisher` re-runs `install → lint:check → format:check → typecheck → test → build`; green: `git commit -s`, push to the bot fork, open the PR with `Fixes agentic-gardening/agentic-tasks#<task>`, comment `<!-- pr -->` URL, label `state/pr-open`; red: comment the output, label `state/ci-failed` |
| `epic` | `EpicStateUpdater` sets the epic `state/pr-open` once no child is waiting |

Strategy `B` with `bot_has_write`: after the PR is opened the finisher comments `@dependabot rebase`
on the dependabot PR named in the triage comment (ignored on 403).

Rules: one open bot PR per repository; dependabot PRs are never closed; PR bodies carry no
generated-by line.

## Secrets

| name | required | purpose |
|---|---|---|
| `AGENTIC_GCP_WIF_PROVIDER` | yes | GCP Workload Identity provider; its condition must allow `agentic-gardening/agentic-tasks` `.github/workflows/fixer.yml`; principal needs `roles/aiplatform.user` |
| `AGENTIC_GCP_PROJECT_ID` | yes | GCP project for Vertex AI |
| `AGENTIC_GCP_REGION` | yes (variable) | Vertex AI region |
| `TECHDEBTY_TOKEN` | org secret | classic PAT of `podman-desktop-bot` (`repo`, `workflow`): issues on `tasks`, fork, push, open PRs, comment `@dependabot rebase` |

## Local

```
TASKS_TOKEN=$T BOT_TOKEN=$T node dist/plan.js --issue 12 --out fix-plan.json   # T = the bot's PAT
```
