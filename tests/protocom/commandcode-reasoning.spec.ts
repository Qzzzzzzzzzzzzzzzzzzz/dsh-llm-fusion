// @vitest-environment node
/**
 * How Command Code spells a reasoning request.
 *
 * Its reasoning capability had two independent gaps: the menu offered no
 * Effort control at all, and the request would have carried a `thinking`
 * block the gateway accepts on its Anthropic wire only. Both are pinned
 * here, because neither failure is visible from the settings page.
 */
import { describe, expect, it } from 'vitest'
import { COMMANDCODE } from '../../src/engines/protocom/commandcode.ts'
import { resolveThinking } from '../../src/engines/protocom/protocol/chat-completions.ts'

describe('Command Code reasoning wiring (R3)', () => {
  it('spells effort on the OpenAI wire without a thinking block', () => {
    // The vendor documents the OpenAI surface as taking reasoning_effort
    // alone, and its own CLI emits that single field. A thinking block here
    // would be rejected provider-side, which reads as a plugin defect.
    expect(COMMANDCODE.chatThinking).toBe('effort-only')
    expect(resolveThinking('high', COMMANDCODE.chatThinking)).toEqual({ reasoning_effort: 'high' })
    expect(resolveThinking('high', COMMANDCODE.chatThinking)).not.toHaveProperty('thinking')
  })

  it('sends nothing when no effort was chosen', () => {
    // The CLI omits the field entirely until an effort is set, so an absent
    // choice must not invent one.
    expect(resolveThinking(undefined, COMMANDCODE.chatThinking)).toEqual({})
  })

  it('answers a vocabulary for the models that accept one', () => {
    // Without this the adapter chain ended at a group default Command Code
    // deliberately has none of, so no model offered a control.
    //
    // The 2026-10-28 catalog refresh prefixed this model's cell with `off`
    // (2026-09-27 said `high, max`). `off` is the gateway's own disabling word
    // -- kimi-k2.7-code has always carried it -- so it is a real token here.
    expect(COMMANDCODE.reasoningFor?.('deepseek/deepseek-v4-pro')).toEqual({
      efforts: ['off', 'high', 'max'],
      defaultEffort: 'high',
    })
  })

  it('declares no group-wide vocabulary, so nothing is invented', () => {
    // A single group list would offer levels most of these models refuse;
    // the per-model source is the only honest one.
    expect(COMMANDCODE.defaults['cc']?.reasoning).toBeUndefined()
  })
})
