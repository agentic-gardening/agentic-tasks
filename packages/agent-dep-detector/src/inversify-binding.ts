import type { Octokit } from '@octokit/rest';
import { Container } from 'inversify';
import {
  commonModule,
  OctokitBuilder,
  OctokitNames,
  STATE_BRANCH_OPTIONS,
  StateBranch,
  type StateBranchOptions,
} from 'techdebt-common';

import { DependabotService } from './dependabot-service';
import { DetectorMain, DRY_RUN } from './main';
import { ManifestService } from './manifest-service';
import { OutdatedDecider } from './outdated-decider';
import { RegistryService } from './registry-service';
import { TicketService } from './ticket-service';

export interface DetectorOptions {
  /** read access to the watched repositories */
  readToken: string;
  /** write access to agentic-gardening/agentic-tasks; optional in dry-run */
  tasksToken: string | undefined;
  /** owner/name of this agent repository, for the state branch */
  stateRepository: string;
  stateToken: string;
  dryRun: boolean;
}

export class InversifyBinding {
  constructor(private readonly options: DetectorOptions) {}

  async initBindings(): Promise<Container> {
    const container = new Container();
    await container.load(commonModule);
    const builder = container.get(OctokitBuilder);

    container
      .bind<Octokit>('Octokit')
      .toConstantValue(builder.build(this.options.readToken))
      .whenNamed(OctokitNames.READ);
    container
      .bind<Octokit>('Octokit')
      .toConstantValue(builder.build(this.options.tasksToken ?? this.options.readToken))
      .whenNamed(OctokitNames.TASKS);
    container.bind<StateBranchOptions>(STATE_BRANCH_OPTIONS).toConstantValue({
      repository: this.options.stateRepository,
      // one state branch per agent: they all live in agentic-tasks
      branch: 'state-agent-dep-detector',
      token: this.options.stateToken,
    });
    container.bind(StateBranch).toSelf().inSingletonScope();
    container.bind<boolean>(DRY_RUN).toConstantValue(this.options.dryRun);

    container.bind(ManifestService).toSelf().inSingletonScope();
    container.bind(RegistryService).toSelf().inSingletonScope();
    container.bind(DependabotService).toSelf().inSingletonScope();
    container.bind(OutdatedDecider).toSelf().inSingletonScope();
    container.bind(TicketService).toSelf().inSingletonScope();
    container.bind(DetectorMain).toSelf().inSingletonScope();
    return container;
  }
}
