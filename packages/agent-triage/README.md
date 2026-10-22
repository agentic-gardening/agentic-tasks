# agent-triage

LLM agent (Claude Code on Vertex AI, inside an OpenShell sandbox) that decides how a tech-debt epic should be fixed.
Dispatched by agent-tasks-dispatcher with the epic number; one job per epic.

1. On the host, `node dist/context.js` collects the epic, its Task sub-issues and the catalog entry of
   each repository into `triage-context.json` and picks the smallest repository as candidate. The
   candidate is cloned, its open dependabot PRs listed, and all of it put with a playbook copy in a
   work dir mounted into the sandbox.
2. In the sandbox (same setup as review-processing/review and agent-fixer: GCP WIF -> Vertex
   provider, egress limited to Vertex for claude and npm/GitHub tarballs for node, no GitHub token),
   Claude follows `prompts/triage.md`: applies the bump, runs the pnpm check suite, maps the first
   failure to the playbook and writes one structured `<!-- triage -->` comment (strategy B or C,
   failing step, files, risk, confidence). It edits the playbook copy when it met a new pattern.
3. Back on the host the comment is validated and posted on the epic, the epic relabeled
   `state/ready` (B/C, confidence >= 0.6) or `state/needs-human`, and a playbook PR opened when the
   copy changed.

The playbook `docs/DEPENDENCY_FIX_PLAYBOOK.md` is the knowledge base; agent-fixer copies it from
`packages/agent-triage/docs/`.

## Secrets

| name | required | purpose |
|---|---|---|
| `AGENTIC_GCP_WIF_PROVIDER` | yes | GCP Workload Identity provider; its condition must allow `agentic-gardening/agentic-tasks` `.github/workflows/triage.yml`; principal needs `roles/aiplatform.user` |
| `AGENTIC_GCP_PROJECT_ID` | yes | GCP project for Vertex AI |
| `AGENTIC_GCP_REGION` | yes (variable) | Vertex AI region |
| `TECHDEBTY_TOKEN` | org secret | classic PAT of `podman-desktop-bot` (`repo`, `workflow`): read the epic, comment, relabel on `tasks`; open playbook PRs here |
