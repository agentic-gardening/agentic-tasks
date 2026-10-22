import { expect, test, vi } from 'vitest';

import { API_VERSION, OctokitBuilder } from './octokit-builder';

test('sends the pinned API version header', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }));
  const octokit = new OctokitBuilder().build('t');
  await octokit.request('GET /meta', { request: { fetch } });
  expect(fetch.mock.calls[0]?.[1]?.headers['x-github-api-version']).toBe(API_VERSION);
});
