import { STATE } from 'techdebt-common';
import { describe, expect, test } from 'vitest';

import { DispatchRules } from './dispatch-rules';
import type { PolledIssue } from './issue-event-poller';

const rules = new DispatchRules();
const context = {
  approver: 'benoitf',
  hasWriteAccess: async (login: string | undefined): Promise<boolean> => ['benoitf', 'writer'].includes(login ?? ''),
};

function issue(overrides: Partial<PolledIssue> = {}): PolledIssue {
  return {
    id: 'I',
    number: 1,
    title: '[dep] vitest -> 5',
    body: '',
    type: 'Epic',
    author: 'writer',
    labels: ['kind/dependency'],
    updatedAt: 'now',
    labelEvents: [],
    commentMarkers: [],
    ...overrides,
  };
}

describe('DispatchRules', () => {
  test('ignores non-epics', async () => {
    expect(await rules.evaluate(issue({ type: 'Task' }), context)).toStrictEqual([]);
  });

  test('human epic without state gets kind/manual + triaging', async () => {
    expect(await rules.evaluate(issue({ labels: [] }), context)).toStrictEqual([
      { type: 'add-labels', issue: 1, labels: ['kind/manual', STATE.TRIAGING] },
    ]);
    expect(await rules.evaluate(issue({ labels: ['kind/dependency'] }), context)).toStrictEqual([
      { type: 'add-labels', issue: 1, labels: [STATE.TRIAGING] },
    ]);
  });

  test('author without write access is ignored', async () => {
    const result = await rules.evaluate(issue({ labels: [], author: 'stranger' }), context);
    expect(result).toStrictEqual([{ type: 'ignore', issue: 1, reason: 'actor stranger has no write access' }]);
  });

  test('triaging dispatches triage once', async () => {
    const triaging = issue({
      labels: ['kind/dependency', STATE.TRIAGING],
      labelEvents: [{ label: STATE.TRIAGING, actor: 'writer', createdAt: 't' }],
    });
    expect(await rules.evaluate(triaging, context)).toStrictEqual([
      { type: 'dispatch', issue: 1, agent: 'triage', inputs: { issue: '1' } },
    ]);
    expect(await rules.evaluate({ ...triaging, commentMarkers: ['<!-- triage -->'] }, context)).toStrictEqual([
      { type: 'ignore', issue: 1, reason: 'triage comment present' },
    ]);
  });

  test('ready pings the approver once', async () => {
    const ready = issue({
      labels: [STATE.READY],
      labelEvents: [{ label: STATE.READY, actor: 'writer', createdAt: 't' }],
    });
    const [action] = await rules.evaluate(ready, context);
    expect(action).toMatchObject({ type: 'comment', issue: 1 });
    expect((action as { body: string }).body).toContain('@benoitf');
    expect(await rules.evaluate({ ...ready, commentMarkers: ['<!-- ping -->'] }, context)).toStrictEqual([
      { type: 'ignore', issue: 1, reason: 'already pinged' },
    ]);
  });

  test('approved by the approver moves to in-progress and dispatches the fixer', async () => {
    const approved = issue({
      labels: [STATE.APPROVED],
      labelEvents: [{ label: STATE.APPROVED, actor: 'benoitf', createdAt: 't' }],
    });
    expect(await rules.evaluate(approved, context)).toStrictEqual([
      { type: 'set-state', issue: 1, state: STATE.IN_PROGRESS },
      { type: 'dispatch', issue: 1, agent: 'fixer', inputs: { issue: '1' } },
    ]);
  });

  test('approved by someone else is reverted', async () => {
    const approved = issue({
      labels: [STATE.APPROVED],
      labelEvents: [{ label: STATE.APPROVED, actor: 'writer', createdAt: 't' }],
    });
    const actions = await rules.evaluate(approved, context);
    expect(actions[0]).toStrictEqual({ type: 'set-state', issue: 1, state: STATE.READY });
    expect(actions[1]).toMatchObject({ type: 'comment' });
  });

  test('state label added by an actor without write access is ignored', async () => {
    const approved = issue({
      labels: [STATE.APPROVED],
      labelEvents: [{ label: STATE.APPROVED, actor: 'stranger', createdAt: 't' }],
    });
    expect(await rules.evaluate(approved, context)).toStrictEqual([
      { type: 'ignore', issue: 1, reason: 'actor stranger has no write access' },
    ]);
  });

  test('conflict re-queues the fixer; terminal states do nothing', async () => {
    const conflict = issue({
      labels: [STATE.CONFLICT],
      labelEvents: [{ label: STATE.CONFLICT, actor: 'writer', createdAt: 't' }],
    });
    expect(await rules.evaluate(conflict, context)).toHaveLength(2);
    for (const state of [
      STATE.IN_PROGRESS,
      STATE.PR_OPEN,
      STATE.DONE,
      STATE.NEEDS_HUMAN,
      STATE.CI_FAILED,
      STATE.SKIPPED,
    ]) {
      expect(
        await rules.evaluate(
          issue({ labels: [state], labelEvents: [{ label: state, actor: 'writer', createdAt: 't' }] }),
          context,
        ),
      ).toStrictEqual([]);
    }
  });
});
