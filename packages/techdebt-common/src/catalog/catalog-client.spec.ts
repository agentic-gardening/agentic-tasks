import { afterEach, expect, test, vi } from 'vitest';

import { CatalogClient } from './catalog-client';

afterEach(() => vi.unstubAllGlobals());

test('fetches and returns the repository list', async () => {
  const repos = [
    {
      owner: 'o',
      name: 'n',
      default_branch: 'main',
      head: 'h',
      package_json_paths: ['package.json'],
      bot_has_write: false,
    },
  ];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => repos }));
  expect(await new CatalogClient('https://x').fetch()).toStrictEqual(repos);
});

test('fails on http error or non-array', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  await expect(new CatalogClient('https://x').fetch()).rejects.toThrow('HTTP 404');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  await expect(new CatalogClient('https://x').fetch()).rejects.toThrow('not a JSON array');
});
