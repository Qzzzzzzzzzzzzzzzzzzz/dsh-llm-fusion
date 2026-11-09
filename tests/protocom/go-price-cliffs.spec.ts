// @vitest-environment node
/**
 * Price cliffs are reachable from the menu.
 *
 * OpenCode Go bills per request, and five of its models move to a materially
 * higher rate once a single request's INPUT exceeds a threshold published in
 * the vendor's own pricing table (2026-10-28):
 *
 *   claude-haiku-5-5   <= 100K  $0.10/$0.50   > 100K  $0.50/$2.50   (5x)
 *   grok-4.7           <= 200K  $2.00/$6.00   > 200K  $4.00/$12.00  (2x)
 *   qwen3.7-plus       <= 256K  $0.40/$1.60   > 256K  $1.20/$4.80   (3x)
 *   gpt-6-luna         <= 272K  $0.10/$0.50   > 272K  $0.20/$0.75   (2x)
 *   gpt-5.6-luna       <= 272K  $0.20/$1.20   > 272K  $0.40/$1.80   (2x)
 *
 * A registry entry's `contextLengths` is a MENU MEMBERSHIP choice: declaring a
 * figure there puts it in front of the operator as a selectable budget. So the
 * defect this guards is not "a wrong number" but "no way to choose the cheap
 * side of a cliff", which is silent -- the model still works, it just costs
 * several times what the operator intended.
 *
 * `minimax-m3` is asserted in the NEGATIVE direction on purpose: models.dev
 * publishes a 512,000 `tiers` entry for it that reads like a cliff, and the
 * vendor's own table contradicts it (single rate, and the twin table on Command
 * Code has two identical rows). Declaring a rung there would advertise a cliff
 * that does not exist.
 */
import { describe, expect, it } from 'vitest'
import { GO_REGISTRY, contextVariantsFor, matchRegistry } from '../../src/engines/protocom/model-registry.ts'

/** The Go group's shipped ladder, from `OPENCODE_GO.defaults.go.contextLengths`. */
const GO_LADDER = [204_800, 262_144, 409_600, 1_048_576]

/** The published boundary for each model that has one. */
const CLIFFS: ReadonlyArray<{ id: string; boundary: number }> = [
  { id: 'claude-haiku-5-5', boundary: 100_000 },
  { id: 'grok-4.7', boundary: 200_000 },
  { id: 'qwen3.7-plus', boundary: 256_000 },
  { id: 'gpt-6-luna', boundary: 272_000 },
  { id: 'gpt-5.6-luna', boundary: 272_000 },
]

/** The budgets a fresh deployment would offer for one Go model. */
function offered(id: string): number[] {
  const entry = matchRegistry(id, GO_REGISTRY)
  if (entry === undefined) throw new Error(`no registry entry for ${id}`)
  return contextVariantsFor(
    {
      upstreamId: id,
      displayName: entry.displayName,
      contextWindow: entry.contextWindow,
      contextLengths: entry.contextLengths,
    },
    GO_LADDER,
  ) ?? [entry.contextWindow]
}

describe('Go price cliffs (R3)', () => {
  it('names the boundary itself as a selectable budget', () => {
    // Without the declaration the boundary is not offered and the operator has
    // to pick between a rung well under the line and one well over it.
    for (const { id, boundary } of CLIFFS) {
      expect(offered(id), id).toContain(boundary)
    }
  })

  it('offers at least one budget on the cheap side of every cliff', () => {
    // This is the whole point. `grok-4.7` is the case that motivated the
    // mechanism: its ladder floor is 204,800, already PAST its 200K boundary,
    // so before the declaration every single offered budget was on the
    // expensive side.
    for (const { id, boundary } of CLIFFS) {
      const cheap = offered(id).filter(tokens => tokens <= boundary)
      expect(cheap.length, `${id} has no budget at or below ${boundary}`).toBeGreaterThan(0)
    }
  })

  it('routes the cheap budget through the model, not around it', () => {
    // A budget above the model's own window is not a budget, so the declared
    // rung must survive the ceiling filter rather than being dropped by it.
    for (const { id, boundary } of CLIFFS) {
      const entry = matchRegistry(id, GO_REGISTRY)
      expect(entry).toBeDefined()
      expect(boundary).toBeLessThanOrEqual(entry!.contextWindow)
    }
  })

  it('leaves a model without a cliff alone', () => {
    // MiniMax M3 has one published rate. A rung here would invent a boundary,
    // and models.dev's `tiers` array -- the only source that suggests one -- is
    // contradicted by the vendor's own table and by Command Code's twin listing.
    const entry = matchRegistry('minimax-m3', GO_REGISTRY)
    expect(entry).toBeDefined()
    expect(entry?.contextLengths).toBeUndefined()
  })
})
