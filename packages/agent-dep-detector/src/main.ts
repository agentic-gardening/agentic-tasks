import { inject, injectable } from 'inversify';
import { CatalogClient, fullName, StateBranch } from 'techdebt-common';

import { DependabotService } from './dependabot-service';
import { type ManifestCache, ManifestService } from './manifest-service';
import { type Finding, OutdatedDecider } from './outdated-decider';
import { type RegistryCache, RegistryService } from './registry-service';
import { type IssueCache, TicketService } from './ticket-service';

export const DRY_RUN = Symbol.for('agent-dep-detector.dry-run');

@injectable()
export class DetectorMain {
  constructor(
    @inject(CatalogClient) private readonly catalog: CatalogClient,
    @inject(StateBranch) private readonly state: StateBranch,
    @inject(ManifestService) private readonly manifests: ManifestService,
    @inject(RegistryService) private readonly registry: RegistryService,
    @inject(DependabotService) private readonly dependabot: DependabotService,
    @inject(OutdatedDecider) private readonly decider: OutdatedDecider,
    @inject(TicketService) private readonly tickets: TicketService,
    @inject(DRY_RUN) private readonly dryRun: boolean,
  ) {}

  async run(): Promise<Finding[]> {
    const repositories = await this.catalog.fetch();
    console.log(`catalog: ${repositories.length} repositories`);

    const manifestCache = await this.state.read<ManifestCache>('manifests.json', {});
    const manifests = await this.manifests.collect(repositories, manifestCache);

    const packages = new Set<string>();
    for (const manifest of Object.values(manifests)) {
      for (const [name] of OutdatedDecider.declared(manifest)) packages.add(name);
    }
    const registryCache = await this.state.read<RegistryCache>('registry.json', {});
    const registry = await this.registry.refresh(packages, registryCache);
    console.log(`registry: ${packages.size} packages`);

    const pullRequests = await this.dependabot.openPullRequests(repositories);
    console.log(`dependabot: ${pullRequests.length} open PRs`);

    const findings = repositories.flatMap(repository =>
      this.decider.decide(fullName(repository), manifests[fullName(repository)], registry, pullRequests),
    );
    for (const f of findings) console.log(`! ${f.repository}: ${f.package} ${f.current} -> ${f.target} (${f.reason})`);

    const issueCache = await this.state.read<IssueCache>('issues.json', {});
    const report = await this.tickets.apply(findings, issueCache, manifests, this.dryRun);
    console.log(
      `${this.dryRun ? '[dry-run] ' : ''}epics +${report.epicsCreated.length}, tasks +${report.tasksCreated.length}, closed ${report.tasksClosed.length}`,
    );
    for (const e of report.epicsCreated) console.log(`  epic  ${e}`);
    for (const t of report.tasksCreated) console.log(`  task  ${t}`);
    for (const c of report.tasksClosed) console.log(`  close ${c}`);

    if (!this.dryRun) {
      await this.state.write('manifests.json', manifests);
      await this.state.write('registry.json', registry);
      await this.state.write('issues.json', issueCache);
      await this.state.commitAndPush('chore: detector state');
    }
    return findings;
  }
}
