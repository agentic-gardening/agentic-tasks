# agentic-tasks

Monorepo of the agentic-gardening tech-debt agents (one package and one workflow per agent). This repository's issues are the task tracker. See README.md.
Stack: TypeScript, inversify (explicit `@inject`, classes, ContainerModules), vitest, pnpm 12 workspace, eslint + biome format.
Before pushing: `pnpm lint:check && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`.
