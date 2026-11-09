// @vitest-environment node
/**
 * The Anthropic Messages wire, which this plugin speaks because two families
 * serve models on it and NOWHERE else.
 *
 * The point of these tests is the four places the wire differs from the two
 * OpenAI surfaces in a way that produces a silently wrong request rather than a
 * loud refusal: `max_tokens` being required, the system prompt being top-level,
 * tool arguments being an object, and usage already being disjoint. Each of
 * those has a test below that names the specific defect it prevents.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ProtocomAdapter } from '../../src/engines/protocom/adapter.ts'
import { resolveAdapterOptions } from '../../src/engines/protocom/config.ts'
import { OPENCODE_GO } from '../../src/engines/protocom/family.ts'
import { parseSseUntilEof } from '../../src/engines/protocom/sse.ts'
import {
  ANTHROPIC_VERSION,
  DEFAULT_MAX_TOKENS,
  mapMessageUsage,
  mapStopReason,
  messagesConnection,
  resolveMessagesThinking,
  serializeMessagesRequest,
  streamMessages,
  translateMessages,
} from '../../src/engines/protocom/protocol/messages.ts'

function sseStream(text: string, chunkSize?: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      if (chunkSize === undefined) {
        controller.enqueue(bytes)
      } else {
        for (let at = 0; at < bytes.length; at += chunkSize) {
          controller.enqueue(bytes.slice(at, at + chunkSize))
        }
      }
      controller.close()
    },
  })
}

/** Frame payloads as an SSE body; this wire closes with no `[DONE]` sentinel. */
function sseBody(events: readonly unknown[]): string {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
}

async function collect(events: readonly unknown[], chunkSize?: number): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of translateMessages(parseSseUntilEof(sseStream(sseBody(events), chunkSize)))) {
    chunks.push(chunk)
  }
  return chunks
}

async function collectUntilFailure(events: readonly unknown[]): Promise<{ chunks: StreamChunk[]; error: unknown }> {
  const chunks: StreamChunk[] = []
  const iterator = translateMessages(parseSseUntilEof(sseStream(sseBody(events))))[Symbol.asyncIterator]()
  try {
    for (;;) {
      const result = await iterator.next()
      if (result.done) return { chunks, error: undefined }
      chunks.push(result.value)
    }
  } catch (error: unknown) {
    return { chunks, error }
  }
}

