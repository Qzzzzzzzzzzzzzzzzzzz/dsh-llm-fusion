/**
 * Run every suite the bundle ships, then the cross-engine load check.
 *
 * The two engines keep their own vitest configuration and test trees (they were
 * written independently and share no fixtures); the merged package only adds
 * the smoke check that both host bundles load on one `@deepseek-ai` runtime.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const virtualNode = process.execPath
const suites = [
  { name: 'protocom', config: 'vitest.protocom.config.ts' },
  { name: 'opencode-go', config: 'vitest.opencode-go.config.ts' },
]

let failed = false
for (const suite of suites) {
  if (!existsSync(suite.config)) {
    console.error(`missing ${suite.config}; the ${suite.name} suite is not ported yet`)
    failed = true
    continue
  }
  console.log(`\n=== ${suite.name} ===`)
  const run = spawnSync(virtualNode, ['node_modules/vitest/vitest.mjs', 'run', '--config', suite.config], {
    stdio: 'inherit',
    shell: false,
  })
  if (run.status !== 0) failed = true
}

console.log('\n=== cross-engine load ===')
const smoke = spawnSync(virtualNode, ['scripts/smoke-load.mjs'], { stdio: 'inherit', shell: false })
if (smoke.status !== 0) failed = true

process.exit(failed ? 1 : 0)
