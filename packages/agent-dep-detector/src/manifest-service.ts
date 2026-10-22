import type { Octokit } from '@octokit/rest';
import { inject, injectable, named } from 'inversify';
import semver from 'semver';
import { fullName, OctokitNames, type Repository } from 'techdebt-common';
import { parseAllDocuments } from 'yaml';

export interface Manifest {
  head: string;
  /** declared ranges, dev and prod merged over every package.json of the repo */
  dependencies: Record<string, string>;
  /** versions resolved in pnpm-lock.yaml (lowest when several importers differ) */
  resolved: Record<string, string>;
  /** `pnpm@12.14.0+sha512...` */
  packageManager?: string;
  nodeEngine?: string;
}

export type ManifestCache = Record<string, Manifest>;

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  engines?: { node?: string };
}

/** Reads every package.json of each repository, once per head commit. */
@injectable()
export class ManifestService {
  constructor(@inject('Octokit') @named(OctokitNames.READ) private readonly octokit: Octokit) {}

  async collect(repositories: Repository[], cache: ManifestCache): Promise<ManifestCache> {
    const next: ManifestCache = {};
    for (const repository of repositories) {
      const key = fullName(repository);
      const cached = cache[key];
      next[key] = cached?.head === repository.head ? cached : await this.read(repository);
    }
    return next;
  }

  private async read(repository: Repository): Promise<Manifest> {
    const paths = [...repository.package_json_paths, 'pnpm-lock.yaml'];
    const aliases = paths
      .map((path, i) => `p${i}: object(expression: "${repository.head}:${path}") { ... on Blob { text isTruncated } }`)
      .join('\n');
    const data = await this.octokit.graphql<{
      repository: Record<string, { text: string; isTruncated: boolean } | null>;
    }>(`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${aliases} } }`, {
      owner: repository.owner,
      name: repository.name,
    });
    const files = repository.package_json_paths
      .map((_, i) => data.repository[`p${i}`]?.text)
      .filter((text): text is string => typeof text === 'string')
      .map(text => ManifestService.parse(text));
    const lock = data.repository[`p${paths.length - 1}`];
    const resolved = lock && !lock.isTruncated ? ManifestService.parseLockfile(lock.text) : {};
    return ManifestService.merge(repository.head, files, resolved);
  }

  /**
   * `importers.*.(dependencies|devDependencies).<name>.version` of a pnpm v9 lockfile, peer suffixes
   * stripped. pnpm 12 writes several YAML documents (the first one only holds pnpm itself), so all
   * documents are merged.
   */
  static parseLockfile(text: string): Record<string, string> {
    type Lockfile = { importers?: Record<string, Record<string, Record<string, { version?: string }>>> };
    let docs: Lockfile[];
    try {
      docs = parseAllDocuments(text).map(d => (d.toJS() ?? {}) as Lockfile);
    } catch {
      return {};
    }
    const resolved: Record<string, string> = {};
    for (const importer of docs.flatMap(doc => Object.values(doc.importers ?? {}))) {
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [name, entry] of Object.entries(importer[section] ?? {})) {
          const version = entry.version?.split('(')[0];
          if (!version || !semver.valid(version)) continue;
          if (!resolved[name] || semver.lt(version, resolved[name])) resolved[name] = version;
        }
      }
    }
    return resolved;
  }

  static parse(text: string): PackageJson {
    try {
      return JSON.parse(text) as PackageJson;
    } catch {
      return {};
    }
  }

  static merge(head: string, files: PackageJson[], resolved: Record<string, string> = {}): Manifest {
    const dependencies: Record<string, string> = {};
    let packageManager: string | undefined;
    let nodeEngine: string | undefined;
    for (const file of files) {
      Object.assign(dependencies, file.dependencies ?? {}, file.devDependencies ?? {});
      packageManager ??= file.packageManager;
      nodeEngine ??= file.engines?.node;
    }
    return { head, dependencies, resolved, packageManager, nodeEngine };
  }
}
