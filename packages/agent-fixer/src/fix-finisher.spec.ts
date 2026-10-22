import type { Octokit } from '@octokit/rest';
import type { CheckSuite, IssueService, ProcessRunner } from 'techdebt-common';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { FixFinisher } from './fix-finisher';
import type { FixJob } from './fix-planner';

const issues = {
  getIssue: vi.fn().mockResolvedValue({ labels: ['state/in-progress'] }),
  setState: vi.fn(),
  comment: vi.fn(),
};
const checks = { run: vi.fn() };
const processRunner = { run: vi.fn(), exec: vi.fn().mockResolvedValue('') };
const pullsCreate = vi.fn().mockResolvedValue({ data: { html_url: 'https://github.com/o/r/pull/7' } });
const bot = { rest: { pulls: { create: pullsCreate } } } as unknown as Octokit;
const rebaseComment = vi.fn();
const rebaseOctokit = { rest: { issues: { createComment: rebaseComment } } } as unknown as Octokit;

const job: FixJob = {
  epic: 10,
  task: 11,
  owner: 'o',
  name: 'r',
  default_branch: 'main',
  bot_has_write: true,
  branch: 'techdebt/vitest-5',
  package: 'vitest',
  target: '5',
  strategy: 'B',
};
const finisher = new FixFinisher(
  issues as unknown as IssueService,
  checks as unknown as CheckSuite,
  processRunner as unknown as ProcessRunner,
  bot,
  'tok',
  'bot',
  rebaseOctokit,
);

beforeEach(() => {
  vi.clearAllMocks();
  processRunner.run.mockResolvedValue({ code: 0, stdout: ' M package.json\n', stderr: '' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('finish', () => {
  test('green suite: commits, pushes to fork, opens PR, labels pr-open and asks dependabot to rebase', async () => {
    checks.run.mockResolvedValue({ ok: true, ran: [] });
    const triage = {
      strategy: 'B' as const,
      dependabot_pr: 'https://github.com/o/r/pull/3',
      playbook_section: 'vitest',
      notes: 'mocks',
    };
    const result = await finisher.finish(job, triage, '/w');
    expect(result).toStrictEqual({ ok: true, url: 'https://github.com/o/r/pull/7' });
    const execs = processRunner.exec.mock.calls.map(([, args]) => (args as string[]).join(' '));
    expect(execs.some(c => c.startsWith('commit -s'))).toBe(true);
    expect(
      execs.some(c =>
        c.includes(
          'push --quiet --force https://x-access-token:tok@github.com/bot/r.git HEAD:refs/heads/techdebt/vitest-5',
        ),
      ),
    ).toBe(true);
    expect(pullsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'o',
        repo: 'r',
        head: 'bot:techdebt/vitest-5',
        base: 'main',
        title: 'chore(deps): update vitest to v5',
      }),
    );
    expect(pullsCreate.mock.calls[0][0].body).toContain('Fixes agentic-gardening/agentic-tasks#11');
    expect(pullsCreate.mock.calls[0][0].body).not.toContain('Generated with');
    expect(issues.comment).toHaveBeenCalledWith(11, '<!-- pr -->\nhttps://github.com/o/r/pull/7');
    expect(issues.setState).toHaveBeenCalledWith(expect.objectContaining({ number: 11 }), 'state/pr-open');
    expect(rebaseComment).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 3, body: '@dependabot rebase' });
  });

  test('red suite: comments the output and labels ci-failed, no PR', async () => {
    checks.run.mockResolvedValue({ ok: false, step: 'test', output: 'FAIL x', ran: [] });
    expect(await finisher.finish(job, undefined, '/w')).toStrictEqual({ ok: false, step: 'test' });
    expect(pullsCreate).not.toHaveBeenCalled();
    expect(issues.setState).toHaveBeenCalledWith(expect.anything(), 'state/ci-failed');
    expect(issues.comment.mock.calls[0][1]).toContain('FAIL x');
  });

  test('no change: needs-human', async () => {
    processRunner.run.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    expect(await finisher.finish(job, undefined, '/w')).toStrictEqual({ ok: false, step: 'no-changes' });
    expect(checks.run).not.toHaveBeenCalled();
    expect(issues.setState).toHaveBeenCalledWith(expect.anything(), 'state/needs-human');
  });

  test('strategy C never asks dependabot to rebase', async () => {
    checks.run.mockResolvedValue({ ok: true, ran: [] });
    await finisher.finish(
      { ...job, strategy: 'C' },
      { strategy: 'C', dependabot_pr: 'https://github.com/o/r/pull/3' },
      '/w',
    );
    expect(rebaseComment).not.toHaveBeenCalled();
  });
});

test('title and body', () => {
  expect(FixFinisher.title({ ...job, target: '4.2.2' })).toBe('chore(deps): update vitest to 4.2.2');
  expect(FixFinisher.title({ ...job, package: undefined })).toBe(
    'chore: tech-debt epic agentic-gardening/agentic-tasks#10',
  );
  expect(FixFinisher.body(job, undefined)).toContain('Epic: agentic-gardening/agentic-tasks#10');
});
