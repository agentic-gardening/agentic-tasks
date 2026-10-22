import { inject, injectable } from 'inversify';
import { IssueService, WorkflowDispatcher } from 'techdebt-common';

import type { Action } from './dispatch-rules';

export const AGENT_REPOSITORIES = Symbol.for('agent-tasks-dispatcher.agent-repositories');
/** repository holding the agent workflows, and the workflow file of each agent */
export interface AgentRepositories {
  owner: string;
  name: string;
  triage: string;
  fixer: string;
}

@injectable()
export class ActionExecutor {
  constructor(
    @inject(IssueService) private readonly issues: IssueService,
    @inject(WorkflowDispatcher) private readonly workflows: WorkflowDispatcher,
    @inject(AGENT_REPOSITORIES) private readonly agents: AgentRepositories,
  ) {}

  async execute(action: Action, labels: string[]): Promise<void> {
    switch (action.type) {
      case 'set-state':
        await this.issues.setState({ number: action.issue, labels }, action.state);
        break;
      case 'add-labels':
        await this.issues.addLabels(action.issue, action.labels);
        break;
      case 'comment':
        await this.issues.comment(action.issue, action.body);
        break;
      case 'dispatch':
        await this.workflows.dispatch(
          { owner: this.agents.owner, name: this.agents.name },
          this.agents[action.agent],
          action.inputs,
        );
        break;
      case 'ignore':
        break;
    }
  }
}
