# Dependency update fix playbook

How dependabot PRs that break CI were fixed in three Podman Desktop extension repos, keyed by
dependency name. Mined from PR diffs, PR bodies, commit messages and the few CI logs still available.

Sources:

| alias | repo |
|---|---|
| quadlet | https://github.com/podman-desktop/extension-podman-quadlet |
| minc | https://github.com/minc-org/minc-extension |
| hummingbird | https://github.com/redhat-developer/podman-desktop-hummingbird-ext |

`quadlet#1824` means `https://github.com/podman-desktop/extension-podman-quadlet/pull/1824`.
Commit SHAs (minc) are on `main`, pushed directly with no PR.

---

## 1. The two allowed workflows

### (B) Prep PR on `main`, then `@dependabot rebase` — default

1. Reproduce the failure locally against the bumped version.
2. Open a PR on `main` that fixes code/config **in a way that also passes with the current version**.
   Title it `chore(lint): fix new sonarjs 4.2.0 lint errors` / `chore(tsconfig): remove deprecated options for TypeScript 6`, and write `Required for #<dependabot PR>` in the body.
3. Merge it, then comment `@dependabot rebase` on the dependabot PR. It goes green and merges untouched.

Examples: quadlet#1823 → #1824/#1836 (sonarjs), quadlet#718 → #728 (vite 7), quadlet#1831 → #1830 (TS 6),
hummingbird#586 → #539 (sonarjs), hummingbird#585 → #583 (TS 6), hummingbird#580/#581 → #582 (eslint 10).

Use when: new lint rules that are fixable today, tsconfig cleanup, test rewrites, deleting an obsolete plugin.

### (C) Open one manual bump + fix PR

1. Leave the dependabot PR alone. Once the manual bump is merged, dependabot closes it itself ("is up-to-date now, so this is no longer needed").
2. Branch from `main`, bump the package **and all its peers** in every `package.json` that lists it, run `pnpm install`, fix everything, commit the lockfile last (`fix: pnpm-lock`).
3. Title: `chore(deps): update to eslint v10`, `refactor(deps): migrate inversify from v7 to v8`.