/** The lifecycle a provider sends for a plain text answer. */
function textEvents(text: string): unknown[] {
  return [
    { type: 'message_start', message: { usage: { input_tokens: 11, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } },
    { type: 'message_stop' },
  ]
}

const base: GenerateOptions = {
  provider: 'opencode-go-sub',
  model: 'claude-haiku-5-5',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message,
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('messages request serialization', () => {
  it('always sends max_tokens, which this wire requires', () => {
    // The harness leaves maxTokens optional. Omit it here and the request is
    // refused before the model is reached -- not a partial answer, no answer.
    expect(serializeMessagesRequest(base, 'claude-haiku-5-5').max_tokens).toBe(DEFAULT_MAX_TOKENS)
    expect(serializeMessagesRequest({ ...base, maxTokens: 64 }, 'm').max_tokens).toBe(64)
  })

  it('hoists both spellings of the system prompt into the top-level parameter', () => {
    // `system` is not a message on this wire, and the derived history puts it in
    // a system-role message instead. Both land in the same slot; a system-role
    // message left in the list is rejected outright.
    const body = serializeMessagesRequest({
      ...base,
      system: 'be brief',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'and kind' }] } as unknown as Message,
        { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message,
      ],
    }, 'm')
    expect(body.system).toBe('be brief\n\nand kind')
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
  })

  it('sends a tool call as a JSON object and a result as a block on a user turn', () => {
    // Two wire facts in one assertion: `input` is an object, not the string the
    // harness carries, and a tool result has no role of its own.
    const body = serializeMessagesRequest({
      ...base,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'read a.ts' }] } as unknown as Message,
        {
          role: 'assistant',
          content: [{ type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"a.ts"}' }],
        } as unknown as Message,
        { role: 'tool', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] } as unknown as Message,
      ],
    }, 'm')
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'read a.ts' }] },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.ts' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'ok' }],
      },
    ])
  })

  it('degrades unparseable tool arguments to an empty object rather than failing', () => {
    // A truncated stream or a model that emitted prose still produced a real
    // call: its name and id are correct, and one malformed call must not cost
    // the whole turn.
    const body = serializeMessagesRequest({
      ...base,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'go' }] } as unknown as Message,
        {
          role: 'assistant',
          content: [{ type: 'tool-call', id: 'c', name: 'f', arguments: '{"path": "a' }],
        } as unknown as Message,
      ],
    }, 'm')
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'go' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c', name: 'f', input: {} }] },
    ])
  })

  it('flags a failed tool result with the wire\'s own is_error', () => {
    // The text alone loses the distinction between a tool that answered and one
    // that failed, which is information the model uses.
    const body = serializeMessagesRequest({
      ...base,
      messages: [
        { role: 'tool', toolCallId: 'c', content: [{ type: 'text', text: 'boom' }], isError: true } as unknown as Message,
      ],
    }, 'm')
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c', content: 'boom', is_error: true }] },
    ])
  })

  it('maps tools onto input_schema, not parameters', () => {
    const body = serializeMessagesRequest({
      ...base,
      tools: [{ name: 'read_file', description: 'read', parameters: { type: 'object' } }],
    }, 'm')
    expect(body.tools).toEqual([
      { name: 'read_file', description: 'read', input_schema: { type: 'object' } },
    ])
  })

  it('sends stop_sequences only when the caller supplied stop words', () => {
    expect(serializeMessagesRequest(base, 'm').stop_sequences).toBeUndefined()
    expect(serializeMessagesRequest({ ...base, stop: [] }, 'm').stop_sequences).toBeUndefined()
    expect(serializeMessagesRequest({ ...base, stop: ['\n\nUser:'] }, 'm').stop_sequences).toEqual(['\n\nUser:'])
  })

  it('replays a developer turn as user text, never as assistant output', () => {
    // A mid-conversation instruction has no `system` slot here. Re-attributing
    // it as model output -- the naive else-branch -- would put words in the
    // model's mouth and let a harness instruction read as its own prior reply.
    const body = serializeMessagesRequest({
      ...base,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message,
        { role: 'developer', content: [{ type: 'text', text: 'be terse' }] } as unknown as Message,
      ],
    }, 'm')
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'text', text: 'be terse' }] },
    ])
  })

  it('drops a leading assistant turn the wire would refuse', () => {
    const body = serializeMessagesRequest({
      ...base,
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'earlier' }] } as unknown as Message,
        { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message,
      ],
    }, 'm')
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
  })

  it('does not replay reasoning blocks, which cannot be re-signed', () => {
    // Extended thinking returns to the provider as a signed block and a
    // stateless client cannot reconstruct the signature, so the wire refuses one
    // that arrives unsigned. The harness supplies reasoning for display only.
    const body = serializeMessagesRequest({
      ...base,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'explain' }] } as unknown as Message,
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'let me think' },
            { type: 'text', text: 'the answer' },
          ],
        } as unknown as Message,
      ],
    }, 'm')
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'explain' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    ])
  })

  it('still refuses an image on an assistant message', () => {
    const assistantImage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'x' },
        { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } },
      ],
    } as unknown as Message
    expect(() => serializeMessagesRequest({ ...base, messages: [assistantImage] }, 'm', new Map()))
      .toThrowError(/does not support image content/)
  })
})

describe('messages image input', () => {
  const imageMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'what is this?' },
      { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } },
    ],
  } as unknown as Message

  it('parses the retained data URL into a base64 source', () => {
    const images = new Map([['sha256:abc', 'data:image/png;base64,AAAA']])
    const body = serializeMessagesRequest({ ...base, messages: [imageMessage] }, 'm', images)
    expect(body.messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ],
    }])
  })

  it('passes an https reference through as a url source', () => {
    const images = new Map([['sha256:abc', 'https://cdn.test/a.png']])
    const body = serializeMessagesRequest({ ...base, messages: [imageMessage] }, 'm', images)
    expect(body.messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image', source: { type: 'url', url: 'https://cdn.test/a.png' } },
      ],
    }])
  })

  it('keeps the text when an image cannot be resolved', () => {
    // An empty content array is a wire error, and dropping the text would lose
    // the words the image travelled with.
    const body = serializeMessagesRequest({ ...base, messages: [imageMessage] }, 'm', new Map())
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'what is this?' }] },
    ])
  })

  it('never emits an empty content array for a wordless unresolved image', () => {
    const silent = {
      role: 'user',
      content: [{ type: 'image', attachment: { attachmentId: 'sha256:gone', mediaType: 'image/png' } }],
    } as unknown as Message
    const body = serializeMessagesRequest({ ...base, messages: [silent] }, 'm', new Map())
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: '' }] }])
  })
})

