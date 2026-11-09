// @vitest-environment node
/**
 * Matching a model's budgets against a group's ladder.
 *
 * Providers publish the same capacity in two bases: 200K is 204800 binary or
 * 200000 decimal, 1M is 1048576 or 1000000. The match was by exact integer, so
 * a model declaring 1,000,000 could never match a 1,048,576 rung and its own
 * window was dropped -- it was offered only the rungs below it. Every OpenCode
 * Go model with a decimal window was capped at 400K while the binary ones, such
 * as Kimi K3 at 1,048,576, kept their 1M. That asymmetry is what made the menu
 * look broken for some models and fine for others.
 */
import { describe, expect, it } from 'vitest'
import {
  CONTEXT_100K,
  CONTEXT_1M,
  contextChoicesFor,
  contextLabel,
  contextStepsFor,
  contextVariantsFor,
} from '../../src/engines/protocom/model-registry.ts'
import { sameBudget, variantLengths, withinLadderCeiling } from '../../src/engines/protocom/context-variants.ts'

/** The ladder OpenCode Go ships, and the one a capping deployment would set. */
const GO_LADDER = [204_800, 262_144, 409_600, 1_048_576]
/** A registry-sized model, as groupCatalog projects one. */
const sized = (contextWindow: number) => ({ contextWindow, contextOptions: contextChoicesFor(contextWindow) })

describe('context budget matching (R3)', () => {
  it('treats the two bases of one budget as the same budget', () => {
    // The radix gap is 2.4% at the K scale and 4.86% at the M scale, and every
    // shipped ladder spaces its rungs 28% apart or more, so the band is
    // unambiguous.
    expect(sameBudget(1_000_000, 1_048_576)).toBe(true)
    expect(sameBudget(200_000, 204_800)).toBe(true)
    expect(sameBudget(256_000, 262_144)).toBe(true)
    expect(sameBudget(400_000, 409_600)).toBe(true)
    // Adjacent rungs are never confused for one another.
    expect(sameBudget(204_800, 262_144)).toBe(false)
    expect(sameBudget(262_144, 409_600)).toBe(false)
    expect(sameBudget(409_600, 1_048_576)).toBe(false)
  })

  it('offers a decimal-window model the rung that names its budget', () => {
    // The reported defect: glm-5.3 declares 1,000,000 and was offered only up
    // to 400K, because 1,000,000 never equals the 1,048,576 rung.
    const steps = contextStepsFor(sized(1_000_000) as never, GO_LADDER)
    expect(steps).toContain(1_000_000)
    expect(steps.map(contextLabel)).toEqual(['200K', '256K', '400K', '1M (dec)'])
  })

  it('emits the model\'s own figure, not the rung it matched', () => {
    // They differ by up to the tolerance, and only the model's own number is
    // one it can honour. Advertising the rung is how a model ends up promised
    // a window it does not have.
    const steps = contextStepsFor(sized(1_000_000) as never, GO_LADDER)
    expect(steps).not.toContain(1_048_576)
  })

  it('offers a window that falls between two rungs', () => {
    // grok-4.7 declares 500,000, which matches no rung: it sits between 400K
    // and 1M. The ladder's ceiling is 1M, so the capacity is within what the
    // deployment allows and must be reachable.
    const steps = contextStepsFor(sized(500_000) as never, GO_LADDER)
    expect(steps).toEqual([204_800, 262_144, 409_600, 500_000])
  })

  it('does not override a ladder that deliberately stops lower', () => {
    // A group offering only 256K has said so on purpose: a 1M model there
    // stays at 256K. Capping is a real choice, and the ceiling rule is what
    // keeps the fix from erasing it.
    expect(contextStepsFor(sized(1_048_576) as never, [262_144])).toEqual([262_144])
    expect(withinLadderCeiling(1_048_576, [262_144])).toBe(false)
    expect(withinLadderCeiling(1_048_576, GO_LADDER)).toBe(true)
  })

  it('never leaves a model without a step', () => {
    // An empty match degrades to the model's own window rather than hiding it.
    expect(contextStepsFor(sized(1_000_000) as never, [123])).toEqual([1_000_000])
  })

  it('keeps an unknown model on the configured lengths unchanged', () => {
    // No registry options: the ladder is taken as given, exactly as before.
    expect(variantLengths(undefined, GO_LADDER)).toEqual(GO_LADDER)
    expect(variantLengths(undefined, undefined)).toBeUndefined()
    expect(variantLengths([262_144], undefined)).toBeUndefined()
  })
})

