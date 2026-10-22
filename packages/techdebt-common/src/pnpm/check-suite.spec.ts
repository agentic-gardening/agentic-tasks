import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, expect, test, vi } from 'vitest';

import type { ProcessRunner } from '../runtime/process-runner';
import { CheckSuite } from './check-suite';

const run = vi.fn();
const processRunner = { run } as unknown as ProcessRunner;
let cwd: string;

beforeEach(async () => {
  vi.resetAllMocks();
  cwd = await mkdtemp(join(tmpdir(), 'check-suite-'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { 'lint:check': 'x', test: 'y', build: 'z' } }));
});

test('runs install then only the scripts that exist, stops at first failure', async () => {
  run
    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
    .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
    .mockResolvedValueOnce({ code: 1, stdout: 'FAIL spec', stderr: '' });
  const result = await new CheckSuite(processRunner).run(cwd);
  expect(result).toStrictEqual({
    ok: false,
    step: 'test',
    output: 'FAIL spec',
    ran: ['install', 'lint:check', 'test'],
  });
  expect(run).toHaveBeenNthCalledWith(1, 'pnpm', ['install'], expect.objectContaining({ cwd }));
});

test('is green when everything passes and honours frozen lockfile', async () => {
  run.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  const result = await new CheckSuite(processRunner).run(cwd, { frozenLockfile: true });
  expect(result).toStrictEqual({ ok: true, ran: ['install', 'lint:check', 'test', 'build'] });
  expect(run).toHaveBeenNthCalledWith(1, 'pnpm', ['install', '--frozen-lockfile'], expect.anything());
});
