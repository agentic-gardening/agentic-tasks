import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';
import { fullName, OctokitNames, parseFullName, type RepositoryRef } from 'techdebt-common';

import type { CatalogDefinition } from './catalog-config';

interface OrgRepositoriesPage {
  organization: {
    repositories: {
      nodes: { name: string; isArchived: boolean }[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

/** Turns catalog.yaml into a de-duplicated, sorted list of repository references. */
@injectable()
export class RepositoryDiscovery {
  constructor(@inject('Octokit') @named(OctokitNames.READ) private readonly octokit: Octokit) {}

  async discover(definition: CatalogDefinition): Promise<RepositoryRef[]> {
    const found = new Map<string, RepositoryRef>();
    for (const ref of definition.repositories) found.set(fullName(ref), ref);

    const byOwner = new Map<string, string[]>();
    for (const pattern of definition.patterns) {
      const { owner, name } = parseFullName(pattern);
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), name]);
    }
    for (const [owner, globs] of byOwner) {
      const names = await this.listOrganizationRepositories(owner);
      for (const name of names) {
        if (globs.some(glob => RepositoryDiscovery.matches(glob, name))) found.set(`${owner}/${name}`, { owner, name });
      }
    }
    return [...found.values()].toSorted((a, b) => fullName(a).localeCompare(fullName(b)));
  }

  static matches(glob: string, name: string): boolean {
    const parts = glob.split('*');
    if (parts.length === 1) return glob === name;
    if (!name.startsWith(parts[0]) || !name.endsWith(parts.at(-1) ?? '')) return false;
    let position = parts[0].length;
    for (const part of parts.slice(1, -1)) {
      const index = name.indexOf(part, position);
      if (index === -1) return false;
      position = index + part.length;
    }
    return position <= name.length - (parts.at(-1)?.length ?? 0);
  }

  private async listOrganizationRepositories(owner: string): Promise<string[]> {
    const names: string[] = [];
    let after: string | undefined;
    do {
      const data = await this.octokit.graphql<OrgRepositoriesPage>(
        `query($owner: String!, $after: String) {
          organization(login: $owner) {
            repositories(first: 100, after: $after) {
              nodes { name isArchived }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { owner, after },
      );
      const page = data.organization.repositories;
      names.push(...page.nodes.filter(n => !n.isArchived).map(n => n.name));
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
    } while (after);
    return names;
  }
}
