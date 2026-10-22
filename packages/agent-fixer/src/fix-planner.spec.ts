import type { Octokit } from '@octokit/rest';
import type { CatalogClient, IssueService, Repository } from 'techdebt-common';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { FixPlanner } from './fix-planner';

const issues = { getIssue: vi.fn(), findComment: vi.fn() };
const catalog = { fetch: vi.fn() };
const search = vi.fn();
const bot = { rest: { search: { issuesAndPullRequests: search } } } as unknown as Octokit;
const planner = new FixPlanner(issues as unknown as IssueService, catalog as unknown as CatalogClient, bot, 'bot');

const repo = (name: string, write = false): Repository => ({
  owner: 'o',
  name,
  default_branch: 'main',
  head: 'h',
  package_json_paths: ['package.json'],
  bot_has_write: write,
});

beforeEach(() => {
  vi.resetAllMocks();
  catalog.fetch.mockResolvedValue([repo('a'), repo('b', true)]);
  issues.findComment.mockResolvedValue({
    body: '<!-- triage -->\nstrategy: B\ndependabot_pr: https://github.com/o/a/pull/1\n',
  });
  issues.getIssue.mockResolvedValue({
    number: 10,
    title: '[dep] vitest -> 5',
    body: '<!-- techdebt\nkind: dependency\npackage: vitest\ntarget: 5\nreason: major\n-->',
    subIssues: [
      { number: 11, title: '[repo] o/a', state: 'OPEN', labels: ['state/in-progress'] },
      { number: 12, title: '[repo] o/b', state: 'OPEN', labels: [] },
      { number: 13, title: '[repo] o/c', state: 'OPEN', labels: [] },
      { number: 14, title: '[repo] o/a', state: 'CLOSED', labels: [] },
      { number: 15, title: '[repo] o/b', state: 'OPEN', labels: ['state/pr-open'] },
    ],
  });
});

describe('plan', () => {
  test('one job per actionable task in the catalog without an open bot PR', async () => {
    search.mockResolvedValueOnce({ data: { total_count: 0 } }).mockResolvedValueOnce({ data: { total_count: 1 } });
    const plan = await planner.plan(10);
    expect(plan.jobs).toStrictEqual([
      {
        epic: 10,
        task: 11,
        owner: 'o',
        name: 'a',
        default_branch: 'main',
        bot_has_write: false,
        branch: 'techdebt/vitest-5',
        package: 'vitest',
        target: '5',
        strategy: 'B',
      },
    ]);
    expect(plan.skipped).toStrictEqual([
      { task: 12, reason: 'bot already has an open PR in this repository' },
      { task: 13, reason: 'o/c not in catalog' },
      { task: 15, reason: 'state state/pr-open' },
    ]);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: 'is:pr is:open author:bot repo:o/a' }));
  });

  test('--only restricts to one task; missing triage defaults to strategy C', async () => {
    issues.findComment.mockResolvedValue(undefined);
    search.mockResolvedValue({ data: { total_count: 0 } });
    const plan = await planner.plan(10, 12);
    expect(plan.jobs.map(j => [j.task, j.strategy])).toStrictEqual([[12, 'C']]);
    expect(plan.triage).toBeUndefined();
  });
});

test('branchName is filesystem and git safe', () => {
  expect(FixPlanner.branchName(3, { kind: 'dependency', package: '@vitest/coverage-v8', target: '5.0.5' })).toBe(
    'techdebt/vitest-coverage-v8-5.0.5',
  );
  expect(FixPlanner.branchName(3, { kind: 'manual' })).toBe('techdebt/epic-3');
});
