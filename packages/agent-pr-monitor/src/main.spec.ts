import type { IssueService } from 'techdebt-common';
import { beforeEach, expect, test, vi } from 'vitest';

import { MonitorMain } from './main';
import { OutcomeClassifier } from './outcome-classifier';
import type { PrInspector, PullRequestStatus } from './pr-inspector';
import type { RebaseService } from './rebase-service';

const issues = {
  listOpenByLabel: vi.fn(),
  findComment: vi.fn(),
  getIssue: vi.fn(),
  close: vi.fn(),
  setState: vi.fn(),
  comment: vi.fn(),
};
const inspector = { inspect: vi.fn() };
const rebase = { rebase: vi.fn() };
const main = new MonitorMain(
  issues as unknown as IssueService,
  inspector as unknown as PrInspector,
  new OutcomeClassifier(),
  rebase as unknown as RebaseService,
  'podman-desktop-bot',
);
const task = { id: 'T', number: 11, url: 'u', title: '[repo] o/r', state: 'OPEN', labels: ['state/pr-open'] };
const epic = { number: 10, type: 'Epic', title: '[dep] x -> 1', subIssues: [task] };
const status = (overrides: Partial<PullRequestStatus>): PullRequestStatus => ({
  ref: { owner: 'o', repo: 'r', number: 5 },
  url: 'https://github.com/o/r/pull/5',
  state: 'OPEN',
  mergeable: 'MERGEABLE',
  checks: 'SUCCESS',
  failedChecks: [],
  headRef: 'b',
  headRepo: 'bot/r',
  baseRef: 'main',
  closedBy: undefined,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  issues.listOpenByLabel.mockResolvedValueOnce([epic]).mockResolvedValueOnce([]);
  issues.findComment.mockResolvedValue({ body: '<!-- pr -->\nhttps://github.com/o/r/pull/5' });
});

test('merged PR closes the task and then the epic', async () => {
  inspector.inspect.mockResolvedValue(status({ state: 'MERGED' }));
  issues.getIssue.mockResolvedValue({ ...epic, labels: ['state/pr-open'], subIssues: [{ ...task, state: 'CLOSED' }] });
  await main.run();
  expect(issues.close).toHaveBeenCalledWith(11, expect.stringContaining('Merged'));
  expect(issues.setState).toHaveBeenCalledWith(expect.objectContaining({ number: 10 }), 'state/done');
  expect(issues.close).toHaveBeenCalledWith(10, expect.any(String));
});

test('conflict triggers a rebase; unresolved conflicts flag the task', async () => {
  inspector.inspect.mockResolvedValue(status({ mergeable: 'CONFLICTING' }));
  rebase.rebase.mockResolvedValue({ ok: false, conflicts: ['src/a.ts'] });
  issues.getIssue.mockResolvedValue({ ...epic, subIssues: [task] });
  await main.run();
  expect(issues.setState).toHaveBeenCalledWith(task, 'state/conflict');
  expect(issues.comment).toHaveBeenCalledWith(11, expect.stringContaining('src/a.ts'));
  expect(issues.close).not.toHaveBeenCalled();
});

test('closed by the bot itself is not "skipped"', async () => {
  inspector.inspect.mockResolvedValue(status({ state: 'CLOSED', closedBy: 'podman-desktop-bot' }));
  issues.getIssue.mockResolvedValue({ ...epic, subIssues: [task] });
  await main.run();
  expect(issues.setState).not.toHaveBeenCalled();
});

test('task without PR marker is skipped', async () => {
  issues.findComment.mockResolvedValue(undefined);
  issues.getIssue.mockResolvedValue({ ...epic, subIssues: [task] });
  await main.run();
  expect(inspector.inspect).not.toHaveBeenCalled();
});
