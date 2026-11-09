// @vitest-environment node
/**
 * No debug output in the shipped client.
 *
 * The browser half is served to the settings page as one bundle, so anything
 * it prints lands in an operator's console. A leftover `console.warn` of the
 * committed settings section does exactly that: the group apiKeys array is the
 * credential-REFERENCE list, so it discloses which credentials exist and where
 * they are pointed even though no key value rides along.
 *
 * This scans the SOURCE, so it fails at the point of the mistake rather than
 * after a build someone might forget to run.
 *
 * Merged-bundle note: the sources moved from `src/` to `src/engines/protocom/`,
 * and `src/engines/opencode-go/` belongs to the other half's suite. The scan is
 * therefore rooted at this half's tree (resolved from this file, not from the
 * process cwd) instead of spanning the whole merged `src/`, so a failure here
 * names a Protocom file rather than the other engine's.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** This half's vendor tree: `<root>/src/engines/protocom`. */
const SOURCES = fileURLToPath(new URL('../../src/engines/protocom', import.meta.url))

/** Every .ts/.tsx under one directory, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sources(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('client bundle hygiene (R3)', () => {
  it('prints nothing to the console from src/client', () => {
    const offenders = sources(join(SOURCES, 'client')).filter(file => /console\.(log|warn|error|info|debug)\s*\(/.test(readFileSync(file, 'utf8')))
    // The Host half may log through ctx.logger; the browser half has no
    // logger and must stay silent, because its output is public to the page.
    expect(offenders).toEqual([])
  })

  it('carries no debug flag or scratch marker', () => {
    const markers = /__DBG__|__DEBUG__|__CTX_DEBUG__|TODO: remove|XXX/
    const offenders = sources(SOURCES).filter(file => markers.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
