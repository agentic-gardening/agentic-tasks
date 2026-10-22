import type { ProcessRunner } from 'techdebt-common';
import { describe, expect, test, vi } from 'vitest';

import type { PullRequestStatus } from './pr-inspector';
import { RebaseService } from './rebase-service';

const status: PullRequestStatus = {
  ref: { owner: 'o', repo: 'r', number: 1 },
  url: 'u',
  state: 'OPEN',
  mergeable: 'CONFLICTING',
  checks: 'NONE',
  failedChecks: [],
  headRef: 'techdebt/x',
  headRepo: 'bot/r',
  baseRef: 'main',
  closedBy: undefined,
};

describe('lockfileOnly', () => {
  test('true only when every conflict is a pnpm-lock.yaml', () => {
    expect(RebaseService.lockfileOnly(['pnpm-lock.yaml'])).toBe(true);
    expect(RebaseService.lockfileOnly(['packages/a/pnpm-lock.yaml'])).toBe(true);
    expect(RebaseService.lockfileOnly(['pnpm-lock.yaml', 'package.json'])).toBe(false);
    expect(RebaseService.lockfileOnly([])).toBe(false);
  });
});

describe('rebase', () => {
  function runner(rebaseCode: number, conflicts: string): ProcessRunner {
    const run = vi.fn(async (_cmd: string, args: string[]) => {
      if (args[0] === 'rebase' && args.length === 2) return { code: rebaseCode, stdout: '', stderr: '' };
      if (args[0] === 'diff') return { code: 0, stdout: conflicts, stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    });
    return { run, exec: vi.fn().mockResolvedValue('') } as unknown as ProcessRunner;
  }

  test('clean rebase pushes with force-with-lease', async () => {
    const processRunner = runner(0, '');
    expect(await new RebaseService(processRunner, 't').rebase(status)).toStrictEqual({ ok: true });
    const pushes = (processRunner.exec as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([, args]) => (args as string[])[0] === 'push',
    );
    expect(pushes).toHaveLength(1);
    expect(pushes[0][1]).toContain('--force-with-lease');
  });

  test('lockfile-only conflict is regenerated and continued', async () => {
    const processRunner = runner(1, 'pnpm-lock.yaml\n');
    expect(await new RebaseService(processRunner, 't').rebase(status)).toStrictEqual({ ok: true });
    const calls = (processRunner.run as ReturnType<typeof vi.fn>).mock.calls.map(
      ([cmd, args]) => `${cmd} ${(args as string[]).join(' ')}`,
    );
    expect(calls).toContain('git checkout --theirs pnpm-lock.yaml');
    expect(calls).toContain('pnpm install --lockfile-only');
    expect(calls.some(c => c.includes('rebase --continue'))).toBe(true);
  });

  test('other conflicts abort and are reported', async () => {
    const processRunner = runner(1, 'pnpm-lock.yaml\nsrc/a.ts\n');
    expect(await new RebaseService(processRunner, 't').rebase(status)).toStrictEqual({
      ok: false,
      conflicts: ['pnpm-lock.yaml', 'src/a.ts'],
    });
    const calls = (processRunner.run as ReturnType<typeof vi.fn>).mock.calls.map(([, args]) =>
      (args as string[]).join(' '),
    );
    expect(calls).toContain('rebase --abort');
    expect(
      (processRunner.exec as ReturnType<typeof vi.fn>).mock.calls.some(([, args]) => (args as string[])[0] === 'push'),
    ).toBe(false);
  });
});
