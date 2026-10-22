import { describe, expect, test } from 'vitest';

import { OutcomeClassifier } from './outcome-classifier';
import type { PullRequestStatus } from './pr-inspector';

const base: PullRequestStatus = {
  ref: { owner: 'o', repo: 'r', number: 1 },
  url: 'u',
  state: 'OPEN',
  mergeable: 'MERGEABLE',
  checks: 'SUCCESS',
  failedChecks: [],
  headRef: 'b',
  headRepo: 'bot/r',
  baseRef: 'main',
  closedBy: undefined,
};
const classifier = new OutcomeClassifier();

describe('classify', () => {
  test.each<[string, Partial<PullRequestStatus>, unknown]>([
    ['merged', { state: 'MERGED' }, { kind: 'merged' }],
    ['closed by human', { state: 'CLOSED', closedBy: 'alice' }, { kind: 'closed', by: 'alice' }],
    [
      'conflict wins over red checks',
      { mergeable: 'CONFLICTING', checks: 'FAILURE', failedChecks: ['check'] },
      { kind: 'conflict' },
    ],
    ['real failure', { checks: 'FAILURE', failedChecks: ['check', 'e2e'] }, { kind: 'ci-failed', checks: ['check'] }],
    [
      'only secret-dependent failures',
      { checks: 'FAILURE', failedChecks: ['e2e-tests', 'codecov/patch'] },
      { kind: 'needs-human', checks: ['e2e-tests', 'codecov/patch'] },
    ],
    ['failure without names', { checks: 'FAILURE', failedChecks: [] }, { kind: 'ci-failed', checks: [] }],
    ['pending', { checks: 'PENDING' }, { kind: 'waiting' }],
    ['green', {}, { kind: 'waiting' }],
  ])('%s', (_label, overrides, expected) => {
    expect(classifier.classify({ ...base, ...overrides })).toStrictEqual(expected);
  });
});
