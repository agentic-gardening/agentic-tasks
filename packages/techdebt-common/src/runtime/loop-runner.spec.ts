import { expect, test, vi } from 'vitest';

import { LoopRunner } from './loop-runner';

test('runs once when requested', async () => {
  const work = vi.fn().mockResolvedValue(undefined);
  const iterations = await new LoopRunner().run(work, { intervalMs: 1, once: true, log: () => {} });
  expect(iterations).toBe(1);
  expect(work).toHaveBeenCalledOnce();
});

test('keeps looping until max duration and survives a failing iteration', async () => {
  const work = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
  const iterations = await new LoopRunner().run(work, { intervalMs: 5, maxDurationMs: 60, once: false, log: () => {} });
  expect(iterations).toBeGreaterThan(1);
  expect(work).toHaveBeenCalledTimes(iterations);
});

test('a failing single run rejects', async () => {
  const work = vi.fn().mockRejectedValue(new Error('boom'));
  await expect(new LoopRunner().run(work, { intervalMs: 1, once: true, log: () => {} })).rejects.toThrow('boom');
});

test('detects --once flag, env and push events', () => {
  expect(LoopRunner.onceRequested(['node', 'x', '--once'], {})).toBe(true);
  expect(LoopRunner.onceRequested([], { RUN_ONCE: 'true' })).toBe(true);
  expect(LoopRunner.onceRequested([], { GITHUB_EVENT_NAME: 'push' })).toBe(true);
  expect(LoopRunner.onceRequested([], { GITHUB_EVENT_NAME: 'schedule' })).toBe(false);
});
