import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';

import { OctokitNames, type RepositoryRef } from '../github/names';

@injectable()
export class WorkflowDispatcher {
  constructor(@inject('Octokit') @named(OctokitNames.DISPATCH) private readonly octokit: Octokit) {}

  async dispatch(
    repository: RepositoryRef,
    workflowFile: string,
    inputs: Record<string, string>,
    ref = 'main',
  ): Promise<void> {
    await this.octokit.rest.actions.createWorkflowDispatch({
      owner: repository.owner,
      repo: repository.name,
      workflow_id: workflowFile,
      ref,
      inputs,
    });
  }
}
