// @vitest-environment jsdom
/**
 * The context-length chips on one model row.
 *
 * The report was: different lengths cannot be clicked, and clicking one makes
 * the whole page flash. Those are two defects, and the first had a subtle
 * cause -- the chips were drawn from the GROUP ladder while the pressed set
 * came from the per-model store, so whenever the two disagreed the row showed
 * a single pressed chip, and that chip was the one the at-least-one guard
 * disables. A row could therefore offer exactly one usable-looking control
 * that refused every click.
 *
 * StepFun is the case that exposes it: it is the one group shipping a
 * four-step ladder, so its rows have a real choice to make.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocomSection } from '../../src/engines/protocom/client/ProtocomSection.tsx'
import { en } from '../../src/engines/protocom/client/locale.ts'
import { PROTOCOM, OPENCODE_GO } from '../../src/engines/protocom/family.ts'
import type { ProtocomOperations } from '../../src/engines/protocom/client/operations.ts'

/**
 * Discovery answers with UPSTREAM listing rows, which the card projects into
 * menu entries; a projected row here would render nothing, because the
 * projection reads the id.
 */
const LISTING = [{ id: 'step-3.7-flash', name: 'step-3.7-flash' }]

/**
 * An operations stub whose describeSettings reflects every write, the way the
 * Host does. A frozen view would hide the re-render loop these tests catch.
 * @param initial - the stored modelContexts map.
 */
function bench(initial: Record<string, number[]> = {}) {
  let contexts = { ...initial }
  const writes: { op: string; path: string[]; value?: unknown }[][] = []
  let describes = 0
  const operations: ProtocomOperations = {
    describeSettings: async () => {
      describes += 1
      return {
        ns: 'protocom-api',
        revision: describes,
        writable: true,
        value: { groups: { stepfun: { enabled: true } }, modelContexts: contexts },
      } as never
    },
    describeCredentials: async () => ({}),
    storeApiKey: vi.fn(async () => undefined),
    writeSettings: vi.fn(async (ops) => {
      writes.push(ops as never)
      for (const op of ops as { op: string; path: string[]; value?: unknown }[]) {
        if (op.path[0] !== 'modelContexts') continue
        if (op.op === 'unset') delete contexts[op.path[1] as string]
        else contexts = { ...contexts, [op.path[1] as string]: op.value as number[] }
      }
      return { kind: 'written', view: {} } as never
    }),
    discoverModels: vi.fn(async () => ({ kind: 'found', models: LISTING }) as never),
  }
  return { operations, writes, describes: () => describes }
}

function renderSection(operations: ProtocomOperations) {
  return render(<ProtocomSection
    operations={operations}
    t={(key) => en[key]}
    family={PROTOCOM}
    copy={{ title: en.title, intro: en.intro }}
  />)
}

/** Run the StepFun card's discovery, then return its model row. */
async function stepfunRow(): Promise<HTMLElement> {
  // The cards do not exist until the first settings read lands, so wait for the
  // group name rather than querying immediately.
  await screen.findAllByText(en.groupStepfun)
  const cards = [...document.querySelectorAll('.protocom-card')]
  const card = cards.find(candidate => candidate.querySelector('.protocom-card-name')?.textContent === en.groupStepfun) as HTMLElement
  const buttons = [...card.querySelectorAll('button')]
  fireEvent.click(buttons.find(button => button.textContent === en.probeRefresh) as HTMLElement)
  await waitFor(() => expect(card.querySelector('.protocom-model-row')).not.toBeNull(), { timeout: 3000 })
  return card.querySelector('.protocom-model-row') as HTMLElement
}

/**
 * The chips of one row, in ladder order.
 *
 * Opens the row's disclosure first: the per-row controls moved behind it, so a
 * row communicates its state through a summary and edits on request.
 */
function chips(row: HTMLElement): HTMLButtonElement[] {
  const more = row.querySelector('.protocom-model-more') as HTMLElement
  if (more.getAttribute('aria-expanded') !== 'true') fireEvent.click(more)
  return [...row.querySelectorAll('.protocom-ctx button')] as HTMLButtonElement[]
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('context length chips (R3)', () => {
  it('draws one chip per step the group advertises', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench().operations)
    const row = await stepfunRow()
    // StepFun ships a four-step ladder and the adapter advertises all four,
    // so the row must offer all four. Drawing fewer is the defect: the
    // unselected steps become unreachable.
    expect(chips(row).map(chip => chip.textContent)).toEqual(['200K', '256K', '400K', '1M'])
  })

  it('leaves every chip clickable while more than one step is in force', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench().operations)
    const row = await stepfunRow()
    // The whole ladder is in force by default, so turning any step OFF is a
    // legal move and no chip may be disabled. This is the assertion that
    // fails when the chips and the pressed set come from separate sources.
    expect(chips(row).filter(chip => chip.disabled)).toHaveLength(0)
    expect(chips(row).every(chip => chip.getAttribute('aria-pressed') === 'true')).toBe(true)
  })

  it('writes the step a person turns off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const b = bench()
    renderSection(b.operations)
    const row = await stepfunRow()
    fireEvent.click(chips(row)[0] as HTMLElement)
    await waitFor(() => expect(b.writes).toHaveLength(1))
    expect(b.writes[0]?.[0]).toEqual({
      op: 'set',
      path: ['modelContexts', 'step-3.7-flash'],
      value: [262144, 409600, 1048576],
    })
  })

  it('disables only the last remaining chip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    // A single stored step: turning it off would leave the model with no menu
    // entry at all, so this is the one case that must refuse.
    const b = bench({ 'step-3.7-flash': [204800] })
    renderSection(b.operations)
    const row = await stepfunRow()
    const states = chips(row).map(chip => ({ label: chip.textContent, disabled: chip.disabled, on: chip.getAttribute('aria-pressed') }))
    expect(states.filter(chip => chip.on === 'true').map(chip => chip.label)).toEqual(['200K'])
    expect(states.filter(chip => chip.disabled).map(chip => chip.label)).toEqual(['200K'])
  })
})

