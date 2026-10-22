import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { RepositoryInspector } from './repository-inspector';

const graphql = vi.fn();
const octokit = { graphql } as unknown as Octokit;
const ref = { owner: 'o', name: 'r' };

beforeEach(() => vi.resetAllMocks());

function repositoryResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    repository: {
      isArchived: false,
      viewerPermission: 'WRITE',
      defaultBranchRef: { name: 'main', target: { oid: 'abc' } },
      lock: { id: 'l' },
      pkg: { id: 'p' },
      ws: null,
      ...overrides,
    },
  };
}

describe('inspect', () => {
  test('returns a single package repository', async () => {
    graphql.mockResolvedValueOnce(repositoryResponse());
    const result = await new RepositoryInspector(octokit).inspect(ref);
    expect(result).toStrictEqual({
      owner: 'o',
      name: 'r',
      default_branch: 'main',
      head: 'abc',
      package_json_paths: ['package.json'],
      bot_has_write: false,
    });
  });

  test('bot_has_write only when a bot token was used', async () => {
    graphql.mockResolvedValueOnce(repositoryResponse());
    expect((await new RepositoryInspector(octokit, true).inspect(ref))?.bot_has_write).toBe(true);
    graphql.mockResolvedValueOnce(repositoryResponse({ viewerPermission: 'READ' }));
    expect((await new RepositoryInspector(octokit, true).inspect(ref))?.bot_has_write).toBe(false);
  });

  test.each([
    ['archived', { isArchived: true }],
    ['no lockfile', { lock: null }],
    ['no package.json', { pkg: null }],
    ['no default branch', { defaultBranchRef: null }],
  ])('skips a repository with %s', async (_label, overrides) => {
    graphql.mockResolvedValueOnce(repositoryResponse(overrides));
    expect(await new RepositoryInspector(octokit).inspect(ref)).toBeUndefined();
  });

  test('skips a missing repository', async () => {
    graphql.mockResolvedValueOnce({ repository: null });
    expect(await new RepositoryInspector(octokit).inspect(ref)).toBeUndefined();
  });

  test('expands workspace globs and keeps only directories with a package.json', async () => {
    graphql
      .mockResolvedValueOnce(
        repositoryResponse({ ws: { text: 'packages:\n  - packages/*\n  - "!packages/skip"\n  - tests/playwright\n' } }),
      )
      .mockResolvedValueOnce({
        repository: {
          object: {
            entries: [
              { name: 'backend', type: 'tree' },
              { name: 'frontend', type: 'tree' },
              { name: 'skip', type: 'tree' },
              { name: 'README.md', type: 'blob' },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ repository: { d0: { id: 'x' }, d1: null, d2: { id: 'y' } } });
    const result = await new RepositoryInspector(octokit).inspect(ref);
    expect(result?.package_json_paths).toStrictEqual([
      'package.json',
      'packages/backend/package.json',
      'tests/playwright/package.json',
    ]);
    expect(graphql.mock.calls[1][1]).toStrictEqual({ owner: 'o', name: 'r', expression: 'HEAD:packages' });
  });
});

describe('workspaceGlobs', () => {
  test('splits includes and excludes', () => {
    expect(RepositoryInspector.workspaceGlobs('packages:\n  - a/*\n  - "!a/b"\n')).toStrictEqual({
      include: ['a/*'],
      exclude: ['a/b'],
    });
    expect(RepositoryInspector.workspaceGlobs(undefined)).toStrictEqual({ include: [], exclude: [] });
    expect(RepositoryInspector.workspaceGlobs('allowBuilds: {}\n')).toStrictEqual({ include: [], exclude: [] });
  });
});
