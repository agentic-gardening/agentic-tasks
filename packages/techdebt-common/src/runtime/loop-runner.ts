import { injectable } from 'inversify';

export interface LoopOptions {
  /** delay between two iterations */
  intervalMs: number;
  /** stop before the GitHub Actions 6 h job limit; default 5 h */
  maxDurationMs?: number;
  /** run a single iteration; default from `--once`, `RUN_ONCE=true` or a push event */
  once?: boolean;
  log?: (message: string) => void;
}

const DEFAULT_MAX_DURATION_MS = 5 * 60 * 60 * 1000;

/**
 * Long-running loop restarted by an hourly cron (the `sync.yml` pattern):
 * runs `work`, sleeps, repeats until the max duration or a termination signal.
 */
@injectable()
export class LoopRunner {
  private shuttingDown = false;

  constructor() {
    const stop = (): void => {
      this.shuttingDown = true;
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  }

  static onceRequested(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
    return argv.includes('--once') || env.RUN_ONCE === 'true' || env.GITHUB_EVENT_NAME === 'push';
  }

  async run(work: () => Promise<void>, options: LoopOptions): Promise<number> {
    const log = options.log ?? console.log;
    const once = options.once ?? LoopRunner.onceRequested();
    const maxDuration = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    const start = Date.now();
    let iteration = 0;

    do {
      iteration++;
      log(`--- iteration ${iteration} ---`);
      try {
        await work();
      } catch (error: unknown) {
        // a single run must fail loudly; a long loop logs and retries next iteration
        if (once) throw error;
        log(`iteration ${iteration} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (once || this.shuttingDown) break;
      const remaining = maxDuration - (Date.now() - start);
      if (remaining <= options.intervalMs) {
        log('not enough time for another iteration, exiting');
        break;
      }
      await this.sleep(options.intervalMs);
    } while (!this.shuttingDown && Date.now() - start < maxDuration);

    log(`loop ended after ${iteration} iteration(s)`);
    return iteration;
  }

  private async sleep(ms: number): Promise<void> {
    const step = Math.min(1000, ms);
    const until = Date.now() + ms;
    while (Date.now() < until && !this.shuttingDown) {
      await new Promise<void>(resolve => setTimeout(resolve, Math.min(step, until - Date.now())));
    }
  }
}
