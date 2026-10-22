#!/usr/bin/env bash
# Idempotent bootstrap of labels on agentic-gardening/agentic-tasks. Needs `gh` with repo scope.
set -euo pipefail
REPO="${1:-agentic-gardening/agentic-tasks}"
while IFS='|' read -r name color desc; do
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null
  echo "label $name"
done <<'LABELS'
state/triaging|fbca04|New, needs a strategy
state/ready|0e8a16|Triaged, waiting for approval
state/approved|1d76db|Approved by a maintainer
state/in-progress|5319e7|Fixer running
state/pr-open|0052cc|PR(s) open on target repos
state/done|c2e0c6|All PRs merged
state/needs-human|d93f0b|No confident strategy
state/ci-failed|b60205|Checks red after fix
state/conflict|e99695|Rebase needs manual merge
state/skipped|cfd3d7|PR closed unmerged
kind/dependency|bfd4f2|Dependency update epic
kind/manual|f9d0c4|Human-created epic
LABELS
echo "Issue type 'Epic' must exist in the org (GraphQL createIssueType needs admin:org scope)."
