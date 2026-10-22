import { injectable } from 'inversify';
import semver from 'semver';
import type { TechdebtReason } from 'techdebt-common';

import type { DependabotPullRequest } from './dependabot-service';
import type { Manifest } from './manifest-service';
import { PNPM_PACKAGE, type RegistryCache } from './registry-service';

export interface Finding {
  repository: string;
  package: string;
  current: string;
  /** exact version the repository should move to */
  target: string;
  /** what goes in the epic title: a major ("5") or an exact version ("4.2.2") */
  epicTarget: string;
  reason: TechdebtReason;
}

export interface DeciderOptions {
  /** a release younger than this is never "stale" */
  staleAfterDays?: number;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UNSUPPORTED_RANGE = /^(workspace|catalog|link|file|npm|git|github):/;

/** Pure decision logic: which (repository, package) pairs deserve an epic. */
@injectable()
export class OutdatedDecider {
  decide(
    repository: string,
    manifest: Manifest,
    registry: RegistryCache,
    pullRequests: DependabotPullRequest[],
    options: DeciderOptions = {},
  ): Finding[] {
    const now = options.now ?? new Date();
    const staleMs = (options.staleAfterDays ?? 20) * DAY_MS;
    const findings: Finding[] = [];
    const prs = pullRequests.filter(pr => pr.repository === repository);

    for (const [name, range] of OutdatedDecider.declared(manifest)) {
      const info = registry[name];
      const current = OutdatedDecider.currentOf(manifest, name, range);
      if (!info || !current) continue;

      const majors = Object.keys(info.latestByMajor).map(Number);
      const highestMajor = OutdatedDecider.capMajor(name, Math.max(...majors), manifest.nodeEngine);
      if (highestMajor > semver.major(current)) {
        const target = info.latestByMajor[String(highestMajor)];
        findings.push({
          repository,
          package: name,
          current,
          target,
          epicTarget: String(highestMajor),
          reason: 'major',
        });
        continue;
      }

      const latestInMajor = info.latestByMajor[String(semver.major(current))];
      if (!latestInMajor || !semver.gt(latestInMajor, current)) continue;
      const published = info.publishedAt[latestInMajor];
      if (!published || now.getTime() - new Date(published).getTime() < staleMs) continue;

      if (prs.some(pr => pr.packages.includes(name))) continue;
      findings.push({
        repository,
        package: name,
        current,
        target: latestInMajor,
        epicTarget: latestInMajor,
        reason: 'stale',
      });
    }
    return findings;
  }

  /** dependencies plus the package manager as a pseudo dependency */
  static declared(manifest: Manifest): [string, string][] {
    const entries = Object.entries(manifest.dependencies).filter(([, range]) => !UNSUPPORTED_RANGE.test(range));
    const pnpm = OutdatedDecider.pnpmVersion(manifest.packageManager);
    if (pnpm) entries.push([PNPM_PACKAGE, pnpm]);
    return entries;
  }

  static pnpmVersion(packageManager: string | undefined): string | undefined {
    if (!packageManager?.startsWith('pnpm@')) return undefined;
    const version = packageManager.slice('pnpm@'.length).split('+')[0];
    return semver.valid(version) ? version : undefined;
  }

  /** the lockfile's resolved version when known, else the lowest version the range allows */
  static currentOf(manifest: Manifest, name: string, range: string): string | undefined {
    return manifest.resolved[name] ?? OutdatedDecider.currentVersion(range);
  }

  /** the lowest version a range allows */
  static currentVersion(range: string): string | undefined {
    try {
      return semver.minVersion(range)?.version;
    } catch {
      return undefined;
    }
  }

  /** @types/node never goes past the Node engine the repository declares */
  static capMajor(name: string, major: number, nodeEngine: string | undefined): number {
    if (name !== '@types/node' || !nodeEngine) return major;
    const engine = OutdatedDecider.currentVersion(nodeEngine);
    return engine ? Math.min(major, semver.major(engine)) : major;
  }
}