describe('messages thinking control', () => {
  it('spells effort as output_config.effort', () => {
    expect(resolveMessagesThinking('high')).toEqual({ output_config: { effort: 'high' } })
  })

  it('spells the vocabulary\'s off words as the wire\'s own disabled thinking', () => {
    // `none` and `off` are what the plugin's other surfaces use for "no
    // thinking"; this wire has a first-class field for it.
    expect(resolveMessagesThinking('none')).toEqual({ thinking: { type: 'disabled' } })
    expect(resolveMessagesThinking('off')).toEqual({ thinking: { type: 'disabled' } })
  })

  it('sends neither field when no effort was asked for', () => {
    expect(resolveMessagesThinking(undefined)).toEqual({})
    expect(serializeMessagesRequest(base, 'm').output_config).toBeUndefined()
    expect(serializeMessagesRequest(base, 'm').thinking).toBeUndefined()
  })

  it('carries the effort the caller named onto the body', () => {
    const body = serializeMessagesRequest({ ...base, reasoningEffort: 'xhigh' as GenerateOptions['reasoningEffort'] }, 'm')
    expect(body.output_config).toEqual({ effort: 'xhigh' })
  })
})

describe('messages usage accounting', () => {
  it('subtracts nothing, because these counters are already disjoint', () => {
    // The OpenAI surfaces fold cache hits into a prompt total and this plugin
    // subtracts them back out. Doing that here would double-count: on this wire
    // `input_tokens` already excludes both cache counters.
    expect(mapMessageUsage({
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 50,
    })).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 1_070,
      cacheReadTokens: 900,
      cacheWriteTokens: 50,
    })
  })

  it('omits a counter the wire did not report rather than claiming zero', () => {
    expect(mapMessageUsage({ input_tokens: 5, output_tokens: 2 })).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
    })
  })

  it('totals the full call, which is what the 100K tier is measured against', () => {
    // The threshold counts every input token of the request INCLUDING cache
    // reads and writes, so the total must include them too -- this is the number
    // an operator reads to see which side of the price cliff a turn landed on.
    const usage = mapMessageUsage({ input_tokens: 99_000, output_tokens: 10, cache_read_input_tokens: 2_000 })
    expect(usage.totalTokens).toBe(101_010)
  })

  it('omits the total rather than emitting a lossy one for absurd counts', () => {
    const usage = mapMessageUsage({ input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 10 })
    expect(usage.inputTokens).toBe(Number.MAX_SAFE_INTEGER)
    expect(usage.totalTokens).toBeUndefined()
  })
})

describe('messages stop reasons', () => {
  it('maps the two clean stops and the two shaped finishes', () => {
    expect(mapStopReason('end_turn')).toEqual({ kind: 'stop' })
    expect(mapStopReason('stop_sequence')).toEqual({ kind: 'stop' })
    expect(mapStopReason('tool_use')).toEqual({ kind: 'tool-calls' })
    expect(mapStopReason('max_tokens')).toEqual({ kind: 'max-tokens' })
  })

  it('reports the reasons it cannot honour as errors that name themselves', () => {
    // `pause_turn` in particular is NOT a clean stop: the model suspended a
    // long-running turn and expects the caller to continue it, so reporting it
    // as success would silently truncate the answer.
    expect(mapStopReason('pause_turn')).toMatchObject({ kind: 'error', failure: { code: 'PAUSE_TURN' } })
    expect(mapStopReason('refusal')).toMatchObject({ kind: 'error', failure: { code: 'REFUSAL' } })
  })
})

