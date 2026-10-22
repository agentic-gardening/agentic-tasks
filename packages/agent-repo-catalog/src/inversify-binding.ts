import type { Octokit } from '@octokit/rest';
import { Container } from 'inversify';
import { commonModule, OctokitBuilder, OctokitNames } from 'techdebt-common';

import { CatalogConfig } from './catalog-config';
import { CatalogPublisher } from './catalog-publisher';
import { CatalogMain } from './main';
import { RepositoryDiscovery } from './repository-discovery';
import { BOT_TOKEN_PRESENT, RepositoryInspector } from './repository-inspector';

export class InversifyBinding {
  constructor(
    private readonly githubToken: string,
    private readonly botToken: string | undefined,
  ) {}

  async initBindings(): Promise<Container> {
    const container = new Container();
    await container.load(commonModule);

    const octokit: Octokit = container.get(OctokitBuilder).build(this.botToken ?? this.githubToken);
    container.bind<Octokit>('Octokit').toConstantValue(octokit).whenNamed(OctokitNames.READ);
    container.bind<boolean>(BOT_TOKEN_PRESENT).toConstantValue(this.botToken !== undefined);

    container.bind(CatalogConfig).toSelf().inSingletonScope();
    container.bind(RepositoryDiscovery).toSelf().inSingletonScope();
    container.bind(RepositoryInspector).toSelf().inSingletonScope();
    container.bind(CatalogPublisher).toSelf().inSingletonScope();
    container.bind(CatalogMain).toSelf().inSingletonScope();
    return container;
  }
}
