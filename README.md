# agentic-tasks

The agentic-gardening tech-debt agents, in one pnpm workspace. This repository's issues are also the task tracker (epics and tasks) that the agents read and write.

| package | workflow | what it does |
| --- | --- | --- |
| [techdebt-common](packages/techdebt-common) | | shared library (GitHub clients, issue tracker, state branch) |
| [agent-repo-catalog](https://github.com/agentic-gardening/agent-repo-catalog) | separate repository | publishes `repositories.json`, the list of watched repositories |
| [agent-dep-detector](packages/agent-dep-detector) | [dep-detector.yml](.github/workflows/dep-detector.yml) | opens Epic/Task issues for outdated dependencies |
| [agent-tasks-dispatcher](packages/agent-tasks-dispatcher) | [tasks-dispatcher.yml](.github/workflows/tasks-dispatcher.yml) | watches issues, moves labels, dispatches triage and fixer |
| [agent-triage](packages/agent-triage) | [triage.yml](.github/workflows/triage.yml) | LLM agent that picks a fix strategy for an epic |
| [agent-fixer](packages/agent-fixer) | [fixer.yml](.github/workflows/fixer.yml) | LLM agent that opens the fix pull requests |
| [agent-pr-monitor](packages/agent-pr-monitor) | [pr-monitor.yml](.github/workflows/pr-monitor.yml) | follows the fix pull requests until merged |

Agents that keep state use their own orphan branch, `state-<package>`.

## Develop

```sh
pnpm install
pnpm lint:check && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

Each package's README lists the secrets its workflow needs.
