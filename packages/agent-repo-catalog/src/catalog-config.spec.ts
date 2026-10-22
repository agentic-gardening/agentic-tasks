import { describe, expect, test } from 'vitest';

import { CatalogConfig } from './catalog-config';

describe('CatalogConfig.parse', () => {
  test('reads repositories and ignores commented lines', () => {
    const text = `repositories:
  - agentic-gardening/techdebt-common
  # - minc-org/minc-extension
# patterns:
#   - podman-desktop/extension-*
`;
    expect(CatalogConfig.parse(text)).toStrictEqual({
      repositories: [{ owner: 'agentic-gardening', name: 'techdebt-common' }],
      patterns: [],
    });
  });

  test('reads patterns', () => {
    const text = 'repositories: []\npatterns:\n  - podman-desktop/extension-*\n';
    expect(CatalogConfig.parse(text).patterns).toStrictEqual(['podman-desktop/extension-*']);
  });

  test('rejects malformed entries', () => {
    expect(() => CatalogConfig.parse('repositories:\n  - nope\n')).toThrow('invalid repository "nope"');
    expect(() => CatalogConfig.parse('repositories: 42\n')).toThrow('must be a list of strings');
  });

  test('empty file is an empty catalog', () => {
    expect(CatalogConfig.parse('')).toStrictEqual({ repositories: [], patterns: [] });
  });
});
