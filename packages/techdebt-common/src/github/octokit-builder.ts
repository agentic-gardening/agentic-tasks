import { Octokit } from '@octokit/rest';
import { injectable } from 'inversify';

// 2022-11-28 (Octokit's default) ends support on 2028-03-10
export const API_VERSION = '2026-03-10';

@injectable()
export class OctokitBuilder {
  build(token: string): Octokit {
    const octokit = new Octokit({ auth: token, userAgent: 'agentic-gardening-techdebt' });
    octokit.hook.before('request', options => {
      options.headers['x-github-api-version'] = API_VERSION;
    });
    return octokit;
  }
}
