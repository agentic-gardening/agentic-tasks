import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inject, injectable } from 'inversify';

import { ProcessRunner } from '../runtime/process-runner';

export interface StateBranchOptions {
  /** owner/name of the agent's own repository */
  repository: string;
  token: string;
  branch?: string;
  /** checkout directory; a temp dir when omitted */
  directory?: string;
  authorName?: string;
  authorEmail?: string;
}

export const STATE_BRANCH_OPTIONS = Symbol.for('techdebt.state-branch-options');

/**
 * Small JSON key/value store persisted on an orphan `state` branch of the agent repository,
 * like the `info` branch of podman-desktop-bot. Also serves as the keep-alive commit.
 */
@injectable()
export class StateBranch {
  private directory: string | undefined;
  private readonly branch: string;

  constructor(
    @inject(ProcessRunner) private readonly processRunner: ProcessRunner,
    @inject(STATE_BRANCH_OPTIONS) private readonly options: StateBranchOptions,
  ) {
    this.branch = options.branch ?? 'state';
  }

  private get remote(): string {
    return `https://x-access-token:${this.options.token}@github.com/${this.options.repository}.git`;
  }

  private git(args: string[]): Promise<string> {
    if (!this.directory) throw new Error('state branch not opened');
    return this.processRunner.exec('git', args, { cwd: this.directory });
  }

  async open(): Promise<string> {
    if (this.directory) return this.directory;
    const dir = this.options.directory ?? (await mkdtemp(join(tmpdir(), 'techdebt-state-')));
    const clone = await this.processRunner.run('git', [
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      this.branch,
      this.remote,
      dir,
    ]);
    this.directory = dir;
    if (clone.code !== 0) {
      // branch does not exist yet: start an orphan one
      await this.processRunner.exec('git', ['init', '--quiet', dir]);
      await this.git(['checkout', '--quiet', '--orphan', this.branch]);
      await this.git(['remote', 'add', 'origin', this.remote]);
    }
    await this.git(['config', 'user.name', this.options.authorName ?? 'techdebt-bot']);
    await this.git(['config', 'user.email', this.options.authorEmail ?? 'techdebt-bot@users.noreply.github.com']);
    return dir;
  }

  async read<T>(file: string, fallback: T): Promise<T> {
    const dir = await this.open();
    try {
      return JSON.parse(await readFile(join(dir, file), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  async write(file: string, data: unknown): Promise<void> {
    const dir = await this.open();
    await writeFile(join(dir, file), `${JSON.stringify(data, undefined, 2)}\n`);
  }

  /** Commits everything (plus a keep-alive timestamp) and pushes. Returns false when nothing changed. */
  async commitAndPush(message: string): Promise<boolean> {
    const dir = await this.open();
    await writeFile(join(dir, 'last-run.txt'), `${new Date().toISOString()}\n`);
    await this.git(['add', '-A']);
    const commit = await this.processRunner.run('git', ['commit', '--quiet', '-m', message], { cwd: dir });
    if (commit.code !== 0) return false;
    await this.git(['push', '--quiet', '-u', 'origin', this.branch]);
    return true;
  }
}
