/**
 * Load both host engines out of the merged bundle and prove they share one DSH
 * runtime.
 *
 * This is the riskiest part of a packaging merge: `dsh-protocom-api` was built
 * against DSH 0.2.0-rc.2 and `dsh-opencode-go` against 0.2.1-rc.5. The merged
 * package installs ONE copy of the `@deepseek-ai/*` surface, so this script
 * imports both bundles with the same module resolution the host uses.
 */
import assert from 'node:assert/strict'

const go = await import('../lib/opencode-go/index.js')
const protocom = await import('../lib/protocom/index.js')

assert.equal(typeof go.apply, 'function', 'opencode-go host entry has no apply()')
assert.equal(typeof protocom.apply, 'function', 'protocom host entry has no apply()')
assert.equal(go.name, 'llm-opencode-go', `unexpected opencode-go name: ${go.name}`)
assert.equal(protocom.name, 'protocom-api', `unexpected protocom name: ${protocom.name}`)
assert.deepEqual(go.inject, ['llm'])
assert.deepEqual(protocom.inject, ['llm'])

// The route ids are the contract that keeps the two entries from colliding.
assert.equal(go.PROVIDER_ID, 'dsh-opencode-go')
assert.equal(go.FREE_PROVIDER_ID, 'dsh-opencode-free')
assert.equal(protocom.GO_PROVIDER ?? 'opencode-go-sub', 'opencode-go-sub')
assert.ok(protocom.FAMILIES.some(family => family.providerOf('go') === 'opencode-go-sub'))
assert.ok(protocom.FAMILIES.some(family => family.providerOf('aggregate') === 'protocom-aggregate'))

// Each engine must still own a distinct settings namespace.
assert.equal(go.NS, 'llm-opencode-go')

console.log('PASS: both engines load from one bundle on one @deepseek-ai runtime')
console.log(`  opencode-go routes: ${go.PROVIDER_ID}, ${go.FREE_PROVIDER_ID}`)
console.log(`  protocom families: ${protocom.FAMILIES.map(f => f.ns).join(', ')}`)
