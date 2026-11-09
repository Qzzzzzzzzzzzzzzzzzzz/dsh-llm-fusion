// @vitest-environment node
/**
 * The two registry mistakes that silently remove a model's Effort submenu.
 *
 * 1. A DUPLICATE id. Two entries for one model means `matchRegistry` returns
 *    whichever comes first, so the second one's metadata -- including any
 *    reasoning vocabulary -- is unreachable. This was introduced by hand while
 *    completing the vocabularies below and caught only because a count looked
 *    wrong.
 *
 * 2. A TAGGED entry with no vocabulary in a family that supplies no group
 *    default. The entry is offered, the picker has no levels to show, and the
 *    model has no thinking control at all -- silently, because nothing errors.
 *    Twenty-three entries were in that state; each was probed by request
 *    (2026-10-01) and given the set the endpoint actually accepts.
 */
import { describe, expect, it } from 'vitest'
import { CLINEPASS_REGISTRY } from '../../src/engines/protocom/clinepass.ts'
import { GO_REFUSED_MODEL_IDS, GO_REGISTRY, REGISTRY } from '../../src/engines/protocom/model-registry.ts'

/** Every registry this plugin ships, with the group key its entries belong to. */
const REGISTRIES = [
  { label: 'relay', entries: REGISTRY, group: undefined as string | undefined },
  { label: 'go', entries: GO_REGISTRY, group: 'go' },
  { label: 'clinepass', entries: CLINEPASS_REGISTRY, group: 'clinepass' },
]

describe('registry integrity (R3)', () => {
  it('declares each model id exactly once', () => {
    for (const { label, entries } of REGISTRIES) {
      const counts = new Map<string, number>()
      for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1)
      const duplicated = [...counts].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`)
      expect(duplicated, label).toEqual([])
    }
  })

  it('gives every offered Go model a reasoning vocabulary', () => {
    // The Go family ships no group default, so an entry without its own
    // vocabulary is a model with no Effort submenu. Refused ids are exempt:
    // they are never offered, so they need none.
    //
    // One further exemption is explicit rather than implied: a model that
    // REASONS but for which no source publishes a vocabulary. Offering an
    // Effort picker there would invent levels the route may refuse, which is
    // worse than showing no picker -- the same call made for `hy3` and
    // `kimi-k2.6` before it. Each id below must be justified here, so adding
    // one is a deliberate act that has to survive review.
    const NO_PUBLISHED_VOCABULARY = new Set([
      // models.dev marks `reasoning: true` but publishes no
      // `reasoning_options` for this id, unlike every reasoning model beside
      // it, and the vendor's docs publish no effort field at all. Nothing
      // states which levels the route accepts, so none are offered.
      'iceman-contributor-free',
    ])
    const refused = new Set(GO_REFUSED_MODEL_IDS as readonly string[])
    const mute = GO_REGISTRY
      .filter(entry => entry.groups?.includes('go') === true)
      .filter(entry => !refused.has(entry.id))
      .filter(entry => !NO_PUBLISHED_VOCABULARY.has(entry.id))
      .filter(entry => entry.reasoning === undefined)
      .map(entry => entry.id)
    expect(mute).toEqual([])
  })

  it('keeps the documented no-vocabulary exemption honest', () => {
    // The exemption above is only sound while each id it names really is
    // offered, really does lack a vocabulary, and is not simply forgotten. A
    // refused or deleted id lingering in the exemption list would silently
    // widen it for whoever adds the next one.
    const refused = new Set(GO_REFUSED_MODEL_IDS as readonly string[])
    for (const id of ['iceman-contributor-free']) {
      const entry = GO_REGISTRY.find(candidate => candidate.id === id)
      expect(entry, `${id} must stay declared while exempt`).toBeDefined()
      expect(refused.has(id), `${id} is exempt only while offered`).toBe(false)
      expect(entry?.reasoning, `${id} is exempt because it has none`).toBeUndefined()
    }
  })
})
