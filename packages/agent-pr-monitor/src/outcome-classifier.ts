import { injectable } from 'inversify';

import type { PullRequestStatus } from './pr-inspector';

export type Outcome =
  | { kind: 'merged' }
  | { kind: 'closed'; by: string | undefined }
  | { kind: 'conflict' }
  | { kind: 'ci-failed'; checks: string[] }
  | { kind: 'needs-human'; checks: string[] }
  | { kind: 'waiting' };

/** Jobs that need repository secrets and can never pass from a fork. */
const SECRET_DEPENDENT = /e2e|playwright|codecov|argos|publish|release/i;

@injectable()
export class OutcomeClassifier {
  classify(status: PullRequestStatus): Outcome {
    if (status.state === 'MERGED') return { kind: 'merged' };
    if (status.state === 'CLOSED') return { kind: 'closed', by: status.closedBy };
    if (status.mergeable === 'CONFLICTING') return { kind: 'conflict' };
    if (status.checks === 'FAILURE') {
      const real = status.failedChecks.filter(name => !SECRET_DEPENDENT.test(name));
      return real.length === 0 && status.failedChecks.length > 0
        ? { kind: 'needs-human', checks: status.failedChecks }
        : { kind: 'ci-failed', checks: real };
    }
    return { kind: 'waiting' };
  }
}
