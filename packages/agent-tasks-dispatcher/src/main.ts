import { inject, injectable } from 'inversify';
import { StateBranch } from 'techdebt-common';

import { ActionExecutor } from './action-executor';
import { DispatchRules } from './dispatch-rules';
import { IssueEventPoller } from './issue-event-poller';

export const APPROVER = Symbol.for('agent-tasks-dispatcher.approver');

// hardcoded: GITHUB_TOKEN can't read collaborator permissions; 'github-actions' is its GraphQL login
const ALLOWED_ACTORS = new Set(['benoitf', 'github-actions']);

interface Cursor {
  since?: string;
}

@injectable()
export class DispatcherMain {
  constructor(
    @inject(IssueEventPoller) private readonly poller: IssueEventPoller,
    @inject(DispatchRules) private readonly rules: DispatchRules,
    @inject(ActionExecutor) private readonly executor: ActionExecutor,
    @inject(StateBranch) private readonly state: StateBranch,
    @inject(APPROVER) private readonly approver: string,
  ) {}

  async run(): Promise<number> {
    const cursor = await this.state.read<Cursor>('cursor.json', {});
    const issues = await this.poller.poll(cursor.since);
    let actions = 0;
    let latest = cursor.since;
    for (const issue of issues) {
      const planned = await this.rules.evaluate(issue, {
        approver: this.approver,
        hasWriteAccess: async login => ALLOWED_ACTORS.has(login ?? ''),
      });
      for (const action of planned) {
        const reason = 'reason' in action ? ` (${action.reason})` : '';
        console.log(`#${issue.number} ${action.type}${reason}`);
        await this.executor.execute(action, issue.labels);
        if (action.type !== 'ignore') actions++;
      }
      if (!latest || issue.updatedAt > latest) latest = issue.updatedAt;
    }
    if (latest !== cursor.since) {
      await this.state.write('cursor.json', { since: latest });
    }
    // keep-alive commit even when idle, at most once per loop iteration
    await this.state.commitAndPush('chore: dispatcher cursor');
    console.log(`${issues.length} issue(s) seen, ${actions} action(s)`);
    return actions;
  }
}
