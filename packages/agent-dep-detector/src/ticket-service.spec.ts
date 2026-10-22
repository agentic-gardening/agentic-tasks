import type { IssueService } from 'techdebt-common';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Manifest } from './manifest-service';
import type { Finding } from './outdated-decider';
import { TicketService } from './ticket-service';

const issues = {
  findByTitle: vi.fn(),
  getIssue: vi.fn(),
  create: vi.fn(),
  addSubIssue: vi.fn(),
  listOpenByLabel: vi.fn().mockResolvedValue([]),
  close: vi.fn(),
};
const service = new TicketService(issues as unknown as IssueService);
const finding: Finding = {
  repository: 'o/r',
  package: 'vitest',
  current: '3.2.4',
  target: '5.0.5',
  epicTarget: '5',
  reason: 'major',
};
const manifests = { 'o/r': { head: 'h', dependencies: { vitest: '^3.2.4' }, resolved: {} } };

beforeEach(() => {
  vi.clearAllMocks();
  issues.listOpenByLabel.mockResolvedValue([]);
});

describe('apply', () => {
  test('creates epic and task when nothing exists', async () => {
    issues.findByTitle.mockResolvedValue(undefined);
    issues.create
      .mockResolvedValueOnce({ id: 'E', number: 10, url: 'u' })
      .mockResolvedValueOnce({ id: 'T', number: 11, url: 'u' });
    const cache = {};
    const report = await service.apply([finding], cache, manifests, false);
    expect(report).toStrictEqual({
      epicsCreated: ['[dep] vitest -> 5'],
      tasksCreated: ['[dep] vitest -> 5 :: [repo] o/r: vitest -> 5'],
      tasksClosed: [],
    });
    expect(issues.create.mock.calls[0][0]).toMatchObject({
      type: 'Epic',
      title: '[dep] vitest -> 5',
      labels: expect.arrayContaining(['state/triaging', 'kind/dependency', 'dep/vitest']),
    });
    expect(issues.create.mock.calls[0][0].body).toContain(
      '<!-- techdebt\nkind: dependency\npackage: vitest\ntarget: 5\nreason: major\n-->',
    );
    expect(issues.create.mock.calls[1][0]).toMatchObject({ type: 'Task', title: '[repo] o/r: vitest -> 5' });
    expect(issues.addSubIssue).toHaveBeenCalledWith(expect.objectContaining({ id: 'E', number: 10 }), {
      id: 'T',
      number: 11,
      url: 'u',
    });
    expect(cache).toStrictEqual({ '[dep] vitest -> 5': 10 });
  });

  test('is idempotent when the epic and child already exist', async () => {
    issues.getIssue.mockResolvedValue({
      id: 'E',
      number: 10,
      state: 'OPEN',
      subIssues: [{ title: '[repo] o/r: vitest -> 5', state: 'OPEN' }],
    });
    const report = await service.apply([finding], { '[dep] vitest -> 5': 10 }, manifests, false);
    expect(report.epicsCreated).toStrictEqual([]);
    expect(report.tasksCreated).toStrictEqual([]);
    expect(issues.create).not.toHaveBeenCalled();
    expect(issues.findByTitle).not.toHaveBeenCalled();
  });

  test('opens a new epic when the cached one is closed', async () => {
    issues.getIssue.mockResolvedValue({ id: 'E', number: 10, state: 'CLOSED', subIssues: [] });
    issues.create
      .mockResolvedValueOnce({ id: 'E2', number: 20, url: 'u' })
      .mockResolvedValueOnce({ id: 'T', number: 21, url: 'u' });
    const cache = { '[dep] vitest -> 5': 10 };
    const report = await service.apply([finding], cache, manifests, false);
    expect(report.epicsCreated).toStrictEqual(['[dep] vitest -> 5']);
    expect(report.tasksCreated).toStrictEqual(['[dep] vitest -> 5 :: [repo] o/r: vitest -> 5']);
    expect(cache).toStrictEqual({ '[dep] vitest -> 5': 20 });
  });

  test('dry run only reports', async () => {
    issues.findByTitle.mockResolvedValue(undefined);
    const report = await service.apply([finding], {}, manifests, true);
    expect(report.epicsCreated).toStrictEqual(['[dep] vitest -> 5']);
    expect(report.tasksCreated).toStrictEqual(['[dep] vitest -> 5 :: [repo] o/r: vitest -> 5']);
    expect(issues.create).not.toHaveBeenCalled();
    expect(issues.addSubIssue).not.toHaveBeenCalled();
  });

  test('closes task children whose repository now satisfies the epic', async () => {
    issues.listOpenByLabel.mockResolvedValue([
      {
        number: 10,
        title: '[dep] vitest -> 5',
        type: 'Epic',
        body: '<!-- techdebt\nkind: dependency\npackage: vitest\ntarget: 5\n-->',
        subIssues: [
          { number: 11, title: '[repo] o/r', state: 'OPEN' },
          { number: 12, title: '[repo] o/done', state: 'OPEN' },
          { number: 13, title: '[repo] o/gone', state: 'OPEN' },
        ],
      },
      {
        number: 20,
        title: 'manual',
        type: 'Epic',
        body: '<!-- techdebt\nkind: manual\n-->',
        subIssues: [{ number: 21, title: '[repo] o/r', state: 'OPEN' }],
      },
    ]);
    const all = {
      ...manifests,
      'o/done': { head: 'h', dependencies: { vitest: '^5.0.0' }, resolved: {} },
      'o/gone': { head: 'h', dependencies: {}, resolved: {} },
    };
    const report = await service.apply([], {}, all, false);
    expect(report.tasksClosed).toStrictEqual([
      '[dep] vitest -> 5 :: [repo] o/done',
      '[dep] vitest -> 5 :: [repo] o/gone',
    ]);
    expect(issues.close).toHaveBeenCalledTimes(2);
    expect(issues.close).toHaveBeenCalledWith(12, expect.stringContaining('vitest 5'));
  });
});

describe('satisfies', () => {
  test('major target vs exact target', () => {
    const m = (dependencies: Record<string, string>, resolved: Record<string, string> = {}): Manifest => ({
      head: 'h',
      dependencies,
      resolved,
    });
    expect(TicketService.satisfies(m({ x: '^5.1.0' }), 'x', '5')).toBe(true);
    expect(TicketService.satisfies(m({ x: '^4.9.0' }), 'x', '5')).toBe(false);
    expect(TicketService.satisfies(m({ x: '^4.2.2' }), 'x', '4.2.2')).toBe(true);
    expect(TicketService.satisfies(m({ x: '^4.2.1' }), 'x', '4.2.2')).toBe(false);
    expect(TicketService.satisfies(m({ x: '^4.2.1' }, { x: '4.2.2' }), 'x', '4.2.2')).toBe(true);
    expect(TicketService.satisfies({ ...m({}), packageManager: 'pnpm@12.14.0+x' }, 'pnpm', '12.14.0')).toBe(true);
  });
});
