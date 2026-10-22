import 'reflect-metadata';

import { LoopRunner } from 'techdebt-common';

import { InversifyBinding } from './inversify-binding';
import { DetectorMain } from './main';

const INTERVAL_MS = 6 * 60 * 60 * 1000;

const dryRun = process.argv.includes('--dry-run');
const stateToken = process.env.GITHUB_TOKEN;
// READ_TOKEN sees private catalogued repositories; the job token only sees public ones
const readToken = process.env.READ_TOKEN || stateToken;
const tasksToken = process.env.TASKS_TOKEN || undefined;
if (!readToken || !stateToken) {
  console.error('GITHUB_TOKEN is required (READ_TOKEN optional, defaults to it)');
  process.exit(1);
}
if (!tasksToken && !dryRun) {
  console.error('TASKS_TOKEN is required (or pass --dry-run)');
  process.exit(1);
}

const container = await new InversifyBinding({
  readToken,
  tasksToken,
  stateRepository: process.env.GITHUB_REPOSITORY ?? 'agentic-gardening/agentic-tasks',
  stateToken,
  dryRun,
}).initBindings();

await container.get(LoopRunner).run(
  () =>
    container
      .get(DetectorMain)
      .run()
      .then(() => undefined),
  {
    intervalMs: INTERVAL_MS,
    once: dryRun || LoopRunner.onceRequested(),
  },
);
