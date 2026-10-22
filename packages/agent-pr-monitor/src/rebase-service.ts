import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inject, injectable } from 'inversify';
import { ProcessRunner } from 'techdebt-common';

import type { PullRequestStatus } from './pr-inspector';

export const BOT_TOKEN = Symbol.for('agent-pr-monitor.bot-token');

export type RebaseResult = { ok: true } | { ok: false; conflicts: string[] };

/**
 * Rebases a fork branch on the upstream default branch. Conflicts limited to pnpm-lock.yaml are
 * solved by regenerating the lockfile; anything else aborts and is reported.
 */
@injectable()
export class RebaseService {
  constructor(
    @inject(ProcessRunner) private readonly processRunner: ProcessRunner,
    @inject(BOT_TOKEN) private readonly token: string,
  ) {}

  private remote(nameWithOwner: string): string {
    return `https://x-access-token:${this.token}@github.com/${nameWithOwner}.git`;
  }

  async rebase(status: PullRequestStatus): Promise<RebaseResult> {
    const dir = await mkdtemp(join(tmpdir(), 'rebase-'));
    const git = (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
      this.processRunner.run('git', args, { cwd: dir });
    const upstream = `${status.ref.owner}/${status.ref.repo}`;

    await this.processRunner.exec('git', [
      'clone',
      '--quiet',
      '--branch',
      status.headRef,
      this.remote(status.headRepo),
      dir,
    ]);
    await git(['config', 'user.name', 'techdebt-bot']);
    await git(['config', 'user.email', 'techdebt-bot@users.noreply.github.com']);
    await git(['remote', 'add', 'upstream', this.remote(upstream)]);
    await this.processRunner.exec('git', ['fetch', '--quiet', 'upstream', status.baseRef], { cwd: dir });

    const rebase = await git(['rebase', `upstream/${status.baseRef}`]);
    if (rebase.code !== 0) {
      const conflicts = (await git(['diff', '--name-only', '--diff-filter=U'])).stdout.split('\n').filter(Boolean);
      if (!RebaseService.lockfileOnly(conflicts)) {
        await git(['rebase', '--abort']);
        return { ok: false, conflicts };
      }
      await git(['checkout', '--theirs', 'pnpm-lock.yaml']);
      const install = await this.processRunner.run('pnpm', ['install', '--lockfile-only'], {
        cwd: dir,
        env: { CI: 'true' },
      });
      if (install.code !== 0) {
        await git(['rebase', '--abort']);
        return { ok: false, conflicts: ['pnpm-lock.yaml (pnpm install failed)'] };
      }
      await git(['add', 'pnpm-lock.yaml']);
      const cont = await this.processRunner.run('git', ['-c', 'core.editor=true', 'rebase', '--continue'], {
        cwd: dir,
      });
      if (cont.code !== 0) {
        await git(['rebase', '--abort']);
        return {
          ok: false,
          conflicts: (await git(['diff', '--name-only', '--diff-filter=U'])).stdout.split('\n').filter(Boolean),
        };
      }
    }
    await this.processRunner.exec('git', ['push', '--quiet', '--force-with-lease', 'origin', status.headRef], {
      cwd: dir,
    });
    return { ok: true };
  }

  static lockfileOnly(conflicts: string[]): boolean {
    return conflicts.length > 0 && conflicts.every(file => file.endsWith('pnpm-lock.yaml'));
  }
}
