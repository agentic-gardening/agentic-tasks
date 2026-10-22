import type { Octokit } from '@octokit/rest';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { RegistryService } from './registry-service';

afterEach(() => vi.unstubAllGlobals());

const doc = {
  'dist-tags': { latest: '5.0.5' },
  versions: { '4.1.3': {}, '4.1.4': {}, '5.0.0-beta.1': {}, '5.0.4': {}, '5.0.5': {} },
  time: { '4.1.4': '2026-01-01T00:00:00Z', '5.0.5': '2026-10-01T00:00:00Z', '5.0.4': '2026-09-01T00:00:00Z' },
};

describe('summarize', () => {
  test('highest stable per major and publish times', () => {
    expect(RegistryService.summarize(doc)).toStrictEqual({
      latest: '5.0.5',
      latestByMajor: { '4': '4.1.4', '5': '5.0.5' },
      publishedAt: { '5.0.5': '2026-10-01T00:00:00Z', '4.1.4': '2026-01-01T00:00:00Z' },
    });
  });
});

describe('refresh', () => {
  const octokit = {
    rest: {
      repos: { getLatestRelease: vi.fn().mockResolvedValue({ data: { tag_name: 'v12.14.0', published_at: 'p' } }) },
    },
  } as unknown as Octokit;

  test('fetches with etag, honours 304, and reads pnpm from GitHub releases', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ etag: 'E1' }), json: async () => doc })
      .mockResolvedValueOnce({ ok: true, status: 304, headers: new Headers() });
    vi.stubGlobal('fetch', fetch);
    const service = new RegistryService(octokit);
    const first = await service.refresh(['vitest', 'pnpm'], {});
    expect(first.vitest.etag).toBe('E1');
    expect(first.pnpm).toMatchObject({
      latest: '12.14.0',
      latestByMajor: { '12': '12.14.0' },
      publishedAt: { '12.14.0': 'p' },
    });

    const second = await service.refresh(['vitest'], first);
    expect(fetch.mock.calls[1][1]).toMatchObject({ headers: { 'if-none-match': 'E1' } });
    expect(second.vitest.latest).toBe('5.0.5');
  });

  test('keeps the cached entry when the registry fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, headers: new Headers() }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const cached = { latest: '1.0.0', latestByMajor: { '1': '1.0.0' }, publishedAt: {}, fetchedAt: 'x' };
    expect(await new RegistryService(octokit).refresh(['a', 'b'], { a: cached })).toStrictEqual({ a: cached });
  });
});
