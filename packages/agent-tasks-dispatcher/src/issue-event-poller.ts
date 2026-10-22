import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';
import { OctokitNames, type RepositoryRef, TASKS_REPOSITORY } from 'techdebt-common';

export interface LabelEvent {
  label: string;
  actor: string | undefined;
  createdAt: string;
}

export interface PolledIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  type: string | undefined;
  author: string | undefined;
  labels: string[];
  updatedAt: string;
  /** most recent first */
  labelEvents: LabelEvent[];
  commentMarkers: string[];
}

interface GqlNode {
  id: string;
  number: number;
  title: string;
  body: string;
  updatedAt: string;
  issueType: { name: string } | null;
  author: { login: string } | null;
  labels: { nodes: { name: string }[] };
  timelineItems: {
    nodes: (
      | { __typename: 'LabeledEvent'; createdAt: string; actor: { login: string } | null; label: { name: string } }
      | { __typename: string }
    )[];
  };
  comments: { nodes: { body: string }[] };
}

/** Open issues of the tasks repository updated since a cursor, with the label history needed by the rules. */
@injectable()
export class IssueEventPoller {
  constructor(
    @inject('Octokit') @named(OctokitNames.TASKS) private readonly octokit: Octokit,
    @inject(TASKS_REPOSITORY) private readonly tasks: RepositoryRef,
  ) {}

  async poll(since: string | undefined): Promise<PolledIssue[]> {
    const issues: PolledIssue[] = [];
    let after: string | undefined;
    do {
      const data = await this.octokit.graphql<{
        repository: { issues: { nodes: GqlNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } } };
      }>(
        `query($owner: String!, $name: String!, $since: DateTime, $after: String) {
          repository(owner: $owner, name: $name) {
            issues(first: 50, after: $after, states: OPEN, filterBy: { since: $since }, orderBy: { field: UPDATED_AT, direction: ASC }) {
              nodes {
                id number title body updatedAt
                issueType { name }
                author { login }
                labels(first: 50) { nodes { name } }
                timelineItems(last: 30, itemTypes: [LABELED_EVENT]) {
                  nodes { __typename ... on LabeledEvent { createdAt actor { login } label { name } } }
                }
                comments(last: 100) { nodes { body } }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { owner: this.tasks.owner, name: this.tasks.name, since, after },
      );
      issues.push(...data.repository.issues.nodes.map(IssueEventPoller.toIssue));
      after = data.repository.issues.pageInfo.hasNextPage ? data.repository.issues.pageInfo.endCursor : undefined;
    } while (after);
    return issues;
  }

  static toIssue(node: GqlNode): PolledIssue {
    const labelEvents: LabelEvent[] = [];
    for (const item of node.timelineItems.nodes) {
      if (item.__typename !== 'LabeledEvent' || !('label' in item)) continue;
      labelEvents.push({ label: item.label.name, actor: item.actor?.login, createdAt: item.createdAt });
    }
    labelEvents.reverse();
    const commentMarkers: string[] = [];
    for (const comment of node.comments.nodes) {
      const match = /<!--\s*([a-z-]+)\s*-->/.exec(comment.body);
      if (match) commentMarkers.push(`<!-- ${match[1]} -->`);
    }
    return {
      id: node.id,
      number: node.number,
      title: node.title,
      body: node.body ?? '',
      type: node.issueType?.name,
      author: node.author?.login,
      labels: node.labels.nodes.map(l => l.name),
      updatedAt: node.updatedAt,
      labelEvents,
      commentMarkers,
    };
  }
}
