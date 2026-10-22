import type { StateBranch } from 'techdebt-common';
import { expect, test, vi } from 'vitest';

import type { ActionExecutor } from './action-executor';
import type { DispatchRules } from './dispatch-rules';
import type { IssueEventPoller } from './issue-event-poller';
import { DispatcherMain } from './main';

test('evaluates each polled issue, executes actions and advances the cursor', async () => {
  const poller = {
    poll: vi.fn().mockResolvedValue([
      { number: 1, labels: ['x'], updatedAt: '2026-01-02' },
      { number: 2, labels: [], updatedAt: '2026-01-01' },
    ]),
  };
  const rules = {
    evaluate: vi
      .fn()
      .mockResolvedValueOnce([{ type: 'dispatch', issue: 1 }])
      .mockResolvedValueOnce([{ type: 'ignore', issue: 2, reason: 'r' }]),
  };
  const executor = { execute: vi.fn() };
  const state = { read: vi.fn().mockResolvedValue({ since: '2025-12-31' }), write: vi.fn(), commitAndPush: vi.fn() };
  vi.spyOn(console, 'log').mockImplementation(() => {});

  const main = new DispatcherMain(
    poller as unknown as IssueEventPoller,
    rules as unknown as DispatchRules,
    executor as unknown as ActionExecutor,
    state as unknown as StateBranch,
    'benoitf',
  );
  expect(await main.run()).toBe(1);
  expect(poller.poll).toHaveBeenCalledWith('2025-12-31');
  expect(executor.execute).toHaveBeenCalledTimes(2);
  expect(executor.execute).toHaveBeenCalledWith({ type: 'dispatch', issue: 1 }, ['x']);
  expect(state.write).toHaveBeenCalledWith('cursor.json', { since: '2026-01-02' });
  expect(state.commitAndPush).toHaveBeenCalledOnce();
});
