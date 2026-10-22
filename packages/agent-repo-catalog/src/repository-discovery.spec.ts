import type { Octokit } from '@octokit/rest';
import { describe, expect, test, vi } from 'vitest';

import { RepositoryDiscovery } from './repository-discovery';

describe('matches', () => {
  test.each([
    ['extension-*', 'extension-bootc', true],
    ['extension-*', 'extensions', false],
    ['podman-desktop-*', 'podman-desktop-rhel-ext', true],
    ['*-ext', 'podman-desktop-rhel-ext', true],
    ['*-ext', 'podman-desktop-rhel-extension', false],
    ['minc-extension', 'minc-extension', true],
    ['minc-extension', 'minc-extension2', false],
    ['a*b*c', 'aXXbYYc', true],
    ['a*b*c', 'acb', false],
  ])('%s vs %s -> %s', (glob, name, expected) => {
    expect(RepositoryDiscovery.matches(glob, name)).toBe(expected);
  });
});

describe('discover', () => {
  test('merges explicit repositories with pattern matches, skipping archived ones, sorted and unique', async () => {
    const graphql = vi.fn().mockResolvedValue({
      organization: {
        repositories: {
          nodes: [
            { name: 'extension-bootc', isArchived: false },
            { name: 'extension-old', isArchived: true },
            { name: 'podman-desktop', isArchived: false },
            { name: 'extension-kind', isArchived: false },
          ],
          pageInfo: { hasNextPage: false, endCursor: 'x' },
        },
      },
    });
    const discovery = new RepositoryDiscovery({ graphql } as unknown as Octokit);
    const refs = await discovery.discover({
      repositories: [
        { owner: 'podman-desktop', name: 'extension-kind' },
        { owner: 'minc-org', name: 'minc-extension' },
      ],
      patterns: ['podman-desktop/extension-*'],
    });
    expect(refs).toStrictEqual([
      { owner: 'minc-org', name: 'minc-extension' },
      { owner: 'podman-desktop', name: 'extension-bootc' },
      { owner: 'podman-desktop', name: 'extension-kind' },
    ]);
    expect(graphql).toHaveBeenCalledOnce();
  });
});
