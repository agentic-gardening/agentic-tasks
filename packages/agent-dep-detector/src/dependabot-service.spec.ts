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
