// @vitest-environment node
/**
 * Context labels are unambiguous.
 *
 * A model can offer 1,000,000 and 1,048,576 as separate steps, and both used
 * to render as `1M`: two identical chips with different budgets behind them,
 * which is worse than either label being long.
 */
import { describe, expect, it } from 'vitest'
import { contextLabel } from '../../src/engines/protocom/model-registry.ts'

describe('context labels (R3)', () => {
  it('never labels two different budgets the same way', () => {
    // 100,000 and 102,400 are both in this list on purpose: they are the two
    // values the integer-floor rounding `Math.round(tokens / 1024) * 1024` also
    // renders as "100K", so a list without them -- which this was -- cannot see
    // the collision the 100K branch exists to prevent, and cannot detect that
    // branch being removed either.
    const budgets = [
      100_000, 102_400, 204_800, 262_144, 409_600, 500_000,
      1_000_000, 1_024_000, 1_048_576, 1_050_000, 200_000,
    ]
    const labels = budgets.map(contextLabel)
    // The collision this guards: 1M and 1M for two different windows.
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('labels the decimal 100K rung distinctly from a 100-binary-K window', () => {
    // Haiku 5.5's cheap tier. The wire counts decimal tokens, so the rung is
    // 100,000; a 102,400 window really is 100 binary K. Marking which base is
    // which is the whole reason this pair needs a branch -- and it follows the
    // convention the million already set, where the binary figure keeps the
    // plain label and the decimal one is marked.
    expect(contextLabel(100_000)).toBe('100K (dec)')
    expect(contextLabel(102_400)).toBe('100K')
    expect(contextLabel(100_000)).not.toBe(contextLabel(102_400))
  })

  it('keeps the familiar binary label', () => {
    expect(contextLabel(204_800)).toBe('200K')
    expect(contextLabel(262_144)).toBe('256K')
    expect(contextLabel(409_600)).toBe('400K')
    expect(contextLabel(1_048_576)).toBe('1M')
  })

  it('distinguishes the decimal million', () => {
    expect(contextLabel(1_000_000)).not.toBe(contextLabel(1_048_576))
  })

  it('labels a published price boundary in the base the vendor wrote it in', () => {
    // The price cliffs are published as round DECIMAL figures ("<= 200K",
    // "> 272K"), so the rung minted from one is 200,000 / 256,000 / 272,000.
    // The binary division prints those as "195K" / "250K" / "266K", which sits
    // beside genuine 200K / 256K chips and reads as a rounding bug -- and worse,
    // hides which side of the cliff a chip is on.
    expect(contextLabel(200_000)).toBe('200K (dec)')
    expect(contextLabel(256_000)).toBe('256K (dec)')
    expect(contextLabel(272_000)).toBe('272K (dec)')
    // Each must stay distinct from the binary rung next to it.
    expect(contextLabel(200_000)).not.toBe(contextLabel(204_800))
    expect(contextLabel(256_000)).not.toBe(contextLabel(262_144))
    // 256,000 is also an exact binary multiple (250 binary K), which is exactly
    // how it used to acquire the misleading "250K". It must not regress.
    expect(contextLabel(256_000)).not.toBe('250K')
  })

  it('treats every multiple of 1000 as decimal, so no two budgets collide', () => {
    // The rule is "multiple of 1000", not a lookup table, because vendors
    // publish arbitrary decimal boundaries (128,000 on ClinePass, 1,050,000 on
    // the Go Lunas). A rung is binary exactly when it is NOT such a multiple,
    // so this sweep is what keeps the two bases separable in general.
    const decimal = [100_000, 128_000, 200_000, 256_000, 272_000, 1_000_000, 1_024_000, 1_050_000]
    const binary = [102_400, 204_800, 262_144, 409_600, 1_048_576]
    const labels = [...decimal, ...binary].map(contextLabel)
    expect(new Set(labels).size).toBe(labels.length)
    for (const tokens of decimal) expect(contextLabel(tokens)).toContain('(dec)')
    for (const tokens of binary) expect(contextLabel(tokens)).not.toContain('(dec)')
  })
})
