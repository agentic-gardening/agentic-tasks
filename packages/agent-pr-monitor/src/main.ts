import { inject, injectable } from 'inversify';
import { type Issue, IssueService, type IssueSummary, KIND, MARKER, STATE } from 'techdebt-common';

import { OutcomeClassifier } from './outcome-classifier';
import { PrInspector } from './pr-inspector';
import { RebaseService } from './rebase-service';

export const BOT_LOGIN = Symbol.for('agent-pr-monitor.bot-login');

@injectable()
export class MonitorMain {
  constructor(
    @inject(IssueService) private readonly issues: IssueService,
    @inject(PrInspector) private readonly inspector: PrInspector,
    @inject(OutcomeClassifier) private readonly classifier: OutcomeClassifier,
    @inject(RebaseService) private readonly rebase: RebaseService,
    @inject(BOT_LOGIN) private readonly botLogin: string,
  ) {}

  async run(): Promise<void> {
    const epics = (await this.issues.listOpenByLabel(KIND.DEPENDENCY)).concat(
      await this.issues.listOpenByLabel(KIND.MANUAL),
    );
    for (const epic of epics.filter(e => e.type === 'Epic')) {
      for (const child of epic.subIssues.filter(c => c.state === 'OPEN' && c.labels.includes(STATE.PR_OPEN))) {
        await this.handleTask(child);
      }
      await this.closeEpicIfDone(epic);
    }
  }

  private async handleTask(task: IssueSummary): Promise<void> {
    const marker = await this.issues.findComment(task.number, MARKER.PR);
    const ref = marker && PrInspector.parseUrl(marker.body);
    if (!ref) {
      console.log(`#${task.number}: no PR marker comment, skipping`);
      return;
    }
    const status = await this.inspector.inspect(ref);
    const outcome = this.classifier.classify(status);
    console.log(`#${task.number} ${status.url}: ${outcome.kind}`);

    switch (outcome.kind) {
      case 'merged':
        await this.issues.close(task.number, `Merged: ${status.url}`);
        break;
      case 'closed':
        if (outcome.by && outcome.by !== this.botLogin) {
          await this.issues.setState(task, STATE.SKIPPED);
          await this.issues.comment(task.number, `${status.url} was closed by @${outcome.by} without merging.`);
        }
        break;
      case 'conflict': {
        const result = await this.rebase.rebase(status);
        if (result.ok) {
          console.log(`#${task.number}: rebased`);
        } else {
          await this.issues.setState(task, STATE.CONFLICT);
          const files = result.conflicts.map(f => `- \`${f}\``).join('\n');
          await this.issues.comment(
            task.number,
            `${MARKER.CI}\nRebase of ${status.url} needs a manual merge in:\n${files}`,
          );
        }
        break;
      }
      case 'ci-failed':
        await this.issues.setState(task, STATE.CI_FAILED);
        await this.issues.comment(
          task.number,
          `${MARKER.CI}\nChecks failed on ${status.url}: ${outcome.checks.join(', ')}`,
        );
        break;
      case 'needs-human':
        await this.issues.setState(task, STATE.NEEDS_HUMAN);
        await this.issues.comment(
          task.number,
          `${MARKER.CI}\nOnly secret-dependent jobs failed on ${status.url} (${outcome.checks.join(', ')}); a maintainer has to look.`,
        );
        break;
      case 'waiting':
        break;
    }
  }

  private async closeEpicIfDone(epic: Issue): Promise<void> {
    const fresh = await this.issues.getIssue(epic.number);
    if (fresh.subIssues.length === 0 || fresh.subIssues.some(c => c.state === 'OPEN')) return;
    await this.issues.setState(fresh, STATE.DONE);
    await this.issues.close(fresh.number, 'All repositories are updated.');
    console.log(`#${fresh.number}: epic done`);
  }
}
