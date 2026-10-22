/** Named bindings for `Octokit` instances. Agents bind the ones they need. */
export const OctokitNames = {
  /** write access to agentic-gardening/agentic-tasks */
  TASKS: 'tasks',
  /** bot account: forks, pushes, PRs on target repos */
  BOT: 'bot',
  /** actions:write on the agent repos (workflow_dispatch) */
  DISPATCH: 'dispatch',
  /** read-only on public repos */
  READ: 'read',
} as const;

export interface RepositoryRef {
  owner: string;
  name: string;
}

export const TASKS_REPOSITORY = Symbol.for('techdebt.tasks-repository');
export const DEFAULT_TASKS_REPOSITORY: RepositoryRef = { owner: 'agentic-gardening', name: 'agentic-tasks' };

export function fullName(ref: RepositoryRef): string {
  return `${ref.owner}/${ref.name}`;
}

export function parseFullName(value: string): RepositoryRef {
  const [owner, name, ...rest] = value.split('/');
  if (!owner || !name || rest.length > 0) {
    throw new Error(`invalid repository "${value}", expected owner/name`);
  }
  return { owner, name };
}
