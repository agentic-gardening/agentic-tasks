import { readFile, writeFile } from 'node:fs/promises';

import { injectable } from 'inversify';
import type { Repository } from 'techdebt-common';

@injectable()
export class CatalogPublisher {
  /** Writes repositories.json; returns true when the content changed. */
  async publish(path: string, repositories: Repository[]): Promise<boolean> {
    const next = `${JSON.stringify(repositories, undefined, 2)}\n`;
    const previous = await readFile(path, 'utf8').catch(() => '');
    if (previous === next) return false;
    await writeFile(path, next);
    return true;
  }
}
