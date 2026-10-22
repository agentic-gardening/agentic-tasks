import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';
import {
  CatalogClient,
  IssueService,
  MARKER,
  OctokitNames,
  parseTaskTitle,
  parseTechdebtBlock,
  STATE,
  type TechdebtBlock,
} from 'techdebt-common';

import { parseTriageComment, type TriageDecision } from './triage-comment';

export interface FixJob {
  epic: number;
  task: number;
  owner: string;
  name: string;
  default_branch: string;
  bot_has_write: boolean;
  branch: string;
  package: string | undefined;
  target: string | undefined;
  strategy: TriageDecision['strategy'];
}

export interface FixPlan {
  epic: { number: number; title: string; body: string; block: TechdebtBlock | undefined };
  triage: TriageDecision | undefined;
  jobs: FixJob[];
  skipped: { task: number; reason: string }[];
}

export const BOT_LOGIN = Symbol.for('agent-fixer.bot-login');

const ACTIONABLE = new Set<string>([STATE.IN_PROGRESS, STATE.APPROVED, STATE.CONFLICT, STATE.CI_FAILED]);

/** One matrix job per open Task that has no bot PR yet. */
@injectable()
export class FixPlanner {
  constructor(
    @inject(IssueService) private readonly issues: IssueService,
    @inject(CatalogClient) private readonly catalog: CatalogClient,
    @inject('Octokit') @named(OctokitNames.BOT) private readonly bot: Octokit,
    @inject(BOT_LOGIN) private readonly botLogin: string,
  ) {}

  async plan(epicNumber: number, only?: number): Promise<FixPlan> {
    const [epic, repositories] = await Promise.all([this.issues.getIssue(epicNumber), this.catalog.fetch()]);
    const block = parseTechdebtBlock(epic.body);
    const triageComment = await this.issues.findComment(epicNumber, MARKER.TRIAGE);
    const triage = triageComment ? parseTriageComment(triageComment.body) : undefined;
    const plan: FixPlan = {
      epic: { number: epic.number, title: epic.title, body: epic.body, block },
      triage,
      jobs: [],
      skipped: [],
    };

    for (const task of epic.subIssues) {
      if (only !== undefined && task.number !== only) continue;
      if (task.state !== 'OPEN') continue;
      const state = task.labels.find(l => l.startsWith('state/'));
      if (state && !ACTIONABLE.has(state)) {
        plan.skipped.push({ task: task.number, reason: `state ${state}` });
        continue;
      }
      const ref = parseTaskTitle(task.title);
      if (!ref) {
        plan.skipped.push({ task: task.number, reason: 'title is not a [repo] task' });
        continue;
      }
      const repo = repositories.find(r => r.owner === ref.owner && r.name === ref.name);
      if (!repo) {
        plan.skipped.push({ task: task.number, reason: `${ref.owner}/${ref.name} not in catalog` });
        continue;
      }
      if (await this.hasOpenBotPullRequest(ref.owner, ref.name)) {
        plan.skipped.push({ task: task.number, reason: 'bot already has an open PR in this repository' });
        continue;
      }
      plan.jobs.push({
        epic: epic.number,
        task: task.number,
        owner: repo.owner,
        name: repo.name,
        default_branch: repo.default_branch,
        bot_has_write: repo.bot_has_write,
        branch: FixPlanner.branchName(epic.number, block),
        package: block?.package,
        target: block?.target,
        strategy: triage?.strategy ?? 'C',
      });
    }
    return plan;
  }

  static branchName(epic: number, block: TechdebtBlock | undefined): string {
    const slug = block?.package ? `${block.package}-${block.target ?? 'latest'}` : `epic-${epic}`;
    let safe = '';
    for (const char of slug) safe += /[a-zA-Z0-9.-]/.test(char) ? char : '-';
    while (safe.includes('--')) safe = safe.replaceAll('--', '-');
    let start = 0;
    let end = safe.length;
    while (start < end && safe[start] === '-') start++;
    while (end > start && safe[end - 1] === '-') end--;
    return `techdebt/${safe.slice(start, end)}`;
  }

  private async hasOpenBotPullRequest(owner: string, name: string): Promise<boolean> {
    const { data } = await this.bot.rest.search.issuesAndPullRequests({
      q: `is:pr is:open author:${this.botLogin} repo:${owner}/${name}`,
      per_page: 1,
    });
    return data.total_count > 0;
  }
}