describe('messages SSE translation', () => {
  it('translates a text turn and closes on message_stop', async () => {
    const chunks = await collect(textEvents('hello'))
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'hello' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'hello' } },
      { type: 'usage', usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('tolerates the split payloads a network split produces', async () => {
    // The SSE reader must reassemble an event from arbitrarily cut transport
    // chunks; a 7-byte cut lands mid-event on purpose.
    const whole = await collect(textEvents('hello'))
    const split = await collect(textEvents('hello'), 7)
    expect(split).toEqual(whole)
  })

  it('assembles a tool call whose arguments arrive as JSON fragments', async () => {
    // The arguments are streamed as `input_json_delta` pieces of a JSON string,
    // and the block-end must carry the reassembled string the harness reads.
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 9 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a.ts"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      { type: 'message_stop' },
    ])
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index: 0,
        id: 'toolu_1',
        name: 'read_file',
        argumentsDelta: '{"path":',
      },
      {
        type: 'tool-call-delta',
        index: 0,
        id: 'toolu_1',
        name: 'read_file',
        argumentsDelta: '"a.ts"}',
      },
      {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: 'toolu_1', name: 'read_file', arguments: '{"path":"a.ts"}' },
      },
      { type: 'usage', usage: { inputTokens: 9, outputTokens: 0, totalTokens: 9 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('streams a thinking block as reasoning and never as text', async () => {
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 4 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hm' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'hi' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect(chunks.filter(chunk => chunk.type === 'reasoning-delta')).toEqual([
      { type: 'reasoning-delta', index: 0, text: 'hm' },
    ])
    // The signature is the provider's, not model-visible text, so it must not
    // leak into the block the harness displays.
    expect(chunks).toContainEqual({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'hm' } })
  })

  it('skips redacted thinking rather than half-translating it', async () => {
    const chunks = await collect([
      { type: 'content_block_start', index: 0, content_block: { type: 'redacted_thinking' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'nope' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ])
    expect(chunks.some(chunk => chunk.type === 'text-delta')).toBe(false)
    expect(chunks.some(chunk => chunk.type === 'block-end')).toBe(false)
  })

  it('ignores keepalives and deltas for a block that never opened', async () => {
    const chunks = await collect([
      { type: 'ping' },
      { type: 'content_block_delta', index: 9, delta: { type: 'text_delta', text: 'orphan' } },
      ...textEvents('ok'),
    ])
    expect(chunks.filter(chunk => chunk.type === 'text-delta')).toEqual([{ type: 'text-delta', index: 0, text: 'ok' }])
  })

  it('refines the prompt usage from message_start with the output count from message_delta', async () => {
    // Usage arrives split across two events. A late event that omits a counter
    // must not erase the earlier report, and the zero output count on
    // message_start is not a report that the turn produced nothing.
    const chunks = await collect(textEvents('ok'))
    expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([
      { type: 'usage', usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } },
    ])
  })
})

