import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { CatalogPublisher } from './catalog-publisher';

test('writes once and reports no change on identical content', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'catalog-')), 'repositories.json');
  const repos = [
    {
      owner: 'o',
      name: 'r',
      default_branch: 'main',
      head: 'h',
      package_json_paths: ['package.json'],
      bot_has_write: false,
    },
  ];
  const publisher = new CatalogPublisher();
  expect(await publisher.publish(path, repos)).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8'))).toStrictEqual(repos);
  expect(await publisher.publish(path, repos)).toBe(false);
  expect(await publisher.publish(path, [])).toBe(true);
});
