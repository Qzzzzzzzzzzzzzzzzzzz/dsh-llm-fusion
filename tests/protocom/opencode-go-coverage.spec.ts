// @vitest-environment node
/**
 * Every model the Go endpoint serves must have a registry entry.
 *
 * The listing is the membership source, so an unlisted model still appears in
 * the menu -- but with a guessed window, no effort vocabulary, and the
 * permissive vision default. That is the failure this guards: not a missing
 * row, a row whose metadata is quietly wrong.
 *
 * The fixture is an archived `GET /zen/go/v1/models` joined with models.dev's
 * published facts for each id, so the check is deterministic and does not depend
 * on either being reachable. It was refreshed on 2026-10-08 (40 rows) from the
 * 2026-09-27 capture: the endpoint had added five ids -- `claude-haiku-5-5`,
 * `gemini-4-argon-contributor`, `space-bunny`, `step-5-preview-free` and
 * `cat-jam-free` -- and stopped listing eight it used to carry.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GO_REFUSED_MODEL_IDS, GO_REGISTRY } from '../../src/engines/protocom/model-registry.ts'

/** The live listing as fetched on 2026-10-08, with models.dev's facts joined in. */
const LISTING: { id: string; ctx: number | undefined; vision: boolean; efforts: string[] | null }[] =
  JSON.parse(readFileSync(new URL('./fixtures/agents/opencode-go-models-2026-10-08.json', import.meta.url), 'utf8'))

const byId = new Map(GO_REGISTRY.map(entry => [entry.id, entry]))

describe('Go registry coverage (R3)', () => {
  it('declares every servable model the endpoint lists', () => {
    const refused = new Set(GO_REFUSED_MODEL_IDS as readonly string[])
    // A refused id is deliberately absent: it cannot serve a chat turn, so an
    // entry for it would put an unusable row in the menu.
    const missing = LISTING
      .filter(model => !byId.has(model.id) && !refused.has(model.id))
      .map(model => model.id)
    expect(missing).toEqual([])
  })

  it('sizes each declared model at its published window', () => {
    const wrong = LISTING
      .filter(model => model.ctx !== undefined && byId.has(model.id))
      .filter(model => byId.get(model.id)?.contextWindow !== model.ctx)
      .map(model => model.id + ': ours=' + byId.get(model.id)?.contextWindow + ' published=' + model.ctx)
    // A window that is too small hides usable context; too large invites a
    // request the provider rejects.
    expect(wrong).toEqual([])
  })

  it('marks exactly the models the vendor says accept image input', () => {
    const wrong = LISTING
      .filter(model => byId.has(model.id))
      // A model models.dev does not carry has no published verdict, so there is
      // nothing to compare against; the entry keeps the permissive default.
      .filter(model => model.vision !== undefined)
      .filter(model => (byId.get(model.id)?.vision ?? false) !== model.vision)
      .map(model => model.id + ': ours=' + String(byId.get(model.id)?.vision) + ' published=' + String(model.vision))
    expect(wrong).toEqual([])
  })
})
