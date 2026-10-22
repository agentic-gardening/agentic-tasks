import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';

import { OctokitNames, type RepositoryRef, TASKS_REPOSITORY } from '../github/names';
import { type State, STATE_LABELS, stateOf } from './labels';

export interface IssueRef {
  /** GraphQL node id */
  id: string;
  number: number;
  url: string;
}

export interface IssueSummary extends IssueRef {
  title: string;
  state: 'OPEN' | 'CLOSED';
  labels: string[];
}

export interface Issue extends IssueSummary {
  body: string;
  type: string | undefined;
  author: string | undefined;
  subIssues: IssueSummary[];
  parent: IssueRef | undefined;
}

export interface IssueComment {
  id: number;
  author: string | undefined;
  body: string;
  createdAt: string;
}

export interface CreateIssueInput {
  title: string;
  body: string;
  type: 'Epic' | 'Task';
  labels: string[];
}

interface GqlLabelNodes {
  nodes: { name: string }[];
}
interface GqlIssueSummary {
  id: string;
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'CLOSED';
  labels: GqlLabelNodes;
}
interface GqlIssue extends GqlIssueSummary {
  body: string;
  issueType: { name: string } | null;
  author: { login: string } | null;
  subIssues: { nodes: GqlIssueSummary[] };
  parent: { id: string; number: number; url: string } | null;
}

const ISSUE_FIELDS = `id number url title state body
  issueType { name }
  author { login }
  labels(first: 50) { nodes { name } }
  parent { id number url }
  subIssues(first: 100) { nodes { id number url title state labels(first: 50) { nodes { name } } } }`;

function toSummary(node: GqlIssueSummary): IssueSummary {
  return {
    id: node.id,
    number: node.number,
    url: node.url,
    title: node.title,
    state: node.state,
    labels: node.labels.nodes.map(l => l.name),
  };
}

function toIssue(node: GqlIssue): Issue {
  return {
    ...toSummary(node),
    body: node.body ?? '',
    type: node.issueType?.name,
    author: node.author?.login,
    subIssues: node.subIssues.nodes.map(toSummary),
    parent: node.parent ?? undefined,
  };
}

/** All reads and writes on agentic-gardening/agentic-tasks issues. */
@injectable()
export class IssueService {
  private repositoryId: string | undefined;
  private issueTypeIds: Map<string, string> | undefined;
  private labelIds: Map<string, string> | undefined;

  constructor(
    @inject('Octokit') @named(OctokitNames.TASKS) private readonly octokit: Octokit,
    @inject(TASKS_REPOSITORY) private readonly tasks: RepositoryRef,
  ) {}

  get repository(): RepositoryRef {
    return this.tasks;
  }

  async getIssue(number: number): Promise<Issue> {
    const data = await this.octokit.graphql<{ repository: { issue: GqlIssue } }>(
      `query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) { issue(number: $number) { ${ISSUE_FIELDS} } }
      }`,
      { owner: this.tasks.owner, name: this.tasks.name, number },
    );
    return toIssue(data.repository.issue);
  }

