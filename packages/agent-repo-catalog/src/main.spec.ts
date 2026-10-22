import { expect, test, vi } from 'vitest';

import type { CatalogConfig } from './catalog-config';
import type { CatalogPublisher } from './catalog-publisher';
import { CatalogMain } from './main';
import type { RepositoryDiscovery } from './repository-discovery';
import type { RepositoryInspector } from './repository-inspector';

test('inspects every discovered repository and publishes the kept ones', async () => {
  const kept = {
    owner: 'o',
    name: 'a',
    default_branch: 'main',
    head: 'h',
    package_json_paths: ['package.json'],
    bot_has_write: false,
  };
  const config = { load: vi.fn().mockResolvedValue({ repositories: [], patterns: [] }) } as unknown as CatalogConfig;
  const discovery = {
    discover: vi.fn().mockResolvedValue([
      { owner: 'o', name: 'a' },
      { owner: 'o', name: 'b' },
    ]),
  } as unknown as RepositoryDiscovery;
  const inspector = {
    inspect: vi.fn().mockResolvedValueOnce(kept).mockResolvedValueOnce(undefined),
  } as unknown as RepositoryInspector;
  const publisher = { publish: vi.fn().mockResolvedValue(true) } as unknown as CatalogPublisher;
  vi.spyOn(console, 'log').mockImplementation(() => {});

  const result = await new CatalogMain(config, discovery, inspector, publisher).run('c.yaml', 'out.json');
  expect(result).toStrictEqual([kept]);
  expect(publisher.publish).toHaveBeenCalledWith('out.json', [kept]);
});
