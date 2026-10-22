import { expect, test } from 'vitest';

import { parseTriageComment } from './triage-comment';

test('parses the structured triage comment including the notes block', () => {
  const body = `<!-- triage -->
strategy: C                 # B | C | none
failing_step: lint:check
playbook_section: eslint-plugin-sonarjs
files: [eslint.config.mjs, "**/*.spec.ts"]
risk: low
confidence: 0.8
dependabot_pr: https://github.com/o/r/pull/9
notes: |
  prefer-specific-assertions in specs
  slow-regex in webview-service.ts
`;
  expect(parseTriageComment(body)).toStrictEqual({
    strategy: 'C',
    failing_step: 'lint:check',
    playbook_section: 'eslint-plugin-sonarjs',
    files: '[eslint.config.mjs, "**/*.spec.ts"]',
    risk: 'low',
    confidence: 0.8,
    dependabot_pr: 'https://github.com/o/r/pull/9',
    notes: 'prefer-specific-assertions in specs\nslow-regex in webview-service.ts',
  });
});

test('unknown strategy becomes none; missing marker returns undefined', () => {
  expect(parseTriageComment('<!-- triage -->\nstrategy: maybe\nconfidence: n/a\n')).toMatchObject({
    strategy: 'none',
    confidence: undefined,
  });
  expect(parseTriageComment('hello')).toBeUndefined();
});