/**
 * The 100K chip on the one model that has a price line there.
 *
 * Claude Haiku 5.5 bills 5x above 100K input tokens per request, so the cheap
 * budget must be reachable. It is NOT a rung of the Go ladder -- the model
 * declares it for itself -- which is exactly the kind of rung that can go
 * missing in one of the two places that compute the menu. The adapter's half is
 * asserted in `messages.spec.ts`; this is the settings half, so a change that
 * leaves the picker offering 100K while the row hides it (or the reverse) fails
 * here instead of shipping.
 */
describe('a rung a model declares for itself', () => {
  const HAIKU = [{ id: 'claude-haiku-5-5', name: 'claude-haiku-5-5' }]

  function goBench(contexts: Record<string, number[]> = {}) {
    let stored = { ...contexts }
    const writes: { op: string; path: string[]; value?: unknown }[][] = []
    let describes = 0
    const operations: ProtocomOperations = {
      describeSettings: async () => {
        describes += 1
        return {
          ns: 'protocom-api',
          revision: describes,
          writable: true,
          value: { groups: { go: { enabled: true } }, modelContexts: stored },
        } as never
      },
      describeCredentials: async () => ({}),
      storeApiKey: vi.fn(async () => undefined),
      writeSettings: vi.fn(async (ops) => {
        writes.push(ops as never)
        for (const op of ops as { op: string; path: string[]; value?: unknown }[]) {
          if (op.path[0] !== 'modelContexts') continue
          if (op.op === 'unset') delete stored[op.path[1] as string]
          else stored = { ...stored, [op.path[1] as string]: op.value as number[] }
        }
        return { kind: 'written', view: {} } as never
      }),
      discoverModels: vi.fn(async () => ({ kind: 'found', models: HAIKU }) as never),
    }
    return { operations, writes }
  }

  async function goRow(): Promise<HTMLElement> {
    await screen.findAllByText(en.groupGo)
    const card = [...document.querySelectorAll('.protocom-card')]
      .find(candidate => candidate.querySelector('.protocom-card-name')?.textContent === en.groupGo) as HTMLElement
    fireEvent.click([...card.querySelectorAll('button')].find(button => button.textContent === en.probeRefresh) as HTMLElement)
    await waitFor(() => expect(card.querySelector('.protocom-model-row')).not.toBeNull(), { timeout: 3000 })
    // The Haiku row specifically, not the first row: the group lists every Go
    // model and the recommended ordering puts DeepSeek first, so taking
    // `.protocom-model-row` here would assert against a different model's
    // ladder -- which is precisely the mistake that made the first draft of
    // this test pass a wrong conclusion.
    const row = [...card.querySelectorAll('.protocom-model-row')]
      .find(candidate => candidate.querySelector('.protocom-model-name')?.textContent === 'Claude Haiku 5.5') as HTMLElement
    expect(row).toBeDefined()
    return row
  }

  it('offers the 100K rung beside the ladder, labelled in its own base', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    render(<ProtocomSection operations={goBench().operations} t={(key) => en[key]} family={OPENCODE_GO} copy={{ title: en.title, intro: en.intro }} />)
    const row = await goRow()
    // Five chips: the group's four rungs plus the declared 100K. Sorted, so the
    // cheapest budget leads. `100K (dec)` is what separates it from a
    // hypothetical 102,400 `100K` -- two different budgets must never share a
    // label, or the row cannot say which line is being bought.
    expect(chips(row).map(chip => chip.textContent)).toEqual(['100K (dec)', '200K', '256K', '400K', '1M (dec)'])
  })

  it('writes the declared rung when a person turns it off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const b = goBench()
    render(<ProtocomSection operations={b.operations} t={(key) => en[key]} family={OPENCODE_GO} copy={{ title: en.title, intro: en.intro }} />)
    const row = await goRow()
    fireEvent.click(chips(row)[0] as HTMLElement)
    await waitFor(() => expect(b.writes).toHaveLength(1))
    // The remaining set is the four ladder steps with the 100K rung gone. The
    // top step is 1,000,000 -- the MODEL's own decimal window -- not the
    // ladder's binary 1,048,576, because `variantLengths` emits the model's
    // figure: it is the only length the model can actually honour. That is also
    // why the chip beside it reads `1M (dec)`.
    expect(b.writes[0]?.[0]).toEqual({
      op: 'set',
      path: ['modelContexts', 'claude-haiku-5-5'],
      value: [204800, 262144, 409600, 1000000],
    })
  })
})
