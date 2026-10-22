import { inject, injectable, optional } from 'inversify';

/** One entry of repositories.json published by agent-repo-catalog. */
export interface Repository {
  owner: string;
  name: string;
  default_branch: string;
  head: string;
  package_json_paths: string[];
  bot_has_write: boolean;
}

export const CATALOG_URL = Symbol.for('techdebt.catalog-url');
export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/agentic-gardening/agent-repo-catalog/main/repositories.json';

@injectable()
export class CatalogClient {
  constructor(@inject(CATALOG_URL) @optional() private readonly url: string = DEFAULT_CATALOG_URL) {}

  async fetch(): Promise<Repository[]> {
    const response = await globalThis.fetch(this.url, { headers: { 'cache-control': 'no-cache' } });
    if (!response.ok) {
      throw new Error(`cannot fetch catalog ${this.url}: HTTP ${response.status}`);
    }
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error(`catalog ${this.url} is not a JSON array`);
    }
    return data as Repository[];
  }
}
