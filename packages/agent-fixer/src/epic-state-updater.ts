import { inject, injectable } from 'inversify';
import { IssueService, STATE, stateOf } from 'techdebt-common';

const TERMINAL = new Set<string>([STATE.PR_OPEN, STATE.CI_FAILED, STATE.SKIPPED, STATE.NEEDS_HUMAN, STATE.DONE]);

/** After all matrix jobs: the epic is `state/pr-open` once no child is still waiting for the fixer. */
@injectable()
export class EpicStateUpdater {
  constructor(@inject(IssueService) private readonly issues: IssueService) {}

  async update(epicNumber: number): Promise<string> {
    const epic = await this.issues.getIssue(epicNumber);
    const open = epic.subIssues.filter(c => c.state === 'OPEN');
    const pending = open.filter(c => !TERMINAL.has(stateOf(c.labels) ?? ''));
    if (open.length > 0 && open.every(c => stateOf(c.labels) === STATE.NEEDS_HUMAN)) {
      await this.issues.setState(epic, STATE.NEEDS_HUMAN);
      return STATE.NEEDS_HUMAN;
    }
    if (open.length > 0 && pending.length === 0) {
      await this.issues.setState(epic, STATE.PR_OPEN);
      return STATE.PR_OPEN;
    }
    return stateOf(epic.labels) ?? 'unchanged';
  }
}
