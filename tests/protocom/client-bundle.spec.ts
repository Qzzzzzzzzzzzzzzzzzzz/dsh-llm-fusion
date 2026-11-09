// @vitest-environment jsdom
/**
 * Throwaway verification: does the SHIPPED artifact `lib/client.js` actually
 * register the sections under real cordis? The regression tests cover `src/`,
 * but only this covers the built bundle the harness really loads
 * (module-loader factory, require wiring, bundling side effects).
 *
 * Merged-bundle adaptation: the shipped artifact is now the combined
 * `dsh-llm-fusion` client bundle, not Protocom's alone. Three things follow:
 *   - the loader id is the merged package name;
 *   - the bundle resolves `@deepseek-ai/dsh-client-ui-primitives`, whose
 *     published ESM entry imports `.module.css` files that only the harness'
 *     browser bundler can evaluate -- from Node we hand it a stub, exactly as
 *     the browser loader would hand it the registered module;
 *   - the OpenCode Go half mounts a remote namespace through `remote.$mount`,
 *     which the original stub (written for Protocom's bundle alone) did not
 *     have. A no-op is enough: the assertions below are about which settings
 *     sections register, not about that namespace's contents.
 * The Protocom-side expectations -- the inject list, the four sections and the
 * late Fusion section -- are unchanged from upstream.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'

const require_ = createRequire(import.meta.url)

class Remote extends Service<never> {
  /** The merged bundle's OpenCode Go half mounts its remote model namespace. */
  $mount = (_definition: unknown): (() => void) => () => {}
  constructor(ctx: never) { super(ctx, 'remote' as never) }
}
class Namespace extends Service<never> {
  constructor(ctx: never, ns: string) { super(ctx, `remote.${ns}` as never) }
}
class ConfigForms extends Service<never> {
  get = () => ({
    getSnapshot: () => ({ status: 'ready' as const, value: undefined, revision: 1, writable: true }),
    subscribe: () => () => {},
    mutate: async () => {},
  })
  constructor(ctx: never) { super(ctx, 'configForms' as never) }
}
class Slots extends Service<never> {
  sections: string[] = []
  constructor(ctx: never) { super(ctx, 'slots' as never) }
  inject = (_k: string, cb: () => unknown): (() => void) => { cb(); return () => {} }
  register = (o: { id: string }): (() => void) => { this.sections.push(o.id); return () => {} }
}
class Locale extends Service<never> {
  constructor(ctx: never) { super(ctx, 'locale' as never) }
  register = (): (() => void) => () => {}
  bind = () => (key: string) => key
}

/**
 * What the browser module loader supplies for the primitives package: its Node
 * entry pulls CSS modules, so from Node every component becomes an inert one.
 * Nothing here is asserted; the sections are never rendered.
 */
const primitives = new Proxy({}, { get: () => () => null })

/** Require that resolves the bundle's externals the way the harness does. */
function browserRequire(id: string): unknown {
  return id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require_(id)
}

/** Resolve the shipped client entry through the package's own export map. */
function bundleFile(): string {
  return require_.resolve('dsh-llm-fusion/client')
}

/** Load the built bundle exactly as the harness module loader does. */
function loadBundle(): { apply(ctx: never): void; inject: string[] } {
  const source = readFileSync(bundleFile(), 'utf8')
  let spec: { id: string; factory: (req: unknown) => unknown } | undefined
  ;(globalThis as unknown as { window: { __ModuleLoader__: unknown } }).window.__ModuleLoader__ = {
    load: (loaded: typeof spec) => { spec = loaded },
  }
  // The bundle is a script that registers itself; run it in this context.
  const run = new Function('require', 'window', source)
  run(browserRequire, (globalThis as unknown as { window: unknown }).window)
  if (spec === undefined) throw new Error('bundle never called __ModuleLoader__.load')
  expect(spec.id).toBe('dsh-llm-fusion')
  return spec.factory(browserRequire) as { apply(ctx: never): void; inject: string[] }
}

describe('shipped lib/client.js under real cordis', () => {
  it('registers all five sections, Fusion included', async () => {
    const bundle = loadBundle()
    // The declaration the plugin ships with must not include the Fusion-only
    // services, or a deployment lacking them would lose the provider panels.
    expect(bundle.inject).toEqual(['slots', 'locale', 'remote', 'remote.credentials', 'remote.llm', 'remote.settings'])

    const root = new Context()
    await root.plugin({ name: 'slots', apply: (ctx) => { new Slots(ctx as never) } })
    await root.plugin({ name: 'locale', apply: (ctx) => { new Locale(ctx as never) } })
    await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
    for (const ns of ['credentials', 'llm', 'settings']) {
      await root.plugin({ name: `remote.${ns}`, apply: (ctx) => { new Namespace(ctx as never, ns) } })
    }
    await root.plugin({ name: 'plugin', inject: bundle.inject as never, apply: bundle.apply as never })
    const slots = (root as never as { slots: Slots }).slots
    await Promise.resolve()
    expect(slots.sections).toEqual(['protocom-api', 'opencode-go-sub', 'commandcode', 'clinepass'])

    // The late Host handshake: namespace then settings form.
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
    for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()

    expect(slots.sections).toContain('model-fusion')
  })
})
