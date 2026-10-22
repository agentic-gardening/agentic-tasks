import type { IssueService } from 'techdebt-common';
import { expect, test, vi } from 'vitest';

import { EpicStateUpdater } from './epic-state-updater';

function updater(children: { state: string; labels: string[] }[]): {
  updater: EpicStateUpdater;
  setState: ReturnType<typeof vi.fn>;
} {
  const setState = vi.fn();
  const issues = {
    getIssue: vi.fn().mockResolvedValue({ number: 1, labels: ['state/in-progress'], subIssues: children }),
    setState,
  };
  return { updater: new EpicStateUpdater(issues as unknown as IssueService), setState };
}

test('all children terminal -> pr-open', async () => {
  const { updater: u, setState } = updater([
    { state: 'OPEN', labels: ['state/pr-open'] },
    { state: 'OPEN', labels: ['state/ci-failed'] },
    { state: 'CLOSED', labels: [] },
  ]);
  expect(await u.update(1)).toBe('state/pr-open');
  expect(setState).toHaveBeenCalledWith(expect.objectContaining({ number: 1 }), 'state/pr-open');
});

test('a child still in progress -> unchanged', async () => {
  const { updater: u, setState } = updater([
    { state: 'OPEN', labels: ['state/pr-open'] },
    { state: 'OPEN', labels: ['state/in-progress'] },
  ]);
  expect(await u.update(1)).toBe('state/in-progress');
  expect(setState).not.toHaveBeenCalled();
});

test('every child needs a human -> epic needs a human', async () => {
  const { updater: u } = updater([{ state: 'OPEN', labels: ['state/needs-human'] }]);
  expect(await u.update(1)).toBe('state/needs-human');
});
