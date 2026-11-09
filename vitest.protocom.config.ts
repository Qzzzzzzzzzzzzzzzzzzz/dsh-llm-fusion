import { defineConfig } from 'vitest/config'

/**
 * The Protocom half of the merged suite, ported from `dsh-protocom-api`.
 *
 * The specs live under `tests/protocom/` because the merged bundle also carries
 * the OpenCode Go engine, whose suite has its own config; keeping the two
 * include globs disjoint means each half can run alone while the package-wide
 * `vitest run` still picks both up.
 */
export default defineConfig({
  test: {
    include: ['tests/protocom/**/*.spec.{ts,tsx}'],
    // The adapter suite drives real timers (an idle watchdog, image projection)
    // and a couple of its cases assert inside a 5s bound that only holds when
    // the file runs alone. Under the full parallel suite those cases can exceed
    // it and fail while the behavior under test is fine, so the bound is raised
    // once here rather than being papered over per assertion.
    testTimeout: 20_000,
  },
})
