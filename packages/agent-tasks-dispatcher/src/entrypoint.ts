import 'reflect-metadata';

import { LoopRunner } from 'techdebt-common';

import { InversifyBinding } from './inversify-binding';
import { DispatcherMain } from './main';

const INTERVAL_MS = 60 * 1000;

const tasksToken = process.env.TASKS_TOKEN;
const dispatchToken = process.env.DISPATCH_TOKEN ?? tasksToken;
const stateToken = process.env.GITHUB_TOKEN ?? tasksToken;
if (!tasksToken || !dispatchToken || !stateToken) {
  console.error('TASKS_TOKEN is required (DISPATCH_TOKEN and GITHUB_TOKEN default to it)');
  process.exit(1);
}

const container = await new InversifyBinding({
  tasksToken,
  dispatchToken,
  stateRepository: process.env.GITHUB_REPOSITORY ?? 'agentic-gardening/agentic-tasks',
  stateToken,
  approver: process.env.APPROVER ?? 'benoitf',
  agents: {
    owner: 'agentic-gardening',
    name: 'agentic-tasks',
    triage: 'triage.yml',
    fixer: 'fixer.yml',
  },
}).initBindings();

await container.get(LoopRunner).run(
  () =>
    container
      .get(DispatcherMain)
      .run()
      .then(() => undefined),
  {
    intervalMs: INTERVAL_MS,
  },
);
