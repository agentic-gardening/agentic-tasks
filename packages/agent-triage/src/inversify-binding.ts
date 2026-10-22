import type { Octokit } from '@octokit/rest';
import { Container } from 'inversify';
import { commonModule, OctokitBuilder, OctokitNames } from 'techdebt-common';

import { ContextBuilder } from './context-builder';

export class InversifyBinding {
  constructor(private readonly tasksToken: string) {}

  async initBindings(): Promise<Container> {
    const container = new Container();
    await container.load(commonModule);
    const octokit = container.get(OctokitBuilder).build(this.tasksToken);
    container.bind<Octokit>('Octokit').toConstantValue(octokit).whenNamed(OctokitNames.TASKS);
    container.bind(ContextBuilder).toSelf().inSingletonScope();
    return container;
  }
}