describe('messages stream completion', () => {
  it('accepts a stream that closes right after the stop reason', async () => {
    // Some gateways close the body instead of sending their own terminal event,
    // and a `stop_reason` is the upstream's completion signal -- the same
    // tolerance the chat translator extends to a sentinel-less Go route.
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 3 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'done' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ])
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('refuses a stream that ends with no terminal event and no stop reason', async () => {
    const { error } = await collectUntilFailure([
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } },
    ])
    expect(error).toMatchObject({ code: 'STREAM_CLOSED' })
  })

  it('never emits a block-end for a truncated stream', async () => {
    // The endpoint controls both the arguments and the disconnect point, so a
    // complete-looking prefix followed by a cut must not be executed as a tool's
    // arguments.
    const { chunks } = await collectUntilFailure([
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'rm' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":"/"' } },
    ])
    expect(chunks.some(chunk => chunk.type === 'block-end')).toBe(false)
  })

  it('reports a reasoning-only stop as the retryable EMPTY_RESPONSE error', async () => {
    // A turn that ends after reasoning alone is indistinguishable from a hang,
    // and EMPTY_RESPONSE is on the retryable list.
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 2 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'model ended the turn after reasoning without a reply or a tool call', code: 'EMPTY_RESPONSE' },
      },
    })
  })

  it('reports a turn that stopped with no content at all as EMPTY_RESPONSE', async () => {
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 2 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'model returned a completed response with no content' } },
    })
  })

  it('does not mask a max_tokens finish as an empty response', async () => {
    // Only a clean `stop` is degenerate. A length-truncated turn is a real
    // outcome the caller must see, even with no content to show for it.
    const chunks = await collect([
      { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
      { type: 'message_stop' },
    ])
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'max-tokens' } })
  })

  it('raises a malformed payload instead of skipping it', async () => {
    const iterator = translateMessages(parseSseUntilEof(sseStream('data: {not json\n\n')))[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('raises an upstream error event as a SERVER failure', async () => {
    const { error } = await collectUntilFailure([
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    ])
    expect(error).toMatchObject({ code: 'SERVER', message: 'Overloaded' })
  })

  it('emits nothing after finish', async () => {
    const chunks = await collect([
      ...textEvents('ok'),
      { type: 'content_block_start', index: 5, content_block: { type: 'text' } },
    ])
    expect(chunks.at(-1)).toMatchObject({ type: 'finish' })
    expect(chunks.findIndex(chunk => chunk.type === 'finish')).toBe(chunks.length - 1)
  })
})

describe('messages connection and dispatch', () => {
  it('adds the api-key and version headers the wire requires, keeping the bearer', () => {
    // Command Code accepts either header; OpenCode Go's Anthropic routes read
    // the api-key one and ignore a bearer. Sending both is what lets one code
    // path serve both families without a per-family switch.
    const connection = messagesConnection({
      baseURL: 'https://api.commandcode.ai/provider',
      apiKey: 'sk-test',
      headers: { 'x-opencode-session': 'sess' },
    })
    expect(connection.headers).toMatchObject({
      'x-api-key': 'sk-test',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-opencode-session': 'sess',
    })
    // The bearer lives on the connection itself, not in this header bag.
    expect(connection.apiKey).toBe('sk-test')
  })

  it('posts to the messages path with both auth headers and streams the answer', async () => {
    const seen: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(sseBody(textEvents('hi')), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }))
    const chunks: StreamChunk[] = []
    for await (const chunk of streamMessages(
      { baseURL: 'https://api.commandcode.ai/provider', apiKey: 'sk-test' },
      base,
      'claude-haiku-5-5',
    )) {
      chunks.push(chunk)
    }
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('https://api.commandcode.ai/provider/v1/messages')
    const headers = new Headers(seen[0]?.init.headers)
    expect(headers.get('x-api-key')).toBe('sk-test')
    expect(headers.get('anthropic-version')).toBe(ANTHROPIC_VERSION)
    expect(headers.get('authorization')).toBe('Bearer sk-test')
    expect(headers.get('accept')).toBe('text/event-stream')
    expect(JSON.parse(String(seen[0]?.init.body))).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: DEFAULT_MAX_TOKENS,
      stream: true,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })
})

/**
 * The wire is only useful if dispatch actually reaches it.
 *
 * `streamMessages` was already exercised above, but nothing asserted that the
 * ADAPTER routes a Go turn to it — removing the branch in `protocolCall`, or
 * dropping the registry entry's `protocol`, would have left every test above
 * green while every real request went to a surface the model refuses.
 * `NO_ADAPTER` appeared in no test at all before this, which is exactly how the
 * dispatch branch went uncovered while `protocol: 'messages'` sat unimplemented.
 */
