import 'reflect-metadata';

import { appendFile, writeFile } from 'node:fs/promises';

import { FixPlanner } from './fix-planner';
import { argValue, InversifyBinding, optionsFromEnv } from './inversify-binding';

const issue = Number(argValue('--issue'));
const only = argValue('--only');
if (Number.isNaN(issue)) {
  console.error('usage: node dist/plan.js --issue <epic> [--only <task>] [--out fix-plan.json]');
  process.exit(1);
}

const container = await new InversifyBinding(optionsFromEnv()).initBindings();
const plan = await container.get(FixPlanner).plan(issue, only ? Number(only) : undefined);
await writeFile(argValue('--out') ?? 'fix-plan.json', `${JSON.stringify(plan, undefined, 2)}\n`);
for (const job of plan.jobs) console.log(`job  #${job.task} ${job.owner}/${job.name} (${job.strategy})`);
for (const skip of plan.skipped) console.log(`skip #${skip.task}: ${skip.reason}`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `matrix=${JSON.stringify({ include: plan.jobs })}\nhas_jobs=${plan.jobs.length > 0}\n`,
  );
}