/**
 * `contextVariantsFor` is the single expression the adapter mints menu entries
 * with and the settings row draws its chips from, so its contract is what keeps
 * the two from disagreeing -- the defect that once left a row showing one
 * pressed chip which refused every click.
 */
describe('context variants under a group ladder (R3)', () => {
  /** A model declaring its own rung, as Haiku 5.5 does for its price cliff. */
  const declarer = (contextWindow: number, contextLengths: readonly number[]) => ({
    contextWindow,
    contextOptions: contextChoicesFor(contextWindow),
    contextLengths,
  })

  it('offers one bare-id entry when nothing is configured', () => {
    // The group ladder is the SWITCH, not merely a filter. This is the shape
    // most deployments run, and it must stay a single entry under the bare id.
    expect(contextVariantsFor({ contextWindow: CONTEXT_1M }, undefined)).toBeUndefined()
    expect(contextVariantsFor({ contextWindow: CONTEXT_1M }, [])).toBeUndefined()
  })

  it('adds a declared rung the ladder does not name', () => {
    // The property the whole `contextLengths` field exists for: 100,000 is not
    // within 8% of any ladder rung, so rung matching alone would drop it and
    // the cheap tier would be unreachable. The model's own decimal 1M window is
    // offered in place of the 1,048,576 rung, as it always is.
    const steps = contextVariantsFor(declarer(CONTEXT_1M, [CONTEXT_100K]), GO_LADDER)
    expect(steps).toContain(CONTEXT_100K)
    expect(steps).toEqual([CONTEXT_100K, 204_800, 262_144, 409_600, CONTEXT_1M])
  })

  it('offers a declared rung even with no ladder configured at all', () => {
    // Otherwise the one model whose rungs are not interchangeable would lose
    // the choice precisely in the deployments that configure least. The model's
    // own window is NOT offered here: with no ladder the entry is a single
    // bare-id row, and a declared rung is the sole reason to expand it.
    expect(contextVariantsFor(declarer(CONTEXT_1M, [CONTEXT_100K]), undefined))
      .toEqual([CONTEXT_100K])
  })

  it('still lets a deliberate cap drop a declared rung above it', () => {
    // A fact about a model must not outrank a deployment's own ceiling: the
    // 100K rung survives a 256K cap, and a declared rung above the cap does not.
    expect(contextVariantsFor(declarer(CONTEXT_1M, [CONTEXT_100K]), [262_144]))
      .toEqual([CONTEXT_100K, 262_144])
  })

  it('lets a stored per-model choice win over the ladder', () => {
    // The picker is the surface a user actually sets, so it is the authority.
    expect(contextVariantsFor(declarer(CONTEXT_1M, [CONTEXT_100K]), GO_LADDER, [262_144]))
      .toEqual([262_144])
  })

  it('drops a stored choice the model cannot honour', () => {
    // Advertising a budget above the model's own window promises a capacity it
    // does not have.
    expect(contextVariantsFor(declarer(262_144, []), GO_LADDER, [1_048_576])).toBeUndefined()
  })

  it('ignores an empty stored list, which is not a choice', () => {
    expect(contextVariantsFor(declarer(CONTEXT_1M, [CONTEXT_100K]), GO_LADDER, []))
      .toEqual([CONTEXT_100K, 204_800, 262_144, 409_600, 1_048_576])
  })
})
