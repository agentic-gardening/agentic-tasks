import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: false } },
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts', 'src/index.ts'] },
  },
});
