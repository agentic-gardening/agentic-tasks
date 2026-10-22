import { describe, expect, test } from 'vitest';

import type { DependabotPullRequest } from './dependabot-service';
import type { Manifest } from './manifest-service';
import { OutdatedDecider } from './outdated-decider';
import type { RegistryCache } from './registry-service';

const now = new Date('2026-10-18T00:00:00Z');
const old = '2026-09-23T00:00:00Z'; // 25 days
const fresh = '2026-10-08T00:00:00Z'; // 10 days, under the 20-day threshold
const decider = new OutdatedDecider();

function manifest(dependencies: Record<string, string>, extra: Partial<Manifest> = {}): Manifest {
  return { head: 'h', dependencies, resolved: {}, ...extra };
}
function info(latestByMajor: Record<string, string>, publishedAt: Record<string, string>): RegistryCache[string] {
  const latest = Object.values(latestByMajor).at(-1) ?? '0.0.0';
  return { latest, latestByMajor, publishedAt, fetchedAt: now.toISOString() };
}
function pr(packages: string[]): DependabotPullRequest {
  return { repository: 'o/r', number: 1, url: 'u', title: 't', packages };
}

describe('decide', () => {
  test('newer major -> major finding with the highest version of that major', () => {
    const registry = { vitest: info({ '3': '3.2.6', '4': '4.1.4', '5': '5.0.5' }, { '5.0.5': fresh }) };
    expect(decider.decide('o/r', manifest({ vitest: '^3.2.4' }), registry, [], { now })).toStrictEqual([
      { repository: 'o/r', package: 'vitest', current: '3.2.4', target: '5.0.5', epicTarget: '5', reason: 'major' },
    ]);
  });

  test('up to date -> nothing', () => {
    const registry = { vitest: info({ '5': '5.0.5' }, { '5.0.5': old }) };
    expect(decider.decide('o/r', manifest({ vitest: '^5.0.5' }), registry, [], { now })).toStrictEqual([]);
  });

  test('fresh minor -> nothing, stale minor without PR -> stale', () => {
    const freshRegistry = { sonarjs: info({ '4': '4.2.2' }, { '4.2.2': fresh }) };
    expect(decider.decide('o/r', manifest({ sonarjs: '^4.0.3' }), freshRegistry, [], { now })).toStrictEqual([]);
    const staleRegistry = { sonarjs: info({ '4': '4.2.2' }, { '4.2.2': old }) };
    expect(decider.decide('o/r', manifest({ sonarjs: '^4.0.3' }), staleRegistry, [], { now })[0]).toMatchObject({
      target: '4.2.2',
      epicTarget: '4.2.2',
      reason: 'stale',
    });
  });

  test('stale minor with an open dependabot PR in that repository -> nothing', () => {
    const registry = { sonarjs: info({ '4': '4.2.2' }, { '4.2.2': old }) };
    const m = manifest({ sonarjs: '^4.0.3' });
    expect(decider.decide('o/r', m, registry, [pr(['sonarjs'])], { now })).toStrictEqual([]);
    expect(decider.decide('other/r', m, registry, [pr(['sonarjs'])], { now })[0]?.reason).toBe('stale');
  });

  test('@types/node is capped by engines.node', () => {
    const registry = { '@types/node': info({ '22': '22.20.5', '24': '24.12.0', '26': '26.6.5' }, { '26.6.5': old }) };
    const capped = decider.decide('o/r', manifest({ '@types/node': '^22' }, { nodeEngine: '>=24' }), registry, [], {
      now,
    });
    expect(capped[0]).toMatchObject({ target: '24.12.0', epicTarget: '24' });
    const none = decider.decide('o/r', manifest({ '@types/node': '^24' }, { nodeEngine: '>=24' }), registry, [], {
      now,
    });
    expect(none).toStrictEqual([]);
    const uncapped = decider.decide('o/r', manifest({ '@types/node': '^24' }), registry, [], { now });
    expect(uncapped[0]?.epicTarget).toBe('26');
  });

  test('pnpm comes from packageManager', () => {
    const registry = { pnpm: info({ '12': '12.14.0' }, { '12.14.0': old }) };
    const m = manifest({}, { packageManager: 'pnpm@12.4.2+sha512.abc' });
    expect(decider.decide('o/r', m, registry, [], { now })[0]).toMatchObject({
      package: 'pnpm',
      current: '12.4.2',
      target: '12.14.0',
    });
    const major = manifest({}, { packageManager: 'pnpm@11.22.0+sha512.abc' });
    expect(decider.decide('o/r', major, registry, [], { now })[0]).toMatchObject({ epicTarget: '12', reason: 'major' });
  });

  test('ignores unsupported ranges and unknown packages', () => {
    const registry = { a: info({ '9': '9.0.0' }, { '9.0.0': old }) };
    const m = manifest({ a: 'workspace:^', b: '^1.0.0', c: 'github:x/y', d: 'not a range' });
    expect(decider.decide('o/r', m, registry, [], { now })).toStrictEqual([]);
  });
});

describe('resolved versions', () => {
  test('lockfile version wins over the range minimum', () => {
    const registry = { '@types/node': info({ '24': '24.19.2' }, { '24.19.2': old }) };
    const m = manifest({ '@types/node': '^24' }, { resolved: { '@types/node': '24.19.2' } });
    expect(decider.decide('o/r', m, registry, [], { now })).toStrictEqual([]);
    const behind = manifest({ '@types/node': '^24' }, { resolved: { '@types/node': '24.10.0' } });
    expect(decider.decide('o/r', behind, registry, [], { now })[0]).toMatchObject({
      current: '24.10.0',
      reason: 'stale',
    });
  });
});

describe('helpers', () => {
  test('currentVersion is the minimum of the range', () => {
    expect(OutdatedDecider.currentVersion('^3.2.4')).toBe('3.2.4');
    expect(OutdatedDecider.currentVersion('>=24')).toBe('24.0.0');
    expect(OutdatedDecider.currentVersion('6.0.3')).toBe('6.0.3');
    expect(OutdatedDecider.currentVersion('nope')).toBeUndefined();
  });
  test('pnpmVersion', () => {
    expect(OutdatedDecider.pnpmVersion('pnpm@12.14.0+sha512.x')).toBe('12.14.0');
    expect(OutdatedDecider.pnpmVersion('yarn@4.0.0')).toBeUndefined();
    expect(OutdatedDecider.pnpmVersion(undefined)).toBeUndefined();
  });
});
