import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';
import { fullName, OctokitNames, type RepositoryRef } from 'techdebt-common';

export interface DependabotPullRequest {
  repository: string;
  number: number;
  url: string;
  title: string;
  packages: string[];
}

interface SearchNode {
  number: number;
  url: string;
  title: string;
  body: string;
  repository: { nameWithOwner: string };
}

const BATCH = 10;

/** Open dependabot PRs for the watched repositories, batched search queries. */
@injectable()
export class DependabotService {
  constructor(@inject('Octokit') @named(OctokitNames.READ) private readonly octokit: Octokit) {}

  async openPullRequests(repositories: RepositoryRef[]): Promise<DependabotPullRequest[]> {
    const result: DependabotPullRequest[] = [];
    for (let i = 0; i < repositories.length; i += BATCH) {
      const scope = repositories
        .slice(i, i + BATCH)
        .map(r => `repo:${fullName(r)}`)
        .join(' ');
      const q = `is:pr is:open author:app/dependabot ${scope}`;
      const data = await this.octokit.graphql<{ search: { nodes: (SearchNode | Record<string, never>)[] } }>(
        `query($q: String!) {
          search(query: $q, type: ISSUE, first: 100) {
            nodes {
              ... on PullRequest {
                number url title body
                repository { nameWithOwner }
              }
            }
          }
        }`,
        { q },
      );
      for (const node of data.search.nodes) {
        if (DependabotService.isPullRequest(node)) result.push(DependabotService.toPullRequest(node));
      }
    }
    return result;
  }

  private static isPullRequest(node: SearchNode | Record<string, never>): node is SearchNode {
    return typeof (node as SearchNode).title === 'string';
  }

  static toPullRequest(node: SearchNode): DependabotPullRequest {
    return {
      repository: node.repository.nameWithOwner,
      number: node.number,
      url: node.url,
      title: node.title,
      packages: DependabotService.parsePackages(node.title, node.body ?? ''),
    };
  }

  /** Package names from "bump X from a to b" titles, or from the "Updates `X` from" lines of grouped PR bodies. */
  static parsePackages(title: string, body: string): string[] {
    const packages = new Set<string>();
    const single = /bump (\S+) from \S+ to \S+/.exec(title);
    if (single) packages.add(single[1]);
    for (const match of body.matchAll(/Updates `([^`]+)` from/g)) packages.add(match[1]);
    if (packages.size === 0) {
      const pair = /bump (\S+) and (\S+)/.exec(title);
      if (pair) {
        packages.add(pair[1]);
        packages.add(pair[2]);
      }
    }
    return [...packages];
  }
}
