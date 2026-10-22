import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { injectable } from 'inversify';

const execFileAsync = promisify(execFile);

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

@injectable()
export class ProcessRunner {
  /** Runs a command and never throws on non-zero exit. */
  async run(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        timeout: options.timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
      });
      return { code: 0, stdout, stderr };
    } catch (error: unknown) {
      const e = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
      return {
        code: typeof e.code === 'number' ? e.code : 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? e.message ?? String(error),
      };
    }
  }

  /** Runs a command and throws on non-zero exit. */
  async exec(command: string, args: string[], options: ProcessOptions = {}): Promise<string> {
    const result = await this.run(command, args, options);
    if (result.code !== 0) {
      throw new Error(`${command} ${args.join(' ')} failed (${result.code}): ${result.stderr || result.stdout}`);
    }
    return result.stdout;
  }
}
