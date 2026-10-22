import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';

import { OctokitNames, type RepositoryRef, TASKS_REPOSITORY } from '../github/names';

const WRITE_LEVELS = new Set(['admin', 'write', 'maintain']);

/** Only people with write access on the tasks repository may drive the agents. */
@injectable()
export class PermissionGuard {
  private readonly cache = new Map<string, boolean>();

  constructor(
    @inject('Octokit') @named(OctokitNames.TASKS) private readonly octokit: Octokit,
    @inject(TASKS_REPOSITORY) private readonly tasks: RepositoryRef,
  ) {}

  async hasWriteAccess(login: string | undefined): Promise<boolean> {
    if (!login) return false;
    const cached = this.cache.get(login);
    if (cached !== undefined) return cached;
    const allowed = await this.lookup(login);
    this.cache.set(login, allowed);
    return allowed;
  }

  private async lookup(login: string): Promise<boolean> {
    try {
      const { data } = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner: this.tasks.owner,
        repo: this.tasks.name,
        username: login,
      });
      return WRITE_LEVELS.has(data.permission) || WRITE_LEVELS.has(data.role_name ?? '');
    } catch {
      return false;
    }
  }
}
