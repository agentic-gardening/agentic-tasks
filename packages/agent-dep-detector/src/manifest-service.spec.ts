import type { Octokit } from '@octokit/rest';
import { expect, test, vi } from 'vitest';

import { ManifestService } from './manifest-service';

test('merge keeps every dependency and the first packageManager/engine', () => {
  const merged = ManifestService.merge('h', [
    { devDependencies: { vitest: '^5' }, packageManager: 'pnpm@12.14.0+sha512.x', engines: { node: '>=24' } },
    { dependencies: { inversify: '^8' }, devDependencies: { vitest: '^4' }, packageManager: 'pnpm@11' },
  ]);
  expect(merged).toStrictEqual({
    head: 'h',
    dependencies: { vitest: '^4', inversify: '^8' },
    resolved: {},
    packageManager: 'pnpm@12.14.0+sha512.x',
    nodeEngine: '>=24',
  });
});

test('collect reuses the cache for unchanged heads and reads the rest', async () => {
  const lock = 'importers:\n  .:\n    devDependencies:\n      vite:\n        specifier: ^8\n        version: 8.3.4\n';
  const graphql = vi.fn().mockResolvedValue({
    repository: {
      p0: { text: '{"devDependencies":{"vite":"^8"}}', isTruncated: false },
      p1: null,
      p2: { text: lock, isTruncated: false },
    },
  });
  const service = new ManifestService({ graphql } as unknown as Octokit);
  const repos = [
    {
      owner: 'o',
      name: 'a',
      default_branch: 'main',
      head: 'same',
      package_json_paths: ['package.json'],
      bot_has_write: false,
    },
    {
      owner: 'o',
      name: 'b',
      default_branch: 'main',
      head: 'new',
      package_json_paths: ['package.json', 'x/package.json'],
      bot_has_write: false,
    },
  ];
  const cached = { head: 'same', dependencies: { a: '1' }, resolved: {} };
  const result = await service.collect(repos, {
    'o/a': cached,
    'o/b': { head: 'old', dependencies: {}, resolved: {} },
  });
  expect(result['o/a']).toBe(cached);
  expect(result['o/b']).toStrictEqual({
    head: 'new',
    dependencies: { vite: '^8' },
    resolved: { vite: '8.3.4' },
    packageManager: undefined,
    nodeEngine: undefined,
  });
  expect(graphql).toHaveBeenCalledOnce();
  expect(graphql.mock.calls[0][0]).toContain('"new:x/package.json"');
});

test('parseLockfile takes the lowest resolved version across importers and strips peer suffixes', () => {
  const lock = `---
lockfileVersion: '9.0'

importers:
  .:
    packageManagerDependencies:
      pnpm:
        specifier: 12.14.0
        version: 12.14.0
---
importers:
  .:
    devDependencies:
      vitest:
        specifier: ^5
        version: 5.0.5(vite@8.3.4)
  packages/a:
    dependencies:
      vitest:
        specifier: ^5
        version: 5.0.4
      '@types/node':
        specifier: ^24
        version: 24.19.2
`;
  expect(ManifestService.parseLockfile(lock)).toStrictEqual({ vitest: '5.0.4', '@types/node': '24.19.2' });
  expect(ManifestService.parseLockfile('not: [valid')).toStrictEqual({});
  expect(ManifestService.parseLockfile('')).toStrictEqual({});
});

test('parse tolerates invalid json', () => {
  expect(ManifestService.parse('{oops')).toStrictEqual({});
});
