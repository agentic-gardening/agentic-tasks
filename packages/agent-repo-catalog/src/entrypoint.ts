import 'reflect-metadata';

import { InversifyBinding } from './inversify-binding';
import { CatalogMain } from './main';

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

const container = await new InversifyBinding(githubToken, process.env.BOT_TOKEN || undefined).initBindings();
await container.get(CatalogMain).run();
