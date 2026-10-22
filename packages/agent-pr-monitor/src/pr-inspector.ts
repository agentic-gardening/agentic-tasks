import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';
import { OctokitNames } from 'techdebt-common';

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PullRequestStatus {
  ref: PullRequestRef;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  checks: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NONE';
  failedChecks: string[];
  headRef: string;
  headRepo: string;
  baseRef: string;
  /** closed by someone else than the bot */
  closedBy: string | undefined;
}

interface GqlPullRequest {
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  headRefName: string;
  baseRefName: string;
  headRepository: { nameWithOwner: string } | null;
  timelineItems: { nodes: { actor: { login: string } | null }[] };
  commits: {
    nodes: {
      commit: {
        statusCheckRollup: {
          state: string;
          contexts: { nodes: ({ name: string; conclusion: string | null } | { context: string; state: string })[] };
        } | null;
      };
    }[];
  };
}

/** Reads what the monitor needs about one pull request. */
@injectable()
export class PrInspector {
  constructor(@inject('Octokit') @named(OctokitNames.BOT) private readonly octokit: Octokit) {}

  static parseUrl(url: string): PullRequestRef | undefined {
    const match = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(url);
    return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : undefined;
  }

  async inspect(ref: PullRequestRef): Promise<PullRequestStatus> {
    const data = await this.octokit.graphql<{ repository: { pullRequest: GqlPullRequest } }>(
      `query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            url state mergeable headRefName baseRefName
            headRepository { nameWithOwner }
            timelineItems(last: 1, itemTypes: [CLOSED_EVENT]) { nodes { ... on ClosedEvent { actor { login } } } }
            commits(last: 1) {
              nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes {
                ... on CheckRun { name conclusion }
                ... on StatusContext { context state }
              } } } } }
            }
          }
        }
      }`,
      { owner: ref.owner, repo: ref.repo, number: ref.number },
    );
    return PrInspector.toStatus(ref, data.repository.pullRequest);
  }

  static toStatus(ref: PullRequestRef, pr: GqlPullRequest): PullRequestStatus {
    const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup;
    const failed: string[] = [];
    for (const context of rollup?.contexts.nodes ?? []) {
      if (
        'conclusion' in context &&
        context.conclusion &&
        ['FAILURE', 'TIMED_OUT', 'CANCELLED'].includes(context.conclusion)
      ) {
        failed.push(context.name);
      } else if ('context' in context && ['FAILURE', 'ERROR'].includes(context.state)) {
        failed.push(context.context);
      }
    }
    let checks: PullRequestStatus['checks'] = 'NONE';
    if (rollup) {
      if (rollup.state === 'SUCCESS') checks = 'SUCCESS';
      else if (['FAILURE', 'ERROR'].includes(rollup.state)) checks = 'FAILURE';
      else checks = 'PENDING';
    }
    return {
      ref,
      url: pr.url,
      state: pr.state,
      mergeable: pr.mergeable,
      checks,
      failedChecks: failed,
      headRef: pr.headRefName,
      headRepo: pr.headRepository?.nameWithOwner ?? `${ref.owner}/${ref.repo}`,
      baseRef: pr.baseRefName,
      closedBy: pr.state === 'CLOSED' ? pr.timelineItems.nodes[0]?.actor?.login : undefined,
    };
  }
}
