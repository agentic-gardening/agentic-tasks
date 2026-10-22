import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';

import { ContextBuilder } from './context-builder';
import { InversifyBinding } from './inversify-binding';

const token = process.env.TASKS_TOKEN ?? process.env.GH_TOKEN;
const issueArg = process.argv[process.argv.indexOf('--issue') + 1];
const output = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'triage-context.json';
if (!token || !issueArg || Number.isNaN(Number(issueArg))) {
  console.error('usage: TASKS_TOKEN=... node dist/context.js --issue <number> [--out file]');
  process.exit(1);
}

const container = await new InversifyBinding(token).initBindings();
const context = await container.get(ContextBuilder).build(Number(issueArg));
await writeFile(output, `${JSON.stringify(context, undefined, 2)}\n`);
console.log(
  `${output}: epic #${context.epic.number}, ${context.tasks.length} task(s), candidate ${context.candidate?.repository ?? 'none'}`,
);
