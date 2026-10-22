export const STATE = {
  TRIAGING: 'state/triaging',
  READY: 'state/ready',
  APPROVED: 'state/approved',
  IN_PROGRESS: 'state/in-progress',
  PR_OPEN: 'state/pr-open',
  DONE: 'state/done',
  NEEDS_HUMAN: 'state/needs-human',
  CI_FAILED: 'state/ci-failed',
  CONFLICT: 'state/conflict',
  SKIPPED: 'state/skipped',
} as const;
export type State = (typeof STATE)[keyof typeof STATE];
export const STATE_LABELS: readonly State[] = Object.values(STATE);

export const KIND = {
  DEPENDENCY: 'kind/dependency',
  MANUAL: 'kind/manual',
} as const;
export type Kind = (typeof KIND)[keyof typeof KIND];

export const ISSUE_TYPE = { EPIC: 'Epic', TASK: 'Task' } as const;

/** HTML comment markers used to find bot comments. */
export const MARKER = {
  TRIAGE: '<!-- triage -->',
  PING: '<!-- ping -->',
  PR: '<!-- pr -->',
  CI: '<!-- ci -->',
} as const;

export function stateOf(labels: readonly string[]): State | undefined {
  return STATE_LABELS.find(s => labels.includes(s));
}

export function depLabel(pkg: string): string {
  return `dep/${pkg.replace('@', '').replace('/', '-')}`;
}

export type TechdebtReason = 'major' | 'failing-dependabot' | 'stale';

export interface TechdebtBlock {
  kind: 'dependency' | 'manual';
  package?: string;
  target?: string;
  reason?: TechdebtReason;
}

const BLOCK_START = '<!-- techdebt';
const BLOCK_END = '-->';

export function formatTechdebtBlock(block: TechdebtBlock): string {
  const lines = [BLOCK_START, `kind: ${block.kind}`];
  if (block.package) lines.push(`package: ${block.package}`);
  if (block.target) lines.push(`target: ${block.target}`);
  if (block.reason) lines.push(`reason: ${block.reason}`);
  lines.push(BLOCK_END);
  return lines.join('\n');
}

export function parseTechdebtBlock(body: string | undefined): TechdebtBlock | undefined {
  if (!body) return undefined;
  const start = body.indexOf(BLOCK_START);
  if (start === -1) return undefined;
  const end = body.indexOf(BLOCK_END, start);
  if (end === -1) return undefined;
  const inner = body.slice(start + BLOCK_START.length, end);
  const entries: Record<string, string> = {};
  for (const line of inner.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1);
    const hash = raw.indexOf('#');
    const value = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    if (key) entries[key] = value;
  }
  if (entries.kind !== 'dependency' && entries.kind !== 'manual') return undefined;
  return {
    kind: entries.kind,
    package: entries.package || undefined,
    target: entries.target || undefined,
    reason: entries.reason as TechdebtReason | undefined,
  };
}

/** Title keys are the de-duplication keys; keep them ASCII so GitHub search matches them. */
export function epicTitle(pkg: string, target: string): string {
  return `[dep] ${pkg} -> ${target}`;
}

export function taskTitle(owner: string, name: string, pkg: string, target: string): string {
  return `[repo] ${owner}/${name}: ${pkg} -> ${target}`;
}

export function parseTaskTitle(title: string): { owner: string; name: string } | undefined {
  const prefix = '[repo] ';
  const trimmed = title.trim();
  if (!trimmed.startsWith(prefix)) return undefined;
  // older titles have no ": pkg -> target" suffix
  const parts = trimmed.slice(prefix.length).split(':')[0].split('/');
  if (parts.length !== 2 || parts.some(p => p.length === 0 || /\s/.test(p))) return undefined;
  return { owner: parts[0], name: parts[1] };
}
