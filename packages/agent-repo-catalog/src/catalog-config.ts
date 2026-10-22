import { readFile } from 'node:fs/promises';

import { injectable } from 'inversify';
import { parseFullName, type RepositoryRef } from 'techdebt-common';
import { parse } from 'yaml';

export interface CatalogDefinition {
  repositories: RepositoryRef[];
  /** `owner/name-glob`, `*` matches any run of characters */
  patterns: string[];
}

@injectable()
export class CatalogConfig {
  async load(path: string): Promise<CatalogDefinition> {
    return CatalogConfig.parse(await readFile(path, 'utf8'));
  }

  static parse(text: string): CatalogDefinition {
    const raw = (parse(text) ?? {}) as { repositories?: unknown; patterns?: unknown };
    const repositories = CatalogConfig.strings(raw.repositories, 'repositories').map(parseFullName);
    const patterns = CatalogConfig.strings(raw.patterns, 'patterns');
    for (const pattern of patterns) parseFullName(pattern);
    return { repositories, patterns };
  }

  private static strings(value: unknown, key: string): string[] {
    if (value === undefined || value === null) return []; // eslint-disable-line no-null/no-null -- yaml yields null
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
      throw new Error(`catalog.yaml: "${key}" must be a list of strings`);
    }
    return value as string[];
  }
}
