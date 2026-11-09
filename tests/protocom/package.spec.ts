// @vitest-environment node
/**
 * Build artifact consistency for the MERGED bundle.
 *
 * Upstream this file checked `dsh-protocom-api`: it matched the tsdown client
 * banner against `package.json#name` and asserted the published file set. The
 * merged package is `dsh-llm-fusion`: it builds through `scripts/build.mjs`
 * instead of tsdown, ships both engines' host entries under one `lib/` tree,
 * and mounts them as a single loader group. The assertions below are the same
 * invariants expressed against that manifest; nothing was dropped.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const root = new URL('../../', import.meta.url)
const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8')
const exists = (relative: string): boolean => {
  try {
    readFileSync(fileURLToPath(new URL(relative, root)))
    return true
  } catch {
    return false
  }
}

describe('build artifact consistency (P2-5)', () => {
  it('the client banner id matches the package name', () => {
    const pkg = JSON.parse(read('package.json')) as { name: string }
    // Same invariant as upstream, read from the artifact that actually ships
    // rather than from a bundler config: the id the client bundle hands to
    // window.__ModuleLoader__ is the id the harness keys the plugin on.
    const banner = /__ModuleLoader__\.load\(\{\s*id:\s*"([^"]+)"/.exec(read('lib/client.js'))
    expect(banner?.[1]).toBe(pkg.name)
  })

  it('the published file set excludes sourcemaps and source', () => {
    const pkg = JSON.parse(read('package.json')) as { files: string[] }
    expect(pkg.files.some(entry => entry.includes('.map'))).toBe(false)
    expect(pkg.files.some(entry => entry.startsWith('src/'))).toBe(false)
    // The merged package publishes the whole build output tree (both engines
    // plus the client bundle) and the loader patch that mounts them together.
    expect(pkg.files).toContain('lib')
    expect(pkg.files).toContain('cordis.patch.yml')
  })

  it('exposes both engine halves and the client bundle as exports', () => {
    const pkg = JSON.parse(read('package.json')) as {
      exports: Record<string, string | { types?: string; default: string }>
      dsh: { bundle: { patch: string }; client: { platform: string; inject: string[] } }
    }
    // The Protocom half keeps its own subpath: a profile that only wants
    // Protocom/Command Code/ClinePass can still mount just that entry, and the
    // merged root export stays the OpenCode Go half (package.json#main).
    const defaultOf = (specifier: string): string => {
      const entry = pkg.exports[specifier]
      if (entry === undefined) throw new Error(`package.json exports is missing ${specifier}`)
      return typeof entry === 'string' ? entry : entry.default
    }
    expect(defaultOf('./protocom')).toBe('./lib/protocom/index.js')
    expect(defaultOf('./opencode-go')).toBe('./lib/opencode-go/index.js')
    expect(defaultOf('./client')).toBe('./lib/client.js')
    expect(defaultOf('./package.json')).toBe('./package.json')
    // Every declared entry point must be a file that is really there.
    for (const specifier of Object.keys(pkg.exports)) {
      const target = defaultOf(specifier)
      expect(exists(target), `${specifier} -> ${target}`).toBe(true)
    }
    // Type declarations are optional in this manifest, but when one is
    // declared it has to point into the published `lib/types` tree.
    for (const [specifier, entry] of Object.entries(pkg.exports)) {
      if (typeof entry === 'string' || entry.types === undefined) continue
      expect(entry.types.startsWith('./lib/types/'), `${specifier} -> ${entry.types}`).toBe(true)
    }
    expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(pkg.dsh.client.platform).toBe('web')
  })

  it('mounts both engines as one loader group and keeps their entry ids', () => {
    const patch = parseYaml(read('cordis.patch.yml')) as [{
      insert: [{
        id: string
        name: string
        group: boolean
        config: { id: string; name: string }[]
      }]
    }]
    expect(patch).toHaveLength(1)
    const [entry] = patch[0].insert
    expect(entry.group).toBe(true)
    expect(entry.name).toBe('@deepseek-ai/cordis-plugin-group')
    expect(entry.config).toEqual([
      { id: 'opencode-go', name: 'dsh-llm-fusion/opencode-go' },
      { id: 'protocom-api', name: 'dsh-llm-fusion/protocom' },
    ])
    // The group id is the merged package, so two installs of the two original
    // plugins cannot collide with one install of the merged bundle.
    expect(entry.id).toBe('llm-fusion')
  })
})
