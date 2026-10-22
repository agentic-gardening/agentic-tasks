import type { Octokit } from '@octokit/rest';
import { Container } from 'inversify';
import { commonModule, OctokitBuilder, OctokitNames } from 'techdebt-common';

import { EpicStateUpdater } from './epic-state-updater';
import { BOT_TOKEN, DEPENDABOT_REBASE_OCTOKIT, FixFinisher } from './fix-finisher';
import { BOT_LOGIN, FixPlanner } from './fix-planner';

export interface FixerOptions {
  tasksToken: string;
  botToken: string;
  botLogin: string;
  /** token used to comment `@dependabot rebase`; the bot token unless PODMAN_DESKTOP_BOT_TOKEN overrides it */
  dependabotRebaseToken?: string;
}

export class InversifyBinding {
  constructor(private readonly options: FixerOptions) {}

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
    if (this.options.dependabotRebaseToken) {
      container
        .bind<Octokit>('Octokit')
        .toConstantValue(builder.build(this.options.dependabotRebaseToken))
        .whenNamed(DEPENDABOT_REBASE_OCTOKIT);
    }
    container.bind<string>(BOT_TOKEN).toConstantValue(this.options.botToken);
    container.bind<string>(BOT_LOGIN).toConstantValue(this.options.botLogin);
    container.bind(FixPlanner).toSelf().inSingletonScope();
    container.bind(FixFinisher).toSelf().inSingletonScope();
    container.bind(EpicStateUpdater).toSelf().inSingletonScope();
    return container;
  }
}

export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): FixerOptions {
  const tasksToken = env.TASKS_TOKEN;
  const botToken = env.BOT_TOKEN;
  if (!tasksToken || !botToken) throw new Error('TASKS_TOKEN and BOT_TOKEN are required');
  return {
    tasksToken,
    botToken,
    botLogin: env.BOT_LOGIN ?? 'podman-desktop-bot',
    dependabotRebaseToken: env.PODMAN_DESKTOP_BOT_TOKEN || botToken,
  };
}

export function argValue(flag: string, argv: readonly string[] = process.argv): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}
