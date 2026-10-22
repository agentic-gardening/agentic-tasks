import { builtinModules } from 'node:module';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: false } },
  build: {
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    ssr: true,
    rolldownOptions: {
      input: { entrypoint: 'src/entrypoint.ts' },
      output: { entryFileNames: '[name].js', format: 'es' },
      external: [...builtinModules, ...builtinModules.map(m => `node:${m}`)],
    },
  },
  ssr: { noExternal: ['techdebt-common'] },
  test: {
    include: ['src/**/*.spec.ts'],
    server: { deps: { inline: ['techdebt-common'] } },
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts', 'src/entrypoint.ts'] },
  },
});
