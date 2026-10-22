import { inject, injectable } from 'inversify';
import { fullName, type Repository } from 'techdebt-common';

import { CatalogConfig } from './catalog-config';
import { CatalogPublisher } from './catalog-publisher';
import { RepositoryDiscovery } from './repository-discovery';
import { RepositoryInspector } from './repository-inspector';

@injectable()
export class CatalogMain {
  constructor(
    @inject(CatalogConfig) private readonly config: CatalogConfig,
    @inject(RepositoryDiscovery) private readonly discovery: RepositoryDiscovery,
    @inject(RepositoryInspector) private readonly inspector: RepositoryInspector,
    @inject(CatalogPublisher) private readonly publisher: CatalogPublisher,
  ) {}

  async run(configPath = 'catalog.yaml', outputPath = 'repositories.json'): Promise<Repository[]> {
    const definition = await this.config.load(configPath);
    const refs = await this.discovery.discover(definition);
    const repositories: Repository[] = [];
    for (const ref of refs) {
      const repository = await this.inspector.inspect(ref);
      if (repository) {
        repositories.push(repository);
        console.log(`+ ${fullName(ref)} (${repository.package_json_paths.length} package.json)`);
      } else {
        console.log(`- ${fullName(ref)} skipped (archived, missing, or not pnpm)`);
      }
    }
    const changed = await this.publisher.publish(outputPath, repositories);
    console.log(`${repositories.length} repositories, ${changed ? 'updated' : 'unchanged'} ${outputPath}`);
    return repositories;
  }
}
