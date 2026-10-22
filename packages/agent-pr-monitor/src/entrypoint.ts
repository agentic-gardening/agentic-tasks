import 'reflect-metadata';

import { LoopRunner } from 'techdebt-common';

import { InversifyBinding } from './inversify-binding';
import { MonitorMain } from './main';

const INTERVAL_MS = 60 * 60 * 1000;

const tasksToken = process.env.TASKS_TOKEN;
const botToken = process.env.BOT_TOKEN;
if (!tasksToken || !botToken) {
  console.error('TASKS_TOKEN and BOT_TOKEN are required');
  process.exit(1);
}

const container = await new InversifyBinding({
  tasksToken,
  botToken,
  botLogin: process.env.BOT_LOGIN ?? 'podman-desktop-bot',
}).initBindings();

await container.get(LoopRunner).run(() => container.get(MonitorMain).run(), { intervalMs: INTERVAL_MS });
