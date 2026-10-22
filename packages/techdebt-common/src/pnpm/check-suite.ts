import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { inject, injectable } from 'inversify';

import { ProcessRunner } from '../runtime/process-runner';

export type CheckStep = 'install' | 'lint:check' | 'format:check' | 'typecheck' | 'test' | 'build';
export const CHECK_STEPS: readonly CheckStep[] = [
  'install',
  'lint:check',
  'format:check',
  'typecheck',
  'test',
  'build',
];

export type CheckResult =
  | { ok: true; ran: CheckStep[] }
  | { ok: false; step: CheckStep; output: string; ran: CheckStep[] };

/** Runs the pnpm check suite of a repository and stops at the first failing step. */
@injectable()
export class CheckSuite {
  constructor(@inject(ProcessRunner) private readonly processRunner: ProcessRunner) {}

  async run(
    cwd: string,
    options: { frozenLockfile?: boolean; steps?: readonly CheckStep[] } = {},
  ): Promise<CheckResult> {
    const scripts = await this.readScripts(cwd);
    const ran: CheckStep[] = [];
    for (const step of options.steps ?? CHECK_STEPS) {
      if (step !== 'install' && !scripts[step]) continue;
      const args = step === 'install' ? ['install', ...(options.frozenLockfile ? ['--frozen-lockfile'] : [])] : [step];
      ran.push(step);
      const result = await this.processRunner.run('pnpm', args, { cwd, env: { CI: 'true' } });
      if (result.code !== 0) {
        return { ok: false, step, output: `${result.stdout}\n${result.stderr}`.trim(), ran };
      }
    }
    return { ok: true, ran };
  }

  private async readScripts(cwd: string): Promise<Record<string, string>> {
    try {
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
      return pkg.scripts ?? {};
    } catch {
      return {};
    }
  }
}
