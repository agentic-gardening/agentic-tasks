import { describe, expect, test } from 'vitest';

import { ContextBuilder } from './context-builder';

const repos = [
  {
    owner: 'o',
    name: 'big',
    default_branch: 'main',
    head: 'h',
    package_json_paths: ['package.json', 'a/package.json', 'b/package.json'],
    bot_has_write: false,
  },
  {
    owner: 'o',
    name: 'small',
    default_branch: 'develop',
    head: 'h',
    package_json_paths: ['package.json'],
    bot_has_write: false,
  },
];

describe('tasks', () => {
  test('maps open [repo] sub-issues to catalog entries, unknown repos default to root package.json', () => {
    const tasks = ContextBuilder.tasks(
      [
        { number: 1, title: '[repo] o/big', state: 'OPEN' },
        { number: 2, title: '[repo] o/small', state: 'OPEN' },
        { number: 3, title: '[repo] o/closed', state: 'CLOSED' },
        { number: 4, title: '[repo] o/unknown', state: 'OPEN' },
        { number: 5, title: 'not a task', state: 'OPEN' },
      ],
      repos,
    );
    expect(tasks.map(t => [t.number, t.default_branch, t.package_json_paths.length])).toStrictEqual([
      [1, 'main', 3],
      [2, 'develop', 1],
      [4, undefined, 1],
    ]);
  });
});

describe('pickCandidate', () => {
  test('fewest package.json files, then alphabetical', () => {
    const tasks = ContextBuilder.tasks(
      [
        { number: 1, title: '[repo] o/big', state: 'OPEN' },
        { number: 2, title: '[repo] o/small', state: 'OPEN' },
        { number: 4, title: '[repo] o/aaa', state: 'OPEN' },
      ],
      repos,
    );
    expect(ContextBuilder.pickCandidate(tasks)?.repository).toBe('o/aaa');
    expect(ContextBuilder.pickCandidate([])).toBeUndefined();
  });
});
