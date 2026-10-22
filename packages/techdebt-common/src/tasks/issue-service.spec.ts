import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { IssueService } from './issue-service';
import { STATE } from './labels';

const graphql = vi.fn();
const removeLabel = vi.fn();
const addLabels = vi.fn();
const createLabel = vi.fn();
const octokit = {
  graphql,
  paginate: vi.fn(),
  rest: { issues: { removeLabel, addLabels, createLabel, createComment: vi.fn(), update: vi.fn() } },
} as unknown as Octokit;

let service: IssueService;

beforeEach(() => {
  vi.resetAllMocks();
  service = new IssueService(octokit, { owner: 'o', name: 'tasks' });
});

describe('setState', () => {
  test('removes other state labels and adds the new one', async () => {
    const issue = { number: 7, labels: ['kind/dependency', STATE.TRIAGING] };
    await service.setState(issue, STATE.READY);
    expect(removeLabel).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7, name: STATE.TRIAGING }));
    expect(addLabels).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7, labels: [STATE.READY] }));
    expect(issue.labels).toStrictEqual(['kind/dependency', STATE.READY]);
  });
  test('is a no-op when already in that state', async () => {
    await service.setState({ number: 7, labels: [STATE.READY] }, STATE.READY);
    expect(removeLabel).not.toHaveBeenCalled();
    expect(addLabels).not.toHaveBeenCalled();
  });
});

describe('findByTitle', () => {
  test('returns only an exact title match', async () => {
    graphql.mockResolvedValue({
      search: {
        nodes: [
          { id: 'a', number: 1, url: 'u1', title: '[dep] vitest -> 5.0', state: 'OPEN', labels: { nodes: [] } },
          {
            id: 'b',
            number: 2,
            url: 'u2',
            title: '[dep] vitest -> 5',
            state: 'OPEN',
            labels: { nodes: [{ name: 'x' }] },
          },
        ],
      },
    });
    const found = await service.findByTitle('[dep] vitest -> 5');
    expect(found).toStrictEqual({
      id: 'b',
      number: 2,
      url: 'u2',
      title: '[dep] vitest -> 5',
      state: 'OPEN',
      labels: ['x'],
    });
  });
  test('returns undefined when nothing matches', async () => {
    graphql.mockResolvedValue({ search: { nodes: [{}] } });
    expect(await service.findByTitle('[dep] nope -> 1')).toBeUndefined();
  });
});

describe('create', () => {
  test('resolves repository, type and label ids then creates', async () => {
    graphql.mockImplementation(async (query: string) => {
      if (query.includes('issueTypes')) return { repository: { issueTypes: { nodes: [{ id: 'T1', name: 'Epic' }] } } };
      if (query.includes('labels(first'))
        return { repository: { labels: { nodes: [{ id: 'L1', name: 'state/triaging' }] } } };
      if (query.includes('createIssue')) return { createIssue: { issue: { id: 'I1', number: 9, url: 'u' } } };
      return { repository: { id: 'R1' } };
    });
    createLabel.mockResolvedValue({ data: { node_id: 'L2' } });
    const ref = await service.create({ title: 't', body: 'b', type: 'Epic', labels: ['state/triaging', 'dep/vitest'] });
    expect(ref).toStrictEqual({ id: 'I1', number: 9, url: 'u' });
    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'dep/vitest' }));
    const createCall = graphql.mock.calls.find(([q]) => (q as string).includes('createIssue'));
    expect(createCall?.[1]).toStrictEqual({
      input: { repositoryId: 'R1', title: 't', body: 'b', issueTypeId: 'T1', labelIds: ['L1', 'L2'] },
    });
  });
  test('fails when the issue type is missing', async () => {
    graphql.mockImplementation(async (query: string) => {
      if (query.includes('issueTypes')) return { repository: { issueTypes: { nodes: [] } } };
      if (query.includes('labels(first')) return { repository: { labels: { nodes: [] } } };
      return { repository: { id: 'R1' } };
    });
    await expect(service.create({ title: 't', body: 'b', type: 'Epic', labels: [] })).rejects.toThrow(
      'issue type "Epic"',
    );
  });
});
