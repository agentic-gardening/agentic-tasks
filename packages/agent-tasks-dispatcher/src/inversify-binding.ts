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

import { ActionExecutor, AGENT_REPOSITORIES, type AgentRepositories } from './action-executor';
import { DispatchRules } from './dispatch-rules';
import { IssueEventPoller } from './issue-event-poller';
import { APPROVER, DispatcherMain } from './main';

export interface DispatcherOptions {
  tasksToken: string;
  dispatchToken: string;
  stateRepository: string;
  stateToken: string;
  approver: string;
  agents: AgentRepositories;
}

export class InversifyBinding {
  constructor(private readonly options: DispatcherOptions) {}

  async initBindings(): Promise<Container> {
    const container = new Container();
    await container.load(commonModule);
    const builder = container.get(OctokitBuilder);

    container
      .bind<Octokit>('Octokit')
      .toConstantValue(builder.build(this.options.tasksToken))
      .whenNamed(OctokitNames.TASKS);
    container
      .bind<Octokit>('Octokit')
      .toConstantValue(builder.build(this.options.dispatchToken))
      .whenNamed(OctokitNames.DISPATCH);
    container.bind<StateBranchOptions>(STATE_BRANCH_OPTIONS).toConstantValue({
      repository: this.options.stateRepository,
      // one state branch per agent: they all live in agentic-tasks
      branch: 'state-agent-tasks-dispatcher',
      token: this.options.stateToken,
    });
    container.bind(StateBranch).toSelf().inSingletonScope();
    container.bind<string>(APPROVER).toConstantValue(this.options.approver);
    container.bind<AgentRepositories>(AGENT_REPOSITORIES).toConstantValue(this.options.agents);

    container.bind(IssueEventPoller).toSelf().inSingletonScope();
    container.bind(DispatchRules).toSelf().inSingletonScope();
    container.bind(ActionExecutor).toSelf().inSingletonScope();
    container.bind(DispatcherMain).toSelf().inSingletonScope();
    return container;
  }
}
