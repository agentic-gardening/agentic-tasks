import { type Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';
import semver from 'semver';
import { OctokitNames } from 'techdebt-common';

export interface PackageInfo {
  etag?: string;
  /** dist-tags.latest */
  latest: string;
  /** highest stable version per major, e.g. { "4": "4.2.2", "5": "5.0.5" } */
  latestByMajor: Record<string, string>;
  /** ISO publish time for the versions above */
  publishedAt: Record<string, string>;
  fetchedAt: string;
}

export type RegistryCache = Record<string, PackageInfo>;

export const PNPM_PACKAGE = 'pnpm';
const REGISTRY = 'https://registry.npmjs.org';

interface RegistryDocument {
  'dist-tags'?: { latest?: string };
  versions?: Record<string, unknown>;
  time?: Record<string, string>;
}

/** npm registry metadata with ETag caching; pnpm comes from GitHub releases. */
@injectable()
export class RegistryService {
  constructor(@inject('Octokit') @named(OctokitNames.READ) private readonly octokit: Octokit) {}

  async refresh(packages: Iterable<string>, cache: RegistryCache): Promise<RegistryCache> {
    const next: RegistryCache = {};
    for (const name of new Set(packages)) {
      try {
        next[name] = name === PNPM_PACKAGE ? await this.fetchPnpm() : await this.fetchNpm(name, cache[name]);
      } catch (error: unknown) {
        console.log(
          `registry: ${name} failed, keeping cache (${error instanceof Error ? error.message : String(error)})`,
        );
        if (cache[name]) next[name] = cache[name];
      }
    }
    return next;
  }

  private async fetchNpm(name: string, cached: PackageInfo | undefined): Promise<PackageInfo> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    const response = await globalThis.fetch(`${REGISTRY}/${name}`, { headers });
    if (response.status === 304 && cached) return { ...cached, fetchedAt: new Date().toISOString() };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const info = RegistryService.summarize((await response.json()) as RegistryDocument);
    return { ...info, etag: response.headers.get('etag') ?? undefined, fetchedAt: new Date().toISOString() };
  }

  static summarize(doc: RegistryDocument): Omit<PackageInfo, 'etag' | 'fetchedAt'> {
    const versions = Object.keys(doc.versions ?? {}).filter(v => semver.valid(v) && !semver.prerelease(v));
    const latestByMajor: Record<string, string> = {};
    for (const version of versions) {
      const major = String(semver.major(version));
      if (!latestByMajor[major] || semver.gt(version, latestByMajor[major])) latestByMajor[major] = version;
    }
    const latest = doc['dist-tags']?.latest ?? semver.maxSatisfying(versions, '*') ?? '0.0.0';
    const publishedAt: Record<string, string> = {};
    for (const version of [latest, ...Object.values(latestByMajor)]) {
      const time = doc.time?.[version];
      if (time) publishedAt[version] = time;
    }
    return { latest, latestByMajor, publishedAt };
  }

  private async fetchPnpm(): Promise<PackageInfo> {
    const { data } = await this.octokit.rest.repos.getLatestRelease({ owner: 'pnpm', repo: 'pnpm' });
    const latest = data.tag_name.replace(/^v/, '');
    return {
      latest,
      latestByMajor: { [String(semver.major(latest))]: latest },
      publishedAt: { [latest]: data.published_at ?? data.created_at },
      fetchedAt: new Date().toISOString(),
    };
  }
}
