// @vitest-environment node
/**
 * Every model a group's menu can offer must be one the endpoint serves.
 *
 * A registry entry tagged for a group is a menu MEMBERSHIP SOURCE: it is
 * offered even when the live listing no longer carries it. That is what makes
 * the catalog survive an unreachable listing, and it is also how six Go models
 * became selectable rows whose every use answered 400 "Model is unavailable"
 * after the endpoint's catalog shrank from 43 ids to 36.
 *
 * An id the endpoint has stopped serving belongs in that group's refused list,
 * which keeps it out of the menu while leaving its metadata one line away from
 * returning. This asserts the outcome: tagged, but neither served nor refused,
 * is the defect.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GO_REFUSED_MODEL_IDS, GO_REGISTRY } from '../../src/engines/protocom/model-registry.ts'

/**
 * The Go listing as fetched on 2026-10-08 (40 ids).
 *
 * Refreshed from the 2026-09-27 snapshot (36 ids). A single snapshot is the
 * right instrument here even though it cannot see history: the question is
 * whether the endpoint serves an id NOW, and only the current listing answers
 * it. The 2026-10-08 fetch showed why -- the endpoint had added five ids and
 * stopped listing eight others, so a stale snapshot reports the new models as
 * "stranded" and the dropped ones as live, both backwards.
 *
 * Snapshotted twice for 2026-10-31 because the listing moved DURING the refresh
 * that day: it read 38 ids in the morning and 28 by the afternoon, and the 28
 * was confirmed by four probes over eighty seconds under four header variants
 * (plain, no-cache, session, bogus-bearer), so it is a withdrawal rather than a
 * cache artefact. The 28 is what this assertion uses, because only the current
 * listing answers "does the endpoint serve this now" -- and the ten ids that
 * left mid-day are refused, so using the stale 38 would let them back in.
 */
const LIVE: ReadonlySet<string> = new Set(JSON.parse(
  readFileSync(new URL('./fixtures/agents/opencode-go-ids-2026-10-31.json', import.meta.url), 'utf8'),
) as string[])

/**
 * Ids the listing still advertises that cannot serve a request from this plugin.
 *
 * A listing is an advertisement, not a promise. The inverse check below exists
 * to catch a WORKING model being hidden, so it must not flag these -- each is
 * refused for a reason recorded here.
 */
const LISTED_BUT_UNSERVABLE: readonly string[] = [
  // `minimax-m2.7` and `kimi-k2.6` used to live here: they were ADVERTISED yet
  // failed (503 on both wires / 410 Gone). The 2026-10-31 withdrawal stopped
  // advertising them at all, so they moved into the plain refused list -- same
  // conclusion, stronger evidence, no longer a special case.
  //
  // Alive and served, but on a fourth wire: the docs table sends it to
  // `.../v1/models/gemini-4-argon-contributor` with `@ai-sdk/google`, and a
  // probe confirms `:generateContent` there answers 401 (route exists) while
  // `/chat/completions` beneath it answers 404. Refusing it omits the row rather
  // than listing one that fails on every use.
  'gemini-4-argon-contributor',
  // The paid sibling, added and withdrawn within the same day. Listed in the
  // morning (38-id snapshot) and gone by the afternoon, exactly like its
  // contributor sibling above, and on the same Google-native surface.
  'gemini-4-argon',
  // Advertised on 2026-10-31 ONLY in the morning snapshot: `hy3-preview` was
  // already refused before this refresh, and every other id that left mid-day is
  // a plain withdrawal rather than a wire mismatch. Listed here anyway so the
  // inverse check cannot flag a wire-refused id if it is re-advertised.
  'hy3-preview',
]

describe('go registry coverage (R3)', () => {
  it('offers no tagged model the endpoint has stopped serving', () => {
    const refused = new Set(GO_REFUSED_MODEL_IDS as readonly string[])
    const stranded = GO_REGISTRY
      .filter(entry => entry.groups?.includes('go') === true)
      .map(entry => entry.id)
      .filter(id => !LIVE.has(id) && !refused.has(id))
    expect(stranded).toEqual([])
  })

  it('refuses no model the endpoint is actually serving', () => {
    // The inverse mistake: refusing a working model hides it from the menu.
    const wronglyRefused = GO_REFUSED_MODEL_IDS
      .filter(id => LIVE.has(id))
      .filter(id => !LISTED_BUT_UNSERVABLE.includes(id))
    expect(wronglyRefused).toEqual([])
  })

  it('refuses a model on an unsupported wire without pretending it is dead', () => {
    // The distinction this pins: `gemini-4-argon-contributor` was listed by the
    // endpoint and genuinely served -- just on Google's native surface, which
    // this plugin does not implement. It must be refused (so no unroutable row
    // reaches the menu) but must NOT be declared in GO_REGISTRY, because a
    // registry entry is a membership source that would mint exactly that row.
    //
    // The "it was really listed" half is asserted against the snapshot that
    // recorded it. The 2026-10-31 withdrawal removed it from the live listing
    // entirely, so checking the current snapshot for it would now fail for a
    // reason that has nothing to do with the wire. The refusal and the
    // absence-from-registry halves are still asserted against the PRESENT,
    // because those are the properties that must hold today.
    const listedThen: string[] = JSON.parse(
      readFileSync(new URL('./fixtures/agents/opencode-go-ids-2026-10-08.json', import.meta.url), 'utf8'),
    )
    expect(listedThen).toContain('gemini-4-argon-contributor')
    expect(GO_REFUSED_MODEL_IDS).toContain('gemini-4-argon-contributor')
    expect(GO_REGISTRY.some(entry => entry.id === 'gemini-4-argon-contributor')).toBe(false)
  })

  it('records the rename that replaced one entry with another', () => {
    // On 2026-10-08 the listing dropped `space-bunny-free` and carried the paid
    // `space-bunny` in its place -- models.dev still carries both, so this is a
    // tier change rather than a retirement. The free id is refused and the paid
    // one is declared; both halves of that decision are pinned here, so a future
    // refresh that reverses it fails loudly instead of quietly leaving the menu
    // with whichever half someone remembered.
    //
    // Both ids are now gone from the CURRENT listing (the 2026-10-31 withdrawal
    // took `space-bunny` out too), and the registry side is unchanged: the paid
    // entry is still declared and the free id is still refused. That pairing is
    // what matters, and it is asserted against the snapshots rather than against
    // today's listing so it keeps testing the rename instead of the withdrawal.
    const before: string[] = JSON.parse(
      readFileSync(new URL('./fixtures/agents/opencode-go-ids-2026-09-27.json', import.meta.url), 'utf8'),
    )
    const afterRename: string[] = JSON.parse(
      readFileSync(new URL('./fixtures/agents/opencode-go-ids-2026-10-08.json', import.meta.url), 'utf8'),
    )
    expect(before).toContain('space-bunny-free')
    expect(before).not.toContain('space-bunny')
    expect(afterRename).toContain('space-bunny')
    expect(afterRename).not.toContain('space-bunny-free')
    // The registry half is a present-tense claim and stays one.
    expect(GO_REGISTRY.some(entry => entry.id === 'space-bunny')).toBe(true)
    expect(GO_REFUSED_MODEL_IDS).toContain('space-bunny-free')
    expect(GO_REFUSED_MODEL_IDS).toContain('space-bunny')
  })
})
