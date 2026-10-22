import type { Octokit } from '@octokit/rest';
import { beforeEach, expect, test, vi } from 'vitest';

import { PermissionGuard } from './permission-guard';

const getCollaboratorPermissionLevel = vi.fn();
const octokit = { rest: { repos: { getCollaboratorPermissionLevel } } } as unknown as Octokit;
let guard: PermissionGuard;

beforeEach(() => {
  vi.resetAllMocks();
  guard = new PermissionGuard(octokit, { owner: 'o', name: 'tasks' });
});

test('write, maintain and admin are allowed, read is not', async () => {
  getCollaboratorPermissionLevel
    .mockResolvedValueOnce({ data: { permission: 'write' } })
    .mockResolvedValueOnce({ data: { permission: 'read', role_name: 'maintain' } })
    .mockResolvedValueOnce({ data: { permission: 'admin' } })
    .mockResolvedValueOnce({ data: { permission: 'read' } });
  expect(await guard.hasWriteAccess('a')).toBe(true);
  expect(await guard.hasWriteAccess('b')).toBe(true);
  expect(await guard.hasWriteAccess('c')).toBe(true);
  expect(await guard.hasWriteAccess('d')).toBe(false);
});

test('caches per login and denies on error or missing login', async () => {
  getCollaboratorPermissionLevel.mockRejectedValue(new Error('404'));
  expect(await guard.hasWriteAccess('ghost')).toBe(false);
  expect(await guard.hasWriteAccess('ghost')).toBe(false);
  expect(getCollaboratorPermissionLevel).toHaveBeenCalledOnce();
  expect(await guard.hasWriteAccess(undefined)).toBe(false);
});
