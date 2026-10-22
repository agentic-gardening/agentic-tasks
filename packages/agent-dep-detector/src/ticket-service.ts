import { inject, injectable } from 'inversify';
import semver from 'semver';
import {
  depLabel,
  epicTitle,
  formatTechdebtBlock,
  type Issue,
  type IssueRef,
  IssueService,
  type IssueSummary,
  KIND,
  parseTaskTitle,
  parseTechdebtBlock,
  STATE,
  taskTitle,
} from 'techdebt-common';

import type { Manifest, ManifestCache } from './manifest-service';
import type { Finding } from './outdated-decider';
import { OutdatedDecider } from './outdated-decider';

/** epic title -> issue number, persisted on the state branch */
export type IssueCache = Record<string, number>;

export interface TicketReport {
  epicsCreated: string[];
  tasksCreated: string[];
  tasksClosed: string[];
}

/** Creates and closes Epic/Task issues from findings. Idempotent, dry-run aware. */
@injectable()
export class TicketService {
  constructor(@inject(IssueService) private readonly issues: IssueService) {}

  async apply(
    findings: Finding[],
    cache: IssueCache,
    manifests: ManifestCache,
    dryRun: boolean,
  ): Promise<TicketReport> {
    const report: TicketReport = { epicsCreated: [], tasksCreated: [], tasksClosed: [] };
    const byEpic = new Map<string, Finding[]>();
    for (const finding of findings) {
      const title = epicTitle(finding.package, finding.epicTarget);
      byEpic.set(title, [...(byEpic.get(title) ?? []), finding]);
    }

    for (const [title, group] of byEpic) {
      const epic = await this.ensureEpic(title, group[0], cache, dryRun, report);
      if (!epic) continue;
      const children = epic.subIssues;
      for (const finding of group) {
        const [owner, name] = finding.repository.split('/');
        const childTitle = taskTitle(owner, name);
        if (children.some(c => c.title === childTitle)) continue;
        report.tasksCreated.push(`${title} :: ${childTitle}`);
        if (dryRun) continue;
        const child = await this.issues.create({
          title: childTitle,
          body: TicketService.taskBody(finding, epic),
          type: 'Task',
          labels: [KIND.DEPENDENCY, depLabel(finding.package)],
        });
        await this.issues.addSubIssue(epic, child);
      }
    }

    await this.closeSatisfied(manifests, dryRun, report);
    return report;
  }

  private async ensureEpic(
    title: string,
    sample: Finding,
    cache: IssueCache,
    dryRun: boolean,
    report: TicketReport,
  ): Promise<(IssueRef & { subIssues: IssueSummary[] }) | undefined> {
    const number = cache[title] ?? (await this.issues.findByTitle(title))?.number;
    if (number) {
      const issue = await this.issues.getIssue(number);
      cache[title] = number;
      if (issue.state === 'OPEN') return issue;
      // closed epic: that round is over, open a new one since the repository is still outdated
      // ponytail: if state is lost, findByTitle may return the old closed epic -> one extra epic; filter by state in findByTitle if that bites
    }
    report.epicsCreated.push(title);
    if (dryRun) return { id: 'dry-run', number: 0, url: '', subIssues: [] };
    const created = await this.issues.create({
      title,
      body: TicketService.epicBody(sample),
      type: 'Epic',
      labels: [STATE.TRIAGING, KIND.DEPENDENCY, depLabel(sample.package)],
    });
    cache[title] = created.number;
    return { ...created, subIssues: [] };
  }

  /** Closes Task children whose repository now satisfies the epic target. */
  private async closeSatisfied(manifests: ManifestCache, dryRun: boolean, report: TicketReport): Promise<void> {
    for (const epic of await this.issues.listOpenByLabel(KIND.DEPENDENCY)) {
      if (epic.type !== 'Epic') continue;
      const block = parseTechdebtBlock(epic.body);
      if (block?.kind !== 'dependency' || !block.package || !block.target) continue;
      for (const child of epic.subIssues.filter(c => c.state === 'OPEN')) {
        const ref = parseTaskTitle(child.title);
        const manifest = ref && manifests[`${ref.owner}/${ref.name}`];
        if (!manifest || !TicketService.satisfies(manifest, block.package, block.target)) continue;
        report.tasksClosed.push(`${epic.title} :: ${child.title}`);
        if (!dryRun)
          await this.issues.close(child.number, `Repository is now on ${block.package} ${block.target}, closing.`);
      }
    }
  }

  static satisfies(manifest: Manifest, pkg: string, target: string): boolean {
    const range = Object.fromEntries(OutdatedDecider.declared(manifest))[pkg];
    const current = range ? OutdatedDecider.currentOf(manifest, pkg, range) : undefined;
    if (!current) return true; // dependency removed: nothing left to update
    const wanted = semver.valid(target) ? target : `${target}.0.0`;
    return semver.valid(target) ? semver.gte(current, wanted) : semver.major(current) >= semver.major(wanted);
  }

  static epicBody(finding: Finding): string {
    return [
      `Update **${finding.package}** to **${finding.epicTarget}** across the watched repositories.`,
      '',
      `Reason: \`${finding.reason}\`. One sub-issue per repository; the triage agent will post a strategy comment.`,
      '',
      formatTechdebtBlock({
        kind: 'dependency',
        package: finding.package,
        target: finding.epicTarget,
        reason: finding.reason,
      }),
    ].join('\n');
  }

  static taskBody(finding: Finding, epic: Pick<Issue, 'number'> | IssueRef): string {
    return [
      `Update \`${finding.package}\` from \`${finding.current}\` to \`${finding.target}\` in https://github.com/${finding.repository}.`,
      '',
      `Part of #${epic.number}.`,
    ].join('\n');
  }
}
