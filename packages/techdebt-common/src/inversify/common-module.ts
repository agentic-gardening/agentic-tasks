import { ContainerModule } from 'inversify';

import { CatalogClient } from '../catalog/catalog-client';
import { DEFAULT_TASKS_REPOSITORY, TASKS_REPOSITORY } from '../github/names';
import { OctokitBuilder } from '../github/octokit-builder';
import { CheckSuite } from '../pnpm/check-suite';
import { LoopRunner } from '../runtime/loop-runner';
import { ProcessRunner } from '../runtime/process-runner';
import { IssueService } from '../tasks/issue-service';
import { PermissionGuard } from '../tasks/permission-guard';
import { WorkflowDispatcher } from '../tasks/workflow-dispatcher';

/**
 * Binds the shared services. Agents still have to bind the named `Octokit` instances they use
 * (see OctokitNames) and, when needed, STATE_BRANCH_OPTIONS / CATALOG_URL.
 */
export const commonModule = new ContainerModule(({ bind, isBound }) => {
  bind(OctokitBuilder).toSelf().inSingletonScope();
  bind(ProcessRunner).toSelf().inSingletonScope();
  bind(LoopRunner).toSelf().inSingletonScope();
  bind(CheckSuite).toSelf().inSingletonScope();
  bind(CatalogClient).toSelf().inSingletonScope();
  bind(IssueService).toSelf().inSingletonScope();
  bind(PermissionGuard).toSelf().inSingletonScope();
  bind(WorkflowDispatcher).toSelf().inSingletonScope();
  if (!isBound(TASKS_REPOSITORY)) {
    bind(TASKS_REPOSITORY).toConstantValue(DEFAULT_TASKS_REPOSITORY);
  }
});
