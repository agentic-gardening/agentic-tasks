import { describe, expect, test } from 'vitest';

import { PrInspector } from './pr-inspector';

describe('parseUrl', () => {
  test('extracts owner, repo and number', () => {
    expect(PrInspector.parseUrl('<!-- pr -->\nhttps://github.com/minc-org/minc-extension/pull/612')).toStrictEqual({
      owner: 'minc-org',
      repo: 'minc-extension',
      number: 612,
    });
    expect(PrInspector.parseUrl('no url')).toBeUndefined();
  });
});

describe('toStatus', () => {
  const ref = { owner: 'o', repo: 'r', number: 1 };
  test('maps rollup, failed check runs and status contexts', () => {
    const status = PrInspector.toStatus(ref, {
      url: 'u',
      state: 'OPEN',
      mergeable: 'MERGEABLE',
      headRefName: 'techdebt/vitest-5',
      baseRefName: 'main',
      headRepository: { nameWithOwner: 'bot/r' },
      timelineItems: { nodes: [] },
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                state: 'FAILURE',
                contexts: {
                  nodes: [
                    { name: 'check', conclusion: 'FAILURE' },
                    { name: 'lint', conclusion: 'SUCCESS' },
                    { name: 'pending', conclusion: null },
                    { context: 'codecov/patch', state: 'ERROR' },
                    { context: 'ok', state: 'SUCCESS' },
                  ],
                },
              },
            },
          },
        ],
      },
    });
    expect(status).toMatchObject({
      checks: 'FAILURE',
      failedChecks: ['check', 'codecov/patch'],
      headRepo: 'bot/r',
      closedBy: undefined,
    });
  });
  test('no rollup means no checks; closed PR exposes the closer', () => {
    const status = PrInspector.toStatus(ref, {
      url: 'u',
      state: 'CLOSED',
      mergeable: 'UNKNOWN',
      headRefName: 'b',
      baseRefName: 'main',
      headRepository: null,
      timelineItems: { nodes: [{ actor: { login: 'alice' } }] },
      commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    });
    expect(status).toMatchObject({ checks: 'NONE', failedChecks: [], headRepo: 'o/r', closedBy: 'alice' });
  });
});
