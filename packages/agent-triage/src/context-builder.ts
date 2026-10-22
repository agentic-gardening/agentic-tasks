import { inject, injectable } from 'inversify';
import {
  CatalogClient,
  IssueService,
  parseTaskTitle,
  parseTechdebtBlock,
  type Repository,
  type TechdebtBlock,
} from 'techdebt-common';

export interface TriageTask {
  number: number;
  title: string;
  repository: string;
  default_branch: string | undefined;
  package_json_paths: string[];
}

export interface TriageContext {
  epic: {
    number: number;
    title: string;
    body: string;
    url: string;
    labels: string[];
    block: TechdebtBlock | undefined;
  };
  tasks: TriageTask[];
  /** the repository to reproduce the bump in: fewest package.json files */
  candidate: TriageTask | undefined;
}

/** Collects everything the triage prompt needs into one JSON document. */
@injectable()
export class ContextBuilder {
  constructor(
    @inject(IssueService) private readonly issues: IssueService,
    @inject(CatalogClient) private readonly catalog: CatalogClient,
  ) {}

  async build(epicNumber: number): Promise<TriageContext> {
    const [epic, repositories] = await Promise.all([this.issues.getIssue(epicNumber), this.catalog.fetch()]);
    const tasks = ContextBuilder.tasks(epic.subIssues, repositories);
    return {
      epic: {
        number: epic.number,
        title: epic.title,
        body: epic.body,
        url: epic.url,
        labels: epic.labels,
        block: parseTechdebtBlock(epic.body),
      },
      tasks,
      candidate: ContextBuilder.pickCandidate(tasks),
    };
  }

  static tasks(
    subIssues: { number: number; title: string; state: string }[],
    repositories: Repository[],
  ): TriageTask[] {
    const tasks: TriageTask[] = [];
    for (const sub of subIssues.filter(s => s.state === 'OPEN')) {
      const ref = parseTaskTitle(sub.title);
      if (!ref) continue;
      const repo = repositories.find(r => r.owner === ref.owner && r.name === ref.name);
      tasks.push({
        number: sub.number,
        title: sub.title,
        repository: `${ref.owner}/${ref.name}`,
        default_branch: repo?.default_branch,
        package_json_paths: repo?.package_json_paths ?? ['package.json'],
      });
    }
    return tasks;
  }

  static pickCandidate(tasks: TriageTask[]): TriageTask | undefined {
    return tasks.toSorted(
      (a, b) => a.package_json_paths.length - b.package_json_paths.length || a.repository.localeCompare(b.repository),
    )[0];
  }
}