Examples: eslint 9/10 (quadlet#30, #1375), vite 6 (quadlet#29), tailwind 4 (quadlet#241), vitest 3/4 (quadlet#413, #1103),
inversify 8 (hummingbird#738), pnpm 11 (quadlet#1714, minc#547, hummingbird#627), Node 22/24 (quadlet#400, #1074).

Use when: the fix only compiles with the new version (API renames, config keys the old version rejects),
several packages must move together, or dependabot cannot update the PR ("Dependabot can't parse your pnpm-lock.yaml", minc#517/#523/#525).

Never push fix commits onto the dependabot branch (objected to in quadlet#1611). Never close a dependabot PR by hand; it closes automatically.

---

## 2. Generic triage

1. Parse package + from → to version from the PR title. If the package belongs to a group (eslint, typescript-eslint, vitest, tailwindcss, @podman-desktop), the fix must bump the whole group.
2. Check out the dependabot branch and run, in order, stopping at the first failure:
   `pnpm install --frozen-lockfile` → `pnpm lint:check` → `pnpm format:check` → `pnpm typecheck` → `pnpm test` → `pnpm build`.
   The failing step picks the section in §3.
3. Look for the same bump already merged in a sibling repo (podman-desktop, extension-bootc, quadlet, hummingbird, minc) and copy it. Nearly every non-trivial fix was a copy: hummingbird#585 ← podman-desktop#17992, hummingbird#624 ← quadlet#1711, hummingbird#580 ← podman-desktop#17795, quadlet#241 ← bootc#1238, quadlet#1831 ← podman-desktop#16876.
4. Lockfile: orphaned/duplicated entries in `pnpm-lock.yaml` are deleted by hand (quadlet#603, #955, #997, #1286, #1590, hummingbird#134, #417). A trailing `fix: pnpm-lock` commit is expected.
5. Many closed dependabot PRs needed nothing: a newer patch superseded them and merged clean (unicorn, concurrently, prettier-plugin-svelte, jsdom, globals, commitlint, lint-staged, vite 8, sonarjs 4.0). If CI is green on the superseding PR, just merge it.

---

## 3. Fix patterns by dependency

### eslint

**8 → 9** (quadlet#30, workflow C)
- Delete `.eslintrc.json`, `.eslintignore`, `packages/*/.eslintrc.json`; create flat `eslint.config.mjs`.
- Remove per-package `eslint` devDependencies; keep it at the root only.

**9 → 10** (quadlet#1375, minc `24918df6`, hummingbird#580/#581 → #582)
- Add explicit devDeps `@eslint/js ^10`, `@eslint/eslintrc ^3.3`, bump `@eslint/compat` to `^2`.
- Remove `eslint-plugin-etc` (peer `eslint@^8`, unmaintained): drop the import, `fixupPluginRules(etc)`, `'plugin:etc/recommended'` from `compat.extends`, the `etc/*` rule lines, and any `// eslint-disable-next-line etc/...` comments. Replace `etc/no-assign-mutated-array` with `'unicorn/no-array-sort': 'error'`.
- New recommended rules in v10:
  - `preserve-caught-error`: rethrow with the cause
    ```ts
    throw new Error(`cannot start quadlet: ${error.message}`, { cause: error });
    ```
    or temporarily `'preserve-caught-error': 'off'` with a TODO comment (minc).
  - `no-useless-assignment`: collapse `let x = ''; if (...) { x = a } else { x = b }` into one `const x = cond ? a : b;`. Also `return ++acc;` → `acc++; return acc;`.
- Dependabot only opened the eslint 10 PR after `eslint` + `@eslint/*` were grouped in `.github/dependabot.yml` (hummingbird#581). Add the group if missing.

### eslint-plugin-sonarjs

**4.0.3 → 4.2.x** (quadlet#1824 + #1836 → #1820, hummingbird#586 → #539, minc `24918df6`; workflow B)
- `sonarjs/prefer-specific-assertions`: `expect(x.length).toBe(n)` → `expect(x).toHaveLength(n)` in `*.spec.ts`.
- `sonarjs/slow-regex` (renamed from `super-linear-regex`): drop the old `eslint-disable` comments and rewrite lazy `.*?` to negated classes:
  ```ts
  - /<script.*?src="(.*?)".*?>/g
  + /<script[^>]*\bsrc="([^"]*)"[^>]*>/g
  ```
- `sonarjs/assertions-in-tests` + `sonarjs/no-skipped-tests` in Playwright e2e tests:
  - preferred (quadlet#1836): import `expect` from `@playwright/test` instead of the re-export in `@podman-desktop/tests-playwright` so sonar recognises it; add an `expect.poll(...)`/`toBeVisible()` to screenshot-only tests; put a comment above `test.skip(...)`.
  - rejected: renaming `playExpect` → `expect` (quadlet#1826), per-folder `rules: off` (quadlet#1833).
  - fallback (minc): `'sonarjs/assertions-in-tests': 'off'`, `'sonarjs/no-skipped-tests': 'off'`, `'sonarjs/prefer-specific-assertions': 'off'`.
- Duplicate `it(...)` titles in one file get flagged → rename the test.
- Earlier 4.1.0/4.2.0/4.2.1 PRs were superseded automatically; fix against the latest one.

### @vitest/eslint-plugin

**1.6.11 → 1.6.12 / 1.6.10 → 1.6.15** (quadlet#1342, hummingbird#203)
- `vitest/no-alias-methods` now covers `toThrowError`: replace `.toThrowError(` → `.toThrow(` (and `.rejects.toThrowError`) in all spec files. `sed` + `pnpm lint:fix`.
- `vitest/prefer-import-in-mock`: use `vi.mock(import('pkg'), …)` not `vi.mock('pkg', …)`.

### typescript-eslint

**8.27 → 8.29** (quadlet#480): `prefer-nullish-coalescing` now flags `if (!x) { x = … }` → `x ??= …;`.

### eslint-plugin-svelte

**2 → 3** (quadlet#350): `svelte/no-useless-mustaches`: `title={'x'}` → `title="x"`, `--var={'y'}` → `--var="y"`. `pnpm lint:fix` auto-fixes.

### eslint-plugin-unicorn, globals, jsdom, eslint-plugin-simple-import-sort, concurrently, commitlint, lint-staged

Every major merged with no code change in all three repos. If a PR is closed as "Superseded", merge the superseding one.

### prettier / prettier-plugin-svelte

- Unknown option after bump (prettier 3.9, quadlet#1599): remove `"svelteStrictMode": true` from `.prettierrc`.
- New formatting rules: run `pnpm format:fix`, commit the reformat (unions collapse onto one line, etc.).
- `svelte-eslint-parser ≥ 1.7` + `prettier-plugin-svelte` disagree on `;` after `{const x = $derived(y)}` (quadlet#1854): in `eslint.config.mjs`, in the `**/*.svelte` block, set `semi: 'off'` with a comment.
- prettier-plugin-svelte 4.0.x PRs were closed; 4.1.1 merged clean.

### typescript

**5.9 → 6.0** (hummingbird#585 → #583, quadlet#1831 → #1830; workflow B for tsconfig, then C/B for the bump)
- `pnpm typecheck` fails with TS5107 / TS5101 (deprecated options). In every `tsconfig.json`:
  ```json
  - "moduleResolution": "Node",        // or "node"
  + "moduleResolution": "bundler",
  ```
  and delete `"baseUrl": "."` and `"preserveValueImports"`.
- Bump `typescript` in **every** package.json that lists it (root, backend, shared, podlet-js, tests/playwright).
- `bundler` resolution breaks `inversify` 7 (`TS2307 Cannot find module 'inversify'`): see inversify.
- `tsc` does not typecheck `.svelte`; frontend typecheck should be only `cd packages/frontend && pnpm check` (quadlet#1104, #718).

**→ 7.x**: dependabot closes it as "no longer updatable". Target 6.x first (quadlet#1829, hummingbird#522).

### vite

- **5 → 6** (quadlet#29, C): bump `@sveltejs/vite-plugin-svelte` 3 → 5 in the same PR, delete `packages/frontend/svelte.config.js` (svelte-preprocess/postcss), add alias `{ find: /^monaco-editor$/, replacement: '<root>/node_modules/monaco-editor/esm/vs/editor/editor.api' }` in `vite.config`.
- **6 → 7** (quadlet#718 → #728, B): only failure was `svelte-check` run from repo root with the root tsconfig. Run it from `packages/frontend`.
- **7 → 8**, `@sveltejs/vite-plugin-svelte` 6 → 7, `vite-plugin-dts` 5, `unplugin-dts` 1: merged clean everywhere.

### vitest (+ @vitest/coverage-v8, always bumped together)

- **2 → 3** (quadlet#407 prep, #413 bump): `vitest.workspace.ts` → `vitest.config.ts` (projects), remove deprecated `deps: { inline: [] }`, narrow `include` to `src/**/*.{test,spec}.?(c|m)[jt]s?(x)`, add `'**/html/'` to eslint ignores. Scripts: `vitest run --project frontend` instead of `cd packages/frontend && vitest run`.
- **3 → 4** (quadlet#1072 issue; preps #1073, #1092–#1101, #1104; bump #1103):
  - per package `vitest.config.ts`: `defineProject({...})` → `mergeConfig(viteConfig, {...})`, drop duplicated aliases.
  - Constructor mocks must be real classes. `vi.mocked(Ctor).mockReturnValue(obj)` no longer works. Either mock the prototype:
    ```ts
    vi.mocked(SftpClient.prototype.end).mockResolvedValue(false);
    expect(SftpClient.prototype.connect).toHaveBeenCalledOnce();
    ```
    or use a class factory and read `.mock.instances[0]`:
    ```ts
    vi.mock(import('@podman-desktop/api'), () => ({
      CancellationTokenSource: vi.fn(class { token = {...}; cancel = vi.fn(); dispose = vi.fn(); }),
    }));
    const instance = vi.mocked(CancellationTokenSource).mock.instances[0];
    ```
  - Remove `@vitest/coverage-v8` from sub-packages, keep it at the root.
- **4 / 5 with inversify decorators** (minc `d407101d`): `TypeError: decorator is not a function` from `Reflect.decorate`. Stop `vi.mock(import('inversify'))` automocking; test with a real `Container`. In `vitest.config`:
  ```js
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: false } },
  ```
  Coverage drops after the switch → delete unreachable guards (`if (index > -1)` before `splice`) or add tests.
- Dependabot group `vitest` = `vitest`, `@vitest/*` (quadlet#1394, hummingbird#279); otherwise peers drift and the PR never opens.
- `@testing-library/svelte` alias to `/svelte5` and the monaco alias became unnecessary with vitest 4.1 (quadlet#1389).

### svelte / svelte-select / @sveltejs/kit

- **svelte-select 5 → 6** (Svelte 5 runes rewrite; quadlet#1711, hummingbird#624):
  - `<script lang="ts">` + `type T = $$Generic<…>` → `<script lang="ts" generics="T extends { label: string; value: string }">`
  - `export let value` → `let { value = $bindable(), ...rest }: Props = $props();`
  - `on:change={e => e.detail}` / `on:clear` → `onchange={item => …}` / `onclear`
  - `<div slot="item" let:item>…</div>` → `{#snippet item({ item })}…{/snippet}`; pass as `item={(itemSnippet ?? item) as Snippet<…>}`.
  - Apply the same `slot → snippet` change in every consumer (`ContainersSelect.svelte`, `ImagesSelect.svelte`, `PodsSelect.svelte`, `ContainerProviderConnectionSelect.svelte`).
- **svelte patch bump** touching `window` at module load (hummingbird#81): wrap `acquirePodmanDesktopApi()` / `new RpcBrowser(window, …)` in `if (browser)` from `$app/environment`, export the variables afterwards.
- **svelte 5.26.2** (quadlet#493) was closed for an upstream bug; wait for the next patch.
- **@sveltejs/kit 3 / adapter-static 4**: open, no fix known yet.

### tailwindcss 3 → 4 (quadlet#241 ← bootc#1238, C)

- Add `@tailwindcss/vite` and put `tailwindcss()` first in `vite.config` `plugins`.
- Remove `postcss`, `postcss-load-config`, `packages/frontend/postcss.config.cjs`.
- `app.css`: `@tailwind base; @tailwind components; @tailwind utilities;` → `@import 'tailwindcss'; @config '../tailwind.config.cjs';`
- Class renames: `shadow` → `shadow-sm`.
- Group `tailwindcss` + `@tailwindcss/*` in dependabot.

### @podman-desktop/api, ui-svelte, podman-extension-api, tests-playwright

- Bump `@podman-desktop/*` as one group (quadlet#1591).
- **ui-svelte 1.27+** (quadlet#1642): colours moved to CSS vars. Replace the custom `colors: {charcoal, gray, purple…}` palette in `tailwind.config.cjs` with `colors: {}`; `class:bg-[var(--pd-x)]={cond}` → `class={[..., { 'bg-(--pd-x)': cond }]}`; update spec assertions on class names.
- **tests-playwright 1.27** (quadlet#1390): `runner.getElectronApp().windows()` → `runner.getWindows()`.
- Stop tracking `next` nightlies: pin `"@podman-desktop/tests-playwright": "^1.29.0"` and delete the `pnpm add -D @podman-desktop/tests-playwright@next` step in `pr-check.yaml`/`e2e-main.yaml` (minc#548, `973048d1`). pnpm 11 `minimumReleaseAge` (24 h default) makes nightlies fail anyway.
- Typed mock `__mocks__/@podman-desktop/api.ts` (hummingbird#193) replaces the empty CJS stub when api types change.

### inversify 7 → 8 (hummingbird#738, minc `5bb6e0d4`; C)

- `container.load(...)` → `await container.loadAsync(...)`, `container.unbindAll()` → `await container.unbindAllAsync()` in `inversify-binding.ts` and `*module.spec.ts`.
- v8 is stricter on generics: `bind<GrypeService>(AlternativeService)` → `bind<AlternativeService>(AlternativeService)`.
- Requires `"moduleResolution": "bundler"`; v7 has no `types` export condition so `bundler` gives TS2307 (`Cannot find module 'inversify'`), and `TS2347 Untyped function calls may not accept type arguments`. Do TypeScript 6 and inversify 8 together or inversify first.

### @biomejs/biome 1 → 2 (minc `7ea1917c`)

```jsonc
- "files": { "ignore": ["**/coverage/**", "**/dist/**"] }
+ "files": { "includes": ["**", "!**/coverage/**", "!**/dist/**", "!**/output/**"] }
- "organizeImports": { "enabled": false }
+ "assist": { "actions": { "source": { "organizeImports": "off" } } }
```

### monaco-editor

- **0.54 → 0.55** (quadlet#1125 → #1015): add explicit `.js` extensions to deep `monaco-editor/esm/...` imports in `monaco.ts`, `MonacoEditor.svelte`, specs.
- **0.55 → 0.57** (quadlet#1827): worker `monaco-editor/esm/vs/editor/editor.worker?worker` → `monaco-editor/editor/editor.worker?worker`; `monaco-editor/esm/vs/editor/editor.api.js` → `monaco-editor`; delete dynamic `ini`/`yaml` `*.contribution.js` imports and their `vi.mock`s.
- **0.53** (quadlet#873) closed for an upstream bug (microsoft/monaco-editor#4981).

### @types/node

- Never bump the major beyond the Node version used in CI/`engines`. Comment `@dependabot ignore this major version` (quadlet#23/#662/#1052/#1571, minc#123/#533) or revert (hummingbird#29). Dependabot closes the PR itself after the comment.
- Bump it inside the Node upgrade PR: `.github/workflows/*.yaml` `node-version`, `engines.node`, `Containerfile`, `@types/node` (quadlet#400 Node 22 + electron 35, quadlet#1074 Node 24, minc#298).
- Node 22.18 type stripping breaks Playwright → `NODE_OPTIONS=--no-experimental-strip-types` in `pr-check.yaml` (quadlet#810).

### electron

Bump with the Node major (quadlet#400 "upgrade electron to v35"); 36+ merged clean.

### pnpm (manual only, dependabot does not touch `packageManager`)

- **10 → 11** (quadlet#1714, minc#547/#548, hummingbird#627): `pnpx codemod run pnpm-v10-to-v11`, then:
  - `.npmrc` `node-linker=hoisted` → `pnpm-workspace.yaml` `nodeLinker: hoisted`
  - `package.json` `pnpm.overrides` → `pnpm-workspace.yaml` `overrides:`
  - `onlyBuiltDependencies: [esbuild]` → `allowBuilds: { esbuild: true, unrs-resolver: true, '@biomejs/biome': true }`
  - `packageManager: pnpm@11.x+sha512…`; Containerfiles `npm install --global pnpm@11`, `COPY pnpm-workspace.yaml`, `CI=true pnpm --frozen-lockfile install`
  - `pnpm why --json` output shape changed: `jq '.[0].devDependencies."@podman-desktop/api".version'` → `jq '.[0].version'` (quadlet e2e.yaml)
  - `minimumReleaseAge` defaults to 1440 min: any `@next` install from the last 24 h fails.
- **11 → 12** (quadlet n/a, minc `359a5836`, hummingbird#734): `packageManager` + regenerate lockfile (expect a ~150-line diff for cyclic peers).

### Security advisories (GHSA / CVE) on transitive deps

- Add an override, verify with `pnpm audit`, regenerate lockfile:
  - pnpm ≤ 10: `package.json` → `"pnpm": { "overrides": { "minimatch@<3.1.3": "3.1.3" } }`
  - pnpm ≥ 11: `pnpm-workspace.yaml` → `overrides: { 'js-yaml@^4': ^4.3.2, 'brace-expansion@^2': ^2.0.2 }` (one line per major)
- Remove the override once the parent ships the fix (`concurrently>shell-quote` added hummingbird#403, removed #418 after concurrently 10.0.1).
- Or remove the plugin that pulls it: `eslint-plugin-redundant-undefined` → `braces` GHSA-vfj7-8cjw-p6xm; the rule is covered by `sonarjs/no-redundant-optional` (hummingbird#707, minc#573).

---

## 4. Appendix

### Dependabot groups used across the repos

```yaml
# .github/dependabot.yml
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: daily }
    groups:
      eslint:            { patterns: ["eslint", "@eslint/*"] }
      typescript-eslint: { patterns: ["@typescript-eslint/*", "typescript-eslint"] }
      vitest:            { patterns: ["vitest", "@vitest/*"] }
      tailwindcss:       { patterns: ["tailwindcss", "@tailwindcss/*"] }
      podman-desktop:    { patterns: ["@podman-desktop/*"] }
      commitlint:        { patterns: ["@commitlint/*"] }
```

### Index: dependency → fix references

| dependency | quadlet | minc | hummingbird |
|---|---|---|---|
| eslint 8→9 | #30 | | |
| eslint 9→10 | #1375 | `24918df6` | #580, #581 → #582 |
| eslint-plugin-sonarjs 4.2 | #1824, #1836 → #1820 | `24918df6` | #586 → #539 |
| @vitest/eslint-plugin | #1342 → #1331 | | #203 |
| typescript-eslint | #480 → #477 | | |
| eslint-plugin-svelte 3 | #350 | | |
| prettier | #1599, #1854 | | |
| typescript 6 | #1831 → #1830 | | #585 → #583 |
| vite 6 / 7 | #29 / #718 → #728 | | |
| vitest 3 / 4 / 5 | #413 / #1073–#1103 | `d407101d` | |
| svelte-select 6 | #1711 → #1710 | | #624 → #618 |
| svelte (window guard) | | | #81 |
| tailwindcss 4 | #241 | | |
| @podman-desktop/* | #1642, #1390 | `973048d1`, #548 | #193 |
| inversify 8 | | `5bb6e0d4` | #738 |
| @biomejs/biome 2 | | `7ea1917c` | |
| monaco-editor | #1125, #1827 | | |
| Node / @types/node | #400, #1074, #810 | #298 | #29 |
| pnpm 11 / 12 | #1714 | #547, #548 / `359a5836` | #627 / #734 |
| security overrides | | #406…#575 | #403 → #418, #707 |
