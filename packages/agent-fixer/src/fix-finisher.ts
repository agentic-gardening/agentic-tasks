import type { Octokit } from '@octokit/rest';
import { inject, injectable, named, optional } from 'inversify';
import { CheckSuite, IssueService, MARKER, OctokitNames, ProcessRunner, STATE } from 'techdebt-common';

import type { FixJob } from './fix-planner';
import { BOT_LOGIN } from './fix-planner';
import type { TriageDecision } from './triage-comment';

export const BOT_TOKEN = Symbol.for('agent-fixer.bot-token');
export const DEPENDABOT_REBASE_OCTOKIT = 'dependabot-rebase';

export type FinishResult = { ok: true; url: string } | { ok: false; step: string } | { ok: false; step: 'no-changes' };

/** Verifies the working tree Claude produced, pushes it to the bot fork and opens the PR. */
@injectable()
export class FixFinisher {
  constructor(
    @inject(IssueService) private readonly issues: IssueService,
    @inject(CheckSuite) private readonly checks: CheckSuite,
    @inject(ProcessRunner) private readonly processRunner: ProcessRunner,
    @inject('Octokit') @named(OctokitNames.BOT) private readonly bot: Octokit,
    @inject(BOT_TOKEN) private readonly botToken: string,
    @inject(BOT_LOGIN) private readonly botLogin: string,
    @inject('Octokit') @named(DEPENDABOT_REBASE_OCTOKIT) @optional() private readonly rebaseOctokit?: Octokit,
  ) {}

  async finish(job: FixJob, triage: TriageDecision | undefined, workdir: string): Promise<FinishResult> {
    const taskRef = { number: job.task, labels: (await this.issues.getIssue(job.task)).labels };
    const diff = await this.processRunner.run('git', ['status', '--porcelain'], { cwd: workdir });
    if (diff.stdout.trim() === '') {
      await this.issues.setState(taskRef, STATE.NEEDS_HUMAN);
      await this.issues.comment(job.task, `${MARKER.CI}\nThe fixer produced no change for this repository.`);
      return { ok: false, step: 'no-changes' };
    }

    const result = await this.checks.run(workdir);
    if (!result.ok) {
      await this.issues.setState(taskRef, STATE.CI_FAILED);
      await this.issues.comment(
        job.task,
        `${MARKER.CI}\n\`pnpm ${result.step}\` failed after the fix:\n\n\`\`\`\n${result.output.slice(-4000)}\n\`\`\``,
      );
      return { ok: false, step: result.step };
    }

    const title = FixFinisher.title(job);
    await this.processRunner.exec('git', ['config', 'user.name', this.botLogin], { cwd: workdir });
    await this.processRunner.exec('git', ['config', 'user.email', `${this.botLogin}@users.noreply.github.com`], {
      cwd: workdir,
    });
    await this.processRunner.exec('git', ['add', '-A'], { cwd: workdir });
    await this.processRunner.exec(
      'git',
      ['commit', '-s', '-q', '-m', `${title}\n\nFixes agentic-gardening/agentic-tasks#${job.task}`],
      { cwd: workdir },
    );
    const fork = `https://x-access-token:${this.botToken}@github.com/${this.botLogin}/${job.name}.git`;
    await this.processRunner.exec('git', ['push', '--quiet', '--force', fork, `HEAD:refs/heads/${job.branch}`], {
      cwd: workdir,
    });

    const { data: pr } = await this.bot.rest.pulls.create({
      owner: job.owner,
      repo: job.name,
      title,
      head: `${this.botLogin}:${job.branch}`,
      base: job.default_branch,
      body: FixFinisher.body(job, triage),
      maintainer_can_modify: true,
    });

    await this.issues.comment(job.task, `${MARKER.PR}\n${pr.html_url}`);
    await this.issues.setState(taskRef, STATE.PR_OPEN);
    await this.requestDependabotRebase(job, triage);
    return { ok: true, url: pr.html_url };
  }

  /** Strategy B: once the prep PR exists, ask dependabot to rebase its own PR (needs write access). */
  private async requestDependabotRebase(job: FixJob, triage: TriageDecision | undefined): Promise<void> {
    if (job.strategy !== 'B' || !job.bot_has_write || !triage?.dependabot_pr || !this.rebaseOctokit) return;
    const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(triage.dependabot_pr);
    if (!match) return;
    try {
      await this.rebaseOctokit.rest.issues.createComment({
        owner: match[1],
        repo: match[2],
        issue_number: Number(match[3]),
        body: '@dependabot rebase',
      });
    } catch (error: unknown) {
      console.log(`@dependabot rebase skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static title(job: FixJob): string {
    if (!job.package) return `chore: tech-debt epic agentic-gardening/agentic-tasks#${job.epic}`;
    const target = job.target && /^\d+$/.test(job.target) ? `v${job.target}` : (job.target ?? 'latest');
    return `chore(deps): update ${job.package} to ${target}`;
  }

  static body(job: FixJob, triage: TriageDecision | undefined): string {
    const lines = [
      `Fixes agentic-gardening/agentic-tasks#${job.task}`,
      `Epic: agentic-gardening/agentic-tasks#${job.epic}`,
      '',
    ];
    if (triage?.playbook_section) lines.push(`Playbook section: \`${triage.playbook_section}\`.`);
    if (triage?.notes) lines.push('', '### Triage notes', '', triage.notes);
    lines.push(
      '',
      '### Checks',
      '',
      'Ran `pnpm install`, `lint:check`, `format:check`, `typecheck`, `test` and `build` locally before opening this PR.',
    );
    return lines.join('\n');
  }
}
