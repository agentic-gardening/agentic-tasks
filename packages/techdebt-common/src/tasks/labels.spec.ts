import { describe, expect, test } from 'vitest';

import {
  depLabel,
  epicTitle,
  formatTechdebtBlock,
  parseTaskTitle,
  parseTechdebtBlock,
  STATE,
  stateOf,
  taskTitle,
} from './labels';

describe('stateOf', () => {
  test('returns the state label', () => {
    expect(stateOf(['kind/dependency', 'state/ready'])).toBe(STATE.READY);
  });
  test('returns undefined without state label', () => {
    expect(stateOf(['kind/dependency'])).toBeUndefined();
  });
});

describe('techdebt block', () => {
  test('round trips', () => {
    const block = { kind: 'dependency' as const, package: 'vitest', target: '5', reason: 'major' as const };
    const text = `intro\n\n${formatTechdebtBlock(block)}\n\ntrailer`;
    expect(parseTechdebtBlock(text)).toStrictEqual(block);
  });
  test('ignores inline comments', () => {
    const text = '<!-- techdebt\nkind: dependency\npackage: pnpm\ntarget: 12.14.0 # with digest\nreason: stale\n-->';
    expect(parseTechdebtBlock(text)?.target).toBe('12.14.0');
  });
  test('returns undefined for bodies without block or unknown kind', () => {
    expect(parseTechdebtBlock('nothing here')).toBeUndefined();
    expect(parseTechdebtBlock('<!-- techdebt\nkind: other\n-->')).toBeUndefined();
    expect(parseTechdebtBlock(undefined)).toBeUndefined();
  });
});

describe('titles', () => {
  test('epic and task titles are ascii', () => {
    expect(epicTitle('eslint-plugin-sonarjs', '4.2.2')).toBe('[dep] eslint-plugin-sonarjs -> 4.2.2');
    expect(taskTitle('minc-org', 'minc-extension', 'vitest', '5')).toBe('[repo] minc-org/minc-extension: vitest -> 5');
  });
  test('parses task title', () => {
    expect(parseTaskTitle('[repo] minc-org/minc-extension')).toStrictEqual({
      owner: 'minc-org',
      name: 'minc-extension',
    });
    expect(parseTaskTitle('[repo] minc-org/minc-extension: @types/node -> 26')).toStrictEqual({
      owner: 'minc-org',
      name: 'minc-extension',
    });
    expect(parseTaskTitle('[dep] vitest -> 5')).toBeUndefined();
  });
  test('dep label strips scope characters', () => {
    expect(depLabel('@vitest/coverage-v8')).toBe('dep/vitest-coverage-v8');
  });
});
