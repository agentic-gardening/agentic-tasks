import { expect, test } from 'vitest';

import { IssueEventPoller } from './issue-event-poller';

test('toIssue flattens labels, label events (latest first) and comment markers', () => {
  const polled = IssueEventPoller.toIssue({
    id: 'I',
    number: 3,
    title: 't',
    body: 'b',
    updatedAt: 'u',
    issueType: { name: 'Epic' },
    author: { login: 'a' },
    labels: { nodes: [{ name: 'state/ready' }] },
    timelineItems: {
      nodes: [
        { __typename: 'LabeledEvent', createdAt: '1', actor: { login: 'x' }, label: { name: 'state/triaging' } },
        { __typename: 'OtherEvent' },
        { __typename: 'LabeledEvent', createdAt: '2', actor: null, label: { name: 'state/ready' } },
      ],
    },
    comments: { nodes: [{ body: 'hello' }, { body: '<!-- triage -->\nstrategy: C' }, { body: '<!--ping-->' }] },
  });
  expect(polled).toStrictEqual({
    id: 'I',
    number: 3,
    title: 't',
    body: 'b',
    type: 'Epic',
    author: 'a',
    labels: ['state/ready'],
    updatedAt: 'u',
    labelEvents: [
      { label: 'state/ready', actor: undefined, createdAt: '2' },
      { label: 'state/triaging', actor: 'x', createdAt: '1' },
    ],
    commentMarkers: ['<!-- triage -->', '<!-- ping -->'],
  });
});
