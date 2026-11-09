# Verification

Everything below was executed on this working copy on 2026-11-09 and is reproducible with `npm run verify`.
Raw evidence is the command output itself; nothing in this file is an estimate except where marked "not covered".

## Baseline

| Item | Value |
| --- | --- |
| Node | 24.21.0 (`^22.19.0 \|\| >=24.0.0`) |
| DSH package set | `@deepseek-ai/*` at `0.2.1-rc.5` (dev + dependencies aligned; peers `>=0.2.1-rc.5 <0.3.0-0`) |
| Host actually installed on this machine | desktop app `0.2.2-rc.1` — see "Not covered" |
| OS | Windows 11 (10.0.26100), x64 |

## Commands and results

```
npm run build     # node scripts/build.mjs
npm test          # node scripts/test.mjs  -> both vitest configs, then scripts/smoke-load.mjs
```

| Suite | Config | Result |
| --- | --- | --- |
| Protocom engine | `vitest.protocom.config.ts` | **64 files / 633 tests passed**, 0 skipped, ~12 s |
| Protocom (upstream reference) | — | 64 files / 631 tests, so +2 are the adapted `package.spec.ts` cases |
| OpenCode Go engine | `vitest.opencode-go.config.ts` | **17 files / 886 tests passed**, 0 skipped, ~26 s |
| OpenCode Go (upstream reference) | — | 17 files / 886 tests — identical |
| Cross-engine load | `scripts/smoke-load.mjs` | **PASS**: both host bundles import and expose `apply`/`name`/`inject` on one `@deepseek-ai` runtime |

Build output:

| Artifact | Size |
| --- | --- |
| `lib/opencode-go/index.js` | 2.18 MB (ESM host bundle) |
| `lib/protocom/index.js` | 211 KB (ESM host bundle) |
| `lib/client.js` | 462 KB (one CommonJS module, `window.__ModuleLoader__` id `dsh-llm-fusion`) |
| `lib/free-http-worker.js` | 1.2 KB (Bun worker for the Free channel) |

## What the ported suites cover

- `tests/opencode-go/` — route lifecycle, catalog snapshots, account pool and fallback settlement, usage/quota parsing, analytics windows and CSV export, request conversion per wire, transport (proxy/SOCKS), Free channel + Bun worker spawn with a network guard, and the four client specs under jsdom.
- `tests/protocom/` — the four provider families, discovery, balance/quota/account telemetry, key pool, retry policy, the three wire implementations (chat-completions, Responses, Anthropic Messages), the model registry and context variants, Fusion leader/coder routing, and the client sections under jsdom.
- Both suites run against the **vendored** sources (`src/engines/...`), not against the upstream checkouts.

## Additional checks performed

| Check | Result |
| --- | --- |
| Subpath exports resolve from outside the package (`import('dsh-llm-fusion/opencode-go')`) | PASS via Node self-reference |
| `cordis.patch.yml` is a group inserting two children that keep the upstream loader entry ids (`opencode-go`, `protocom-api`) | asserted by the ported `package.spec.ts` (Protocom suite) |
| Merged client bundle registers both halves' settings sections | asserted by `client-bundle.spec.ts` and `fusion-client-apply.spec.ts` under fake cordis slots |
| `files` list ships both upstream licenses referenced by `NOTICE` | checked against `package.json` |
| `npm install` resolves the manifest | blocked by registry instability on this machine (`UND_ERR_DESTROYED`); tree was materialised from the engines' verified installs instead |

## Known gaps (not covered)

1. **No real DSH boot.** There is no `dsh` CLI on this machine (only the packaged Electron app), so the bundle was never loaded by a live cordis loader with the real Web client. Evidence stops at: both host bundles load in Node against the host package set, both suites pass, and the client module is built with the same `window.__ModuleLoader__` contract upstream uses.
2. **Host version skew.** The installed app is `0.2.2-rc.1`; the verification baseline is `0.2.1-rc.5`. On the `0.2.2-rc.1` package set, 4 of the 886 OpenCode Go tests diverge, all four on host-side contracts (`cordis-plugin-loader` 1.1.0 changed `entry.fiber` to expose `ctx.fiber` / `effectiveConfig`; `settings.update()` no longer rejects invalid values synchronously). See README "已验证的宿主版本".
3. **Free channel runtime.** The Bun optional dependency is present in the local develop tree; a published install must keep optional dependencies enabled or the channel reports `MISSING_BUN_RUNTIME`.
4. **Rendering.** Client tests assert registration and state transitions with a fake slot registry, not pixels in the real settings page.

## Reproduce

```bash
npm install            # retry on registry failure; see README troubleshooting
npm run build
npm test
```

Suite selection is per engine: `npx vitest run --config vitest.protocom.config.ts` or `--config vitest.opencode-go.config.ts`.
