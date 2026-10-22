import 'reflect-metadata';

import { EpicStateUpdater } from './epic-state-updater';
import { argValue, InversifyBinding, optionsFromEnv } from './inversify-binding';

const issue = Number(argValue('--issue'));
if (Number.isNaN(issue)) {
  console.error('usage: node dist/epic.js --issue <epic>');
  process.exit(1);
}
const container = await new InversifyBinding(optionsFromEnv()).initBindings();
console.log(`epic #${issue}: ${await container.get(EpicStateUpdater).update(issue)}`);