  /** Open issues carrying a given label (any issue type). */
  async listOpenByLabel(label: string): Promise<Issue[]> {
    const issues: Issue[] = [];
    let after: string | undefined;
    do {
      const data = await this.octokit.graphql<{
        repository: { issues: { nodes: GqlIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string } } };
      }>(
        `query($owner: String!, $name: String!, $label: [String!], $after: String) {
          repository(owner: $owner, name: $name) {
            issues(first: 50, after: $after, states: OPEN, labels: $label) {
              nodes { ${ISSUE_FIELDS} }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { owner: this.tasks.owner, name: this.tasks.name, label: [label], after },
      );
      issues.push(...data.repository.issues.nodes.map(toIssue));
      after = data.repository.issues.pageInfo.hasNextPage ? data.repository.issues.pageInfo.endCursor : undefined;
    } while (after);
    return issues;
  }

  /** Exact-title lookup (open or closed). */
  async findByTitle(title: string): Promise<IssueSummary | undefined> {
    const q = `repo:${this.tasks.owner}/${this.tasks.name} is:issue in:title "${title.replaceAll('"', '')}"`;
    const data = await this.octokit.graphql<{ search: { nodes: (GqlIssueSummary | Record<string, never>)[] } }>(
      `query($q: String!) {
        search(query: $q, type: ISSUE, first: 20) {
          nodes { ... on Issue { id number url title state labels(first: 50) { nodes { name } } } }
        }
      }`,
      { q },
    );
    const match = data.search.nodes.find((n): n is GqlIssueSummary => 'title' in n && n.title === title);
    return match ? toSummary(match) : undefined;
  }

  async create(input: CreateIssueInput): Promise<IssueRef> {
    const [repositoryId, issueTypeId, labelIds] = await Promise.all([
      this.getRepositoryId(),
      this.getIssueTypeId(input.type),
      this.getLabelIds(input.labels),
    ]);
    const data = await this.octokit.graphql<{ createIssue: { issue: IssueRef } }>(
      `mutation($input: CreateIssueInput!) { createIssue(input: $input) { issue { id number url } } }`,
      { input: { repositoryId, title: input.title, body: input.body, issueTypeId, labelIds } },
    );
    return data.createIssue.issue;
  }

  async addSubIssue(parent: IssueRef, child: IssueRef): Promise<void> {
    await this.octokit.graphql(
      `mutation($issueId: ID!, $subIssueId: ID!) {
        addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) { issue { id } }
      }`,
      { issueId: parent.id, subIssueId: child.id },
    );
  }

  /** Replaces the current state/* label by `state`. No-op when already there. */
  async setState(issue: { number: number; labels: string[] }, state: State): Promise<void> {
    const current = stateOf(issue.labels);
    if (current === state) return;
    for (const label of issue.labels.filter(l => STATE_LABELS.includes(l as State))) {
      await this.octokit.rest.issues.removeLabel({ ...this.repoParams(), issue_number: issue.number, name: label });
    }
    await this.addLabels(issue.number, [state]);
    issue.labels = [...issue.labels.filter(l => !STATE_LABELS.includes(l as State)), state];
  }

  async addLabels(number: number, labels: string[]): Promise<void> {
    if (labels.length === 0) return;
    await this.octokit.rest.issues.addLabels({ ...this.repoParams(), issue_number: number, labels });
  }

  async removeLabel(number: number, label: string): Promise<void> {
    try {
      await this.octokit.rest.issues.removeLabel({ ...this.repoParams(), issue_number: number, name: label });
    } catch (error: unknown) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
  }

  async comment(number: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({ ...this.repoParams(), issue_number: number, body });
  }

  async listComments(number: number): Promise<IssueComment[]> {
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
      ...this.repoParams(),
      issue_number: number,
      per_page: 100,
    });
    return comments.map(c => ({ id: c.id, author: c.user?.login, body: c.body ?? '', createdAt: c.created_at }));
  }

  async findComment(number: number, marker: string): Promise<IssueComment | undefined> {
    const comments = await this.listComments(number);
    return comments.find(c => c.body.includes(marker));
  }

  async close(number: number, comment?: string): Promise<void> {
    if (comment) await this.comment(number, comment);
    await this.octokit.rest.issues.update({
      ...this.repoParams(),
      issue_number: number,
      state: 'closed',
      state_reason: 'completed',
    });
  }

  private repoParams(): { owner: string; repo: string } {
    return { owner: this.tasks.owner, repo: this.tasks.name };
  }

  private async getRepositoryId(): Promise<string> {
    if (!this.repositoryId) {
      const data = await this.octokit.graphql<{ repository: { id: string } }>(
        `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }`,
        { owner: this.tasks.owner, name: this.tasks.name },
      );
      this.repositoryId = data.repository.id;
    }
    return this.repositoryId;
  }

  private async getIssueTypeId(name: string): Promise<string> {
    if (!this.issueTypeIds) {
      const data = await this.octokit.graphql<{
        repository: { issueTypes: { nodes: { id: string; name: string }[] } };
      }>(
        `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) { issueTypes(first: 20) { nodes { id name } } }
        }`,
        { owner: this.tasks.owner, name: this.tasks.name },
      );
      this.issueTypeIds = new Map(data.repository.issueTypes.nodes.map(n => [n.name, n.id]));
    }
    const id = this.issueTypeIds.get(name);
    if (!id) throw new Error(`issue type "${name}" does not exist on ${this.tasks.owner}/${this.tasks.name}`);
    return id;
  }

  private async getLabelIds(names: string[]): Promise<string[]> {
    if (!this.labelIds) {
      const data = await this.octokit.graphql<{ repository: { labels: { nodes: { id: string; name: string }[] } } }>(
        `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) { labels(first: 100) { nodes { id name } } }
        }`,
        { owner: this.tasks.owner, name: this.tasks.name },
      );
      this.labelIds = new Map(data.repository.labels.nodes.map(n => [n.name, n.id]));
    }
    const ids: string[] = [];
    for (const name of names) {
      let id = this.labelIds.get(name);
      if (!id) {
        const { data } = await this.octokit.rest.issues.createLabel({ ...this.repoParams(), name, color: 'ededed' });
        id = data.node_id;
        this.labelIds.set(name, id);
      }
      ids.push(id);
    }
    return ids;
  }
}