describe('messages dispatch through the adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes a Go claude-haiku-5-5 turn to /v1/messages with both auth headers', async () => {
    const seen: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      if (String(url).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'claude-haiku-5-5' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(sseBody(textEvents('hi')), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }))
    const options = resolveAdapterOptions(
      { groups: { go: { enabled: true, apiKey: 'OPENCODE_GO_API_KEY' } } },
      OPENCODE_GO,
    )
    const adapter = new ProtocomAdapter({ options: () => options, resolveApiKey: async () => 'oc_sk_test' })

    const listed = await adapter.listModels('opencode-go-sub')
    // The cheap tier is both OFFERED and first, so the menu leads with the
    // budget that keeps the turn under the 5x price cliff. The 1M window stays
    // available beside it -- the rung widens the choice, it does not narrow it.
    expect(listed.map(model => model.id).filter(id => id.startsWith('claude-haiku-5-5')))
      .toEqual([
        'claude-haiku-5-5::ctx@100000',
        'claude-haiku-5-5::ctx@204800',
        'claude-haiku-5-5::ctx@262144',
        'claude-haiku-5-5::ctx@409600',
        'claude-haiku-5-5::ctx@1000000',
      ])
    // The label says which base the figure is in, because 102,400 renders as
    // "100K" and an operator cannot otherwise tell which line they are buying.
    expect(listed.find(model => model.id === 'claude-haiku-5-5::ctx@100000')?.name)
      .toBe('Claude Haiku 5.5 [100K (dec)]')
    // models.dev publishes `text,image,pdf` input, so the row declares image.
    expect(listed.find(model => model.id === 'claude-haiku-5-5::ctx@100000')?.inputModalities)
      .toEqual(['text', 'image'])

    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.stream({
      provider: 'opencode-go-sub',
      model: 'claude-haiku-5-5::ctx@100000',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as unknown as GenerateOptions)) {
      chunks.push(chunk)
    }

    const sent = seen.filter(entry => !entry.url.endsWith('/models'))
    expect(sent).toHaveLength(1)
    // The variant suffix is stripped: the wire names the upstream id, not the
    // menu's `<id>::ctx@<tokens>` spelling.
    expect(sent[0]?.url).toBe('https://opencode.ai/zen/go/v1/messages')
    const headers = new Headers(sent[0]?.init.headers)
    expect(headers.get('x-api-key')).toBe('oc_sk_test')
    expect(headers.get('authorization')).toBe('Bearer oc_sk_test')
    expect(headers.get('anthropic-version')).toBe(ANTHROPIC_VERSION)
    // The Go gateway refuses a session-less request on some paths.
    expect(headers.get('x-opencode-session')).not.toBeNull()
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual({
      model: 'claude-haiku-5-5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      max_tokens: DEFAULT_MAX_TOKENS,
      stream: true,
    })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('keeps the group default for a Go model that declares no messages override', async () => {
    // The gate's other half: only the models whose entries say `messages` move
    // to that wire. A regression that sent the whole group there would break
    // every model whose endpoint serves chat-completions, so the chat path is
    // asserted here rather than assumed.
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen.push(String(url))
      return new Response('data: {"choices":[{"index":0,"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }))
    const options = resolveAdapterOptions(
      { groups: { go: { enabled: true, apiKey: 'OPENCODE_GO_API_KEY' } } },
      OPENCODE_GO,
    )
    const adapter = new ProtocomAdapter({ options: () => options, resolveApiKey: async () => 'oc_sk_test' })
    for await (const _chunk of adapter.stream({
      provider: 'opencode-go-sub',
      model: 'glm-5.3',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as unknown as GenerateOptions)) {
      // Drain: the request shape is the assertion.
    }
    expect(seen).toEqual(['https://opencode.ai/zen/go/v1/chat/completions'])
  })
})

/**
 * Stream integrity: the endpoint controls both the content and the disconnect
 * point, so a stream that LOOKS complete must not be reported as one when the
 * wire never confirmed it.
 *
 * Every case below was found by adversarial review AFTER the feature was
 * written and passing 45 tests, so they are the tests that were missing rather
 * than the ones that were wrong. Two are integrity (a truncated tool call, and
 * an empty block masking the retryable empty-response code), two are accounting
 * (a merged total escaping validation, and a zero erasing a real cache count),
 * and two are malformed-stream tolerance (a delta whose type disagrees with its
 * block, and a duplicate block start).
 */
describe('messages stream integrity', () => {
  it('refuses to complete a tool call the wire never closed', async () => {
    // `message_stop` proves the STREAM ended, not that the call finished. A cut
    // mid-`input_json_delta` leaves arguments that are a half-written JSON
    // string, and the harness's own argument parser degrades to handing that raw
    // fragment to the tool rather than refusing -- so `rm -rf /tmp/victim` must
    // never be completed. The call is dropped and the finish reports the
    // truncation instead of `tool-calls`.
    const events = [
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'bash' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command":"rm -rf /tmp/victim"' } },
      { type: 'message_stop' },
    ]
    const chunks = await collect(events)
    expect(chunks.some(chunk => chunk.type === 'block-end')).toBe(false)
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'STREAM_CLOSED' } },
    })
    // The same must hold on the tolerated EOF path, where a `stop_reason`
    // arrives and the body then closes without a terminal event.
    const eof = await collect(events.slice(1, 3).concat([{ type: 'message_delta', delta: { stop_reason: 'tool_use' } }] as never))
    expect(eof.some(chunk => chunk.type === 'block-end')).toBe(false)
    expect(eof.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'STREAM_CLOSED' } } })
  })

  it('completes a tool call the wire did close', async () => {
    // The other half of the guard: a normal call must still be delivered. A
    // check that rejected every tool call would be worse than the defect.
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'bash' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command":"ls"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      { type: 'message_stop' },
    ])
    expect(chunks.find(chunk => chunk.type === 'block-end')).toEqual({
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: 'toolu_1', name: 'bash', arguments: '{"command":"ls"}' },
    })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('treats an empty text block as no reply, not as a reply', async () => {
    // A `content_block_start` with no delta after it opens a container that
    // carries nothing. Counting it as model-visible output reported success for
    // a turn that said nothing -- suppressing the retryable EMPTY_RESPONSE, and
    // with it the retry. The identical turn with no block at all already errored
    // (asserted above in "reports a turn that stopped with no content at all").
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE', message: 'model returned a completed response with no content' } },
    })
  })

  it('still accepts a text block that did carry content', async () => {
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('never emits a total that disagrees with the counters beside it', async () => {
    // The merged path rebuilt the total inline and skipped the safety check the
    // single-report path applies, so absurd counts produced an unsafe-integer
    // total -- the number the 100K billing tier is measured against. Fields and
    // total are now validated together.
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 10 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } },
      { type: 'message_stop' },
    ])
    const usage = chunks.find(chunk => chunk.type === 'usage')
    expect(usage).toEqual({
      type: 'usage',
      usage: { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 20 },
    })
    // A fractional counter must not yield a fractional total either.
    const fractional = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 10.5 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ])
    expect(fractional.find(chunk => chunk.type === 'usage')).toEqual({
      type: 'usage',
      usage: { inputTokens: 100, outputTokens: 5, cacheReadTokens: 10.5 },
    })
  })

  it('does not let a zeroed later report erase a real cache count', async () => {
    // A Go-struct relay that zero-fills its optional cache fields on
    // `message_delta` must not erase what `message_start` reported: 900 cache
    // reads vanishing takes the total (and the 100K tier it feeds) with it. A
    // reported zero is treated like an omitted counter, for both cache fields --
    // the same tolerance the input and output counters already had.
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 900 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      { type: 'message_stop' },
    ])
    expect(chunks.find(chunk => chunk.type === 'usage')).toEqual({
      type: 'usage',
      usage: { inputTokens: 100, outputTokens: 7, totalTokens: 1007, cacheReadTokens: 900 },
    })
  })

  it('files a delta under the block it names, never across kinds', async () => {
    // The delta's type must agree with its block. Routing on the type alone put
    // reasoning text into a text block's `text`, printing the model's private
    // scratch work as the visible answer.
    const leaked = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'visible' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'secret plan' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect(leaked.some(chunk => chunk.type === 'reasoning-delta')).toBe(false)
    expect(leaked.find(chunk => chunk.type === 'block-end')).toMatchObject({ type: 'block-end', block: { type: 'text', text: 'visible' } })
    // And the mirror: an argument fragment must not land in visible text.
    const misfiled = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect(misfiled.some(chunk => chunk.type === 'tool-call-delta')).toBe(false)
  })

  it('ignores a second block start for an index that is already open', async () => {
    // A duplicate start opened a second harness block and left the first closed
    // as a phantom call with empty arguments -- which the executor then runs.
    const chunks = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'a', name: 'f' } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'b', name: 'g' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      { type: 'message_stop' },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-start')).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'a', name: 'f', arguments: '{}' } },
    ])
  })
})
