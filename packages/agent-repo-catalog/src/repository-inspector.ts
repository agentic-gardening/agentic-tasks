import type { Octokit } from '@octokit/rest';
import { inject, injectable, named, optional } from 'inversify';
import { OctokitNames, type Repository, type RepositoryRef } from 'techdebt-common';
import { parse } from 'yaml';

export const BOT_TOKEN_PRESENT = Symbol.for('agent-repo-catalog.bot-token-present');

interface InspectResponse {
  repository: {
    isArchived: boolean;
    viewerPermission: string | null;
    defaultBranchRef: { name: string; target: { oid: string } } | null;
    lock: { id: string } | null;
    pkg: { id: string } | null;
    ws: { text: string } | null;
  } | null;
}

interface TreeResponse {
  repository: { object: { entries: { name: string; type: string }[] } | null };
}

interface ExistsResponse {
  repository: Record<string, { id: string } | null>;
}

const WRITE_PERMISSIONS = new Set(['WRITE', 'MAINTAIN', 'ADMIN']);

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  return value.slice(0, end);
}

/** Reads what the agents need to know about one repository, in as few GraphQL calls as possible. */
@injectable()
export class RepositoryInspector {
  constructor(
    @inject('Octokit') @named(OctokitNames.READ) private readonly octokit: Octokit,
    @inject(BOT_TOKEN_PRESENT) @optional() private readonly botTokenPresent: boolean = false,
  ) {}

  /** Returns undefined when the repository must not be listed (archived, missing, not pnpm). */
  async inspect(ref: RepositoryRef): Promise<Repository | undefined> {
    const data = await this.octokit.graphql<InspectResponse>(
      `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          isArchived
          viewerPermission
          defaultBranchRef { name target { oid } }
          lock: object(expression: "HEAD:pnpm-lock.yaml") { id }
          pkg: object(expression: "HEAD:package.json") { id }
          ws: object(expression: "HEAD:pnpm-workspace.yaml") { ... on Blob { text } }
        }
      }`,
      { owner: ref.owner, name: ref.name },
    );
    const repo = data.repository;
    if (!repo || repo.isArchived || !repo.lock || !repo.pkg || !repo.defaultBranchRef) return undefined;

    const workspacePaths = await this.expandWorkspaces(ref, RepositoryInspector.workspaceGlobs(repo.ws?.text));
    return {
      owner: ref.owner,
      name: ref.name,
      default_branch: repo.defaultBranchRef.name,
      head: repo.defaultBranchRef.target.oid,
      package_json_paths: ['package.json', ...workspacePaths],
      bot_has_write: this.botTokenPresent && WRITE_PERMISSIONS.has(repo.viewerPermission ?? ''),
    };
  }

  /** `packages:` globs of pnpm-workspace.yaml, negations removed. */
  static workspaceGlobs(text: string | undefined): { include: string[]; exclude: string[] } {
    if (!text) return { include: [], exclude: [] };
    const raw = (parse(text) ?? {}) as { packages?: unknown };
    const globs = Array.isArray(raw.packages) ? raw.packages.filter((p): p is string => typeof p === 'string') : [];
    return {
      include: globs.filter(g => !g.startsWith('!')),
      exclude: globs.filter(g => g.startsWith('!')).map(g => g.slice(1)),
    };
  }

  /**
   * Expands `dir/*` style globs by listing `dir` and keeping sub-directories that hold a package.json.
   * ponytail: one directory level only; `**` is treated as `*`. Good enough for the extension repos.
   */
  private async expandWorkspaces(
    ref: RepositoryRef,
    globs: { include: string[]; exclude: string[] },
  ): Promise<string[]> {
    const candidates = new Set<string>();
    for (const glob of globs.include) {
      const normalized = stripTrailingSlashes(glob).replaceAll('**', '*');
      if (!normalized.includes('*')) {
        candidates.add(normalized);
        continue;
      }
      const directory = stripTrailingSlashes(normalized.slice(0, normalized.indexOf('*')));
      const suffix = normalized.slice(normalized.indexOf('*') + 1);
      const tree = await this.octokit.graphql<TreeResponse>(
        `query($owner: String!, $name: String!, $expression: String!) {
          repository(owner: $owner, name: $name) { object(expression: $expression) { ... on Tree { entries { name type } } } }
        }`,
        { owner: ref.owner, name: ref.name, expression: `HEAD:${directory}` },
      );
      for (const entry of tree.repository.object?.entries ?? []) {
        if (entry.type === 'tree' && entry.name.endsWith(suffix)) candidates.add(`${directory}/${entry.name}`);
      }
    }
    const excluded = new Set(globs.exclude.map(stripTrailingSlashes));
    const directories = [...candidates].filter(d => !excluded.has(d)).toSorted((a, b) => a.localeCompare(b));
    return this.keepWithPackageJson(ref, directories);
  }

  private async keepWithPackageJson(ref: RepositoryRef, directories: string[]): Promise<string[]> {
    if (directories.length === 0) return [];
    const aliases = directories.map((d, i) => `d${i}: object(expression: "HEAD:${d}/package.json") { id }`).join('\n');
    const data = await this.octokit.graphql<ExistsResponse>(
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${aliases} } }`,
      { owner: ref.owner, name: ref.name },
    );
    return directories.filter((_, i) => data.repository[`d${i}`]).map(d => `${d}/package.json`);
  }
}
