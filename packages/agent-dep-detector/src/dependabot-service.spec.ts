import { describe, expect, test } from 'vitest';

import { DependabotService } from './dependabot-service';

describe('parsePackages', () => {
  test('single bump title', () => {
    expect(DependabotService.parsePackages('chore(deps-dev): bump vitest from 3.2.4 to 5.0.3', '')).toStrictEqual([
      'vitest',
    ]);
    expect(
      DependabotService.parsePackages('build(deps): bump @types/node from 24.1.0 to 26.0.0 in /packages/backend', ''),
    ).toStrictEqual(['@types/node']);
  });
  test('grouped PR uses the body', () => {
    const body =
      'Bumps the vitest group with 2 updates.\n\nUpdates `vitest` from 4.1.4 to 5.0.3\n\nUpdates `@vitest/coverage-v8` from 4.1.4 to 5.0.3\n';
    expect(DependabotService.parsePackages('chore(deps): bump the vitest group with 2 updates', body)).toStrictEqual([
      'vitest',
      '@vitest/coverage-v8',
    ]);
  });
  test('"X and Y" title without body', () => {
    expect(DependabotService.parsePackages('chore(deps): bump eslint and @eslint/js', '')).toStrictEqual([
      'eslint',
      '@eslint/js',
    ]);
  });
});

describe('toPullRequest', () => {
  const node = (
    state: string | undefined,
    forcePushes: number,
    updatedAt = '2026-10-09T00:00:00Z',
  ): Parameters<typeof DependabotService.toPullRequest>[0] => ({
    number: 5,
    url: 'u',
    title: 'chore(deps): bump vitest from 4.1.4 to 5.0.3',
    body: '',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt,
    repository: { nameWithOwner: 'o/r' },
    commits: { nodes: [{ commit: { statusCheckRollup: state ? { state } : null } }] },
    timelineItems: { totalCount: forcePushes },
  });
  test('failing needs red checks, at least one force-push and a 7+ day span', () => {
    expect(DependabotService.toPullRequest(node('FAILURE', 2, '2026-10-03T00:00:00Z')).failing).toBe(false);
    expect(DependabotService.toPullRequest(node('FAILURE', 1)).failing).toBe(true);
    expect(DependabotService.toPullRequest(node('FAILURE', 0)).failing).toBe(false);
    expect(DependabotService.toPullRequest(node('SUCCESS', 3)).failing).toBe(false);
    expect(DependabotService.toPullRequest(node(undefined, 3)).failing).toBe(false);
  });
});
