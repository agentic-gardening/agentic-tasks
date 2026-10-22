import { injectable } from 'inversify';
import { ISSUE_TYPE, KIND, MARKER, STATE, type State, stateOf } from 'techdebt-common';

import type { PolledIssue } from './issue-event-poller';

export type Action =
  | { type: 'set-state'; issue: number; state: State }
  | { type: 'add-labels'; issue: number; labels: string[] }
  | { type: 'comment'; issue: number; body: string }
  | { type: 'dispatch'; issue: number; agent: 'triage' | 'fixer'; inputs: Record<string, string> }
  | { type: 'ignore'; issue: number; reason: string };

export interface RuleContext {
  /** login allowed to add state/approved */
  approver: string;
  /** actor -> has write access on tasks */
  hasWriteAccess: (login: string | undefined) => Promise<boolean>;
}

/** Pure routing rules: which actions an issue in its current state calls for. */
@injectable()
export class DispatchRules {
  async evaluate(issue: PolledIssue, context: RuleContext): Promise<Action[]> {
    if (issue.type !== ISSUE_TYPE.EPIC) return [];
    const state = stateOf(issue.labels);
    const lastStateEvent = issue.labelEvents.find(e => e.label === state);
    const actor = lastStateEvent?.actor ?? issue.author;

    if (!state) {
      if (!(await context.hasWriteAccess(issue.author))) return [DispatchRules.noAccess(issue, issue.author)];
      const labels = issue.labels.includes(KIND.DEPENDENCY) ? [STATE.TRIAGING] : [KIND.MANUAL, STATE.TRIAGING];
      return [{ type: 'add-labels', issue: issue.number, labels }];
    }

    if (!(await context.hasWriteAccess(actor))) return [DispatchRules.noAccess(issue, actor)];

    switch (state) {
      case STATE.TRIAGING:
        if (issue.commentMarkers.includes(MARKER.TRIAGE))
          return [{ type: 'ignore', issue: issue.number, reason: 'triage comment present' }];
        return [{ type: 'dispatch', issue: issue.number, agent: 'triage', inputs: { issue: String(issue.number) } }];
      case STATE.READY: {
        if (issue.commentMarkers.includes(MARKER.PING))
          return [{ type: 'ignore', issue: issue.number, reason: 'already pinged' }];
        const body = `${MARKER.PING}\n@${context.approver} triage is done, add the label \`${STATE.APPROVED}\` to let the fixer open the pull requests.`;
        return [{ type: 'comment', issue: issue.number, body }];
      }
      case STATE.APPROVED:
        if (actor !== context.approver) {
          return [
            { type: 'set-state', issue: issue.number, state: STATE.READY },
            {
              type: 'comment',
              issue: issue.number,
              body: `Only @${context.approver} can add \`${STATE.APPROVED}\`; label removed.`,
            },
          ];
        }
        return [
          { type: 'set-state', issue: issue.number, state: STATE.IN_PROGRESS },
          { type: 'dispatch', issue: issue.number, agent: 'fixer', inputs: { issue: String(issue.number) } },
        ];
      case STATE.CONFLICT:
        return [
          { type: 'set-state', issue: issue.number, state: STATE.IN_PROGRESS },
          { type: 'dispatch', issue: issue.number, agent: 'fixer', inputs: { issue: String(issue.number) } },
        ];
      default:
        return [];
    }
  }

  private static noAccess(issue: PolledIssue, actor: string | undefined): Action {
    return { type: 'ignore', issue: issue.number, reason: `actor ${actor ?? 'unknown'} has no write access` };
  }
}
