import type { Octokit } from '@octokit/rest';
import { Container } from 'inversify';
import { commonModule, OctokitBuilder, OctokitNames } from 'techdebt-common';

import { BOT_LOGIN, MonitorMain } from './main';
import { OutcomeClassifier } from './outcome-classifier';
import { PrInspector } from './pr-inspector';
import { BOT_TOKEN, RebaseService } from './rebase-service';

export interface MonitorOptions {
  tasksToken: string;
  botToken: string;
  botLogin: string;
}

export class InversifyBinding {
  constructor(private readonly options: MonitorOptions) {}

  async initBindings(): Promise<Container> {
    const container = new Container();
    await container.load(commonModule);
    const builder = container.get(OctokitBuilder);

    container
      .bind<Octokit>('Octokit')
      .toConstantValue(builder.build(this.options.tasksToken))
      .whenNamed(OctokitNames.TASKS);
    container
      .bind<Octokit>('Octokit')
      .toConstantValue(builder.build(this.options.botToken))
      .whenNamed(OctokitNames.BOT);
    container.bind<string>(BOT_TOKEN).toConstantValue(this.options.botToken);
    container.bind<string>(BOT_LOGIN).toConstantValue(this.options.botLogin);

    container.bind(PrInspector).toSelf().inSingletonScope();
    container.bind(OutcomeClassifier).toSelf().inSingletonScope();
    container.bind(RebaseService).toSelf().inSingletonScope();
    container.bind(MonitorMain).toSelf().inSingletonScope();
    return container;
  }
}
