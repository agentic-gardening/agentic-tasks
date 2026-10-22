import 'reflect-metadata';

import { readFile } from 'node:fs/promises';

import { FixFinisher } from './fix-finisher';
import type { FixPlan } from './fix-planner';
import { argValue, InversifyBinding, optionsFromEnv } from './inversify-binding';

const task = Number(argValue('--task'));
const workdir = argValue('--workdir');
const planFile = argValue('--plan') ?? 'fix-plan.json';
if (Number.isNaN(task) || !workdir) {
  console.error('usage: node dist/finish.js --task <number> --workdir <dir> [--plan fix-plan.json]');
  process.exit(1);
}

const plan = JSON.parse(await readFile(planFile, 'utf8')) as FixPlan;
const job = plan.jobs.find(j => j.task === task);
if (!job) {
  console.error(`task #${task} is not in ${planFile}`);
  process.exit(1);
}

const container = await new InversifyBinding(optionsFromEnv()).initBindings();
const result = await container.get(FixFinisher).finish(job, plan.triage, workdir);
console.log(result.ok ? `PR opened: ${result.url}` : `not opened: ${result.step}`);
