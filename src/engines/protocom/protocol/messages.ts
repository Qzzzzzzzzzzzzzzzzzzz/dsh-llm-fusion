/**
 * Anthropic Messages wire protocol (`POST /v1/messages`): request serialization
 * and SSE translation into harness StreamChunks, beside the two OpenAI
 * protocols this plugin already speaks.
 *
 * This wire is not optional decoration. Two families serve models on it and
 * NOWHERE else, so before it existed those models were hidden from the menu
 * entirely rather than listed and failing:
 *
 *  - **Command Code.** Of the 89 rows the live listing returned (2026-10-08),
 *    every Claude id declares `supported_endpoints: ["/messages"]` and answers
 *    400 on any OpenAI wire.
 *  - **OpenCode Go.** The vendor's own endpoints table maps `claude-haiku-5-5`
 *    to `https://opencode.ai/inference/go/v1/messages` with `@ai-sdk/anthropic`;
 *    the same call on the chat surface fails as an unsupported model protocol.
 *
 * Four wire facts drive the differences from the OpenAI protocols, each of them
 * load-bearing rather than stylistic:
 *
 *  1. `max_tokens` is REQUIRED. The OpenAI surfaces treat it as optional, so a
 *     request assembled without one must still be made valid here.
 *  2. The system prompt is a TOP-LEVEL parameter, not a message, and the message
 *     list must not start with an assistant turn.
 *  3. A tool call's arguments are a JSON OBJECT on the wire, not the string the
 *     harness carries, and a tool result is a `tool_result` content block on a
 *     USER message rather than its own role.
 *  4. Usage is already DISJOINT: `input_tokens` excludes cache reads and cache
 *     writes, which arrive as their own two counters. The OpenAI surfaces fold
 *     cache hits into a prompt total and this plugin subtracts them back out;
 *     nothing is subtracted here.
 *
 * @module dsh-protocom-api/protocol/messages
 */

import { contentHasImage, EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type {
  ContentBlock,
  FinishReason,
  GenerateOptions,
  Message,
  RequestMessage,
  StreamChunk,
  TokenUsage,
} from '@deepseek-ai/dsh-llm'
import { parseSseUntilEof } from '../sse.ts'
import { postSse } from './http.ts'
import type { ProtocolConnection, RequestImageUrls } from './http.ts'

export type { RequestImageUrls } from './http.ts'

/**
 * The Anthropic API version this plugin speaks.
 *
 * The header is REQUIRED by the Messages wire; a request without it is refused
 * before the model is ever reached. `2023-06-01` is the version every Anthropic
 * -compatible gateway accepts, including the two this plugin routes to, and the
 * header is a compatibility negotiation rather than a dated snapshot of the
 * schema: later additions (extended thinking, effort) ride the same value.
 */
export const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Wire ceiling used when the caller named none.
 *
 * `max_tokens` has no default on this wire — the request is rejected without
 * it — while the harness leaves the field optional. 8192 is a value every model
 * this plugin routes to accepts, and it is a CEILING rather than a request: a
 * turn that finishes early costs nothing for the headroom.
 */
export const DEFAULT_MAX_TOKENS = 8_192

/**
 * The connection this wire must use.
 *
 * Anthropic-compatible routes authenticate with `x-api-key`, which the shared
 * transport does not send. The bearer header is kept BESIDE it rather than
 * replaced, because the two gateways this plugin reaches disagree about which
 * one they read — Command Code accepts either, while OpenCode Go's Anthropic
 * routes read the api-key header and silently ignore a bearer — and sending both
 * is what makes one code path work on both without a per-family switch.
 * A provider that rejected the extra header would be the only reason to split
 * this, and neither of the two does.
 * @param connection - the frozen connection facts for this request.
 * @returns a connection with the Messages-wire headers merged in.
 */
export function messagesConnection(connection: ProtocolConnection): ProtocolConnection {
  return {
    ...connection,
    headers: {
      ...connection.headers,
      'x-api-key': connection.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
  }
}

/** Token accounting exactly as the Messages wire reports it. */
export interface MessageUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * Map wire usage onto the harness's disjoint counts.
 *
 * Nothing is subtracted: this wire already reports cache reads and cache writes
 * as their own counters, disjoint from `input_tokens` — the opposite of the
 * OpenAI surfaces, whose prompt total folds them in. `totalTokens` is therefore
 * the exact full-call sum, and it is the number the 100K billing tier is
 * measured against.
 */
export function mapMessageUsage(usage: MessageUsage): TokenUsage {
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const read = usage.cache_read_input_tokens
  const write = usage.cache_creation_input_tokens
  const combined = input + output + (read ?? 0) + (write ?? 0)
  const exact = [input, output, read ?? 0, write ?? 0].every(count => Number.isSafeInteger(count) && count >= 0)
    && Number.isSafeInteger(combined)
  return {
    inputTokens: input,
    outputTokens: output,
    ...exact ? { totalTokens: combined } : {},
    ...read === undefined ? {} : { cacheReadTokens: read },
    ...write === undefined ? {} : { cacheWriteTokens: write },
  }
}

/**
 * Map the wire `stop_reason` onto the harness FinishReason.
 *
 * `end_turn` and `stop_sequence` are both a clean stop. `pause_turn` is NOT:
 * it means the model suspended a long-running turn and expects the caller to
 * continue it, so reporting it as a successful stop would silently truncate the
 * answer. It becomes an error that names itself, exactly as an unrecognised
 * value does.
 */
export function mapStopReason(reason: string): FinishReason {
  switch (reason) {
    case 'end_turn': return { kind: 'stop' }
    case 'stop_sequence': return { kind: 'stop' }
    case 'tool_use': return { kind: 'tool-calls' }
    case 'max_tokens': return { kind: 'max-tokens' }
    default:
      return {
        kind: 'error',
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
      }
  }
}

/** One content block on the wire. */
type WireBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: Record<string, unknown> }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

/** One conversation message on the wire. */
interface WireMessage {
  role: 'user' | 'assistant'
  content: WireBlock[]
}

function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks.filter(block => block.type === 'text').map(block => block.text).join('')
}

/**
 * The source object one retained image resolves to.
 *
 * The adapter hands every retained image over as the inline `data:` URL the
 * OpenAI surfaces accept verbatim, so the common path parses that URL into the
 * base64 pair this wire wants. A plain `https:` reference is carried as a URL
 * source instead, which the wire also accepts: neither gateway this plugin
 * reaches was observed producing one, but dropping an image the caller supplied
 * would be worse than sending a form the wire defines.
 */
function imageSource(url: string): Record<string, unknown> | undefined {
  const data = /^data:([^;,]+);base64,(.*)$/s.exec(url)
  if (data !== null && data[1] !== undefined && data[2] !== undefined) {
    return { type: 'base64', media_type: data[1], data: data[2] }
  }
  if (/^https?:\/\//.test(url)) return { type: 'url', url }
  return undefined
}

/** The image blocks one message's content resolves to, in order. */
function imageBlocks(blocks: readonly ContentBlock[], images: RequestImageUrls | undefined): WireBlock[] {
  const out: WireBlock[] = []
  if (images === undefined || images.size === 0) return out
  for (const block of blocks) {
    if (block.type !== 'image') continue
    const url = images.get(String(block.attachment.attachmentId))
    if (url === undefined) continue
    const source = imageSource(url)
    if (source !== undefined) out.push({ type: 'image', source })
  }
  return out
}

/**
 * The words that carry a tool result's image across to the user turn that
 * delivers it, mirroring the chat-completions bridge for the same reason.
 *
 * A `tool_result` block accepts only text and image content, so an image COULD
 * ride inside it — but the two blocks of one parallel run must stay adjacent,
 * and the safest shape is the one the chat path already had to adopt after
 * measuring both routes: the image travels on the user turn that follows the
 * whole tool run. Keeping the two protocols consistent also means one defect
 * report describes both.
 */
const TOOL_IMAGE_BRIDGE = 'The image returned by the tool call above:'

/**
 * One harness message as the wire messages it becomes.
 *
 * `system` and `developer` are handled by the caller, which hoists system text
 * into the top-level parameter and replays a developer update at its own
 * position: a mid-conversation instruction has no `system` slot on this wire,
 * and re-attributing it as model output (which a naive else-branch would do)
 * would put words in the model's mouth.
 */
function wireMessage(message: RequestMessage, images: RequestImageUrls | undefined): WireMessage[] {
  if (message.role === 'developer') {
    return [{ role: 'user', content: [{ type: 'text', text: flattenText(message.content) }] }]
  }
  if (message.role === 'user') {
    return [{ role: 'user', content: userBlocks(message.content, images) }]
  }
  if (message.role === 'tool') {
    const text = flattenText(message.content)
    const block: WireBlock = {
      type: 'tool_result',
      tool_use_id: String(message.toolCallId),
      content: text,
      // The wire's own failure flag. Sending the text alone loses the
      // distinction between a tool that answered and one that failed, which is
      // information the model uses.
      ...message.isError === true ? { is_error: true } : {},
    }
    const retained = imageBlocks(message.content, images)
    if (retained.length === 0) return [{ role: 'user', content: [block] }]
    return [
      { role: 'user', content: [block] },
      { role: 'user', content: [{ type: 'text', text: TOOL_IMAGE_BRIDGE }, ...retained] },
    ]
  }
  throw new LlmError('assistant messages are serialized by assistantTurns()', 'INVALID_REQUEST')
}

/** One user message's content: its text, then every image this request retained. */
function userBlocks(blocks: readonly ContentBlock[], images: RequestImageUrls | undefined): WireBlock[] {
  const text = flattenText(blocks)
  const parts: WireBlock[] = text.length > 0 ? [{ type: 'text', text }] : []
  parts.push(...imageBlocks(blocks, images))
  // An empty content array is a wire error, and the text is what keeps a
  // replayed turn faithful when every image failed to resolve.
  return parts.length === 0 ? [{ type: 'text', text }] : parts
}

/**
 * A tool call's arguments as the OBJECT this wire requires.
 *
 * The harness carries arguments as the JSON string the model streamed, and the
 * wire wants the parsed value. A string that does not parse — a truncated
 * stream, a model that emitted prose — becomes an empty object rather than
 * failing the whole request: the tool call is still real, its name and id are
 * still correct, and one malformed call must not cost the turn.
 */
function toolInput(argumentsJson: string): unknown {
  if (argumentsJson.trim().length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(argumentsJson)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The wire messages one assistant turn becomes.
 *
 * Reasoning blocks are NOT replayed. Extended thinking comes back to the
 * provider as a signed block, and a stateless client cannot reconstruct the
 * signature, so the wire refuses one that arrives without it. The harness
 * supplies reasoning blocks for display; they stay on this side of the wire.
 */
function assistantTurns(message: Message): WireMessage[] {
  if (contentHasImage(message.content)) {
    throw new LlmError(
      'The protocom-api messages adapter does not support image content on an assistant message.',
      'UNSUPPORTED_CONTENT',
    )
  }
  const blocks: WireBlock[] = []
  const text = flattenText(message.content)
  if (text.length > 0) blocks.push({ type: 'text', text })
  for (const block of message.content) {
    if (block.type !== 'tool-call') continue
    blocks.push({ type: 'tool_use', id: String(block.id), name: block.name, input: toolInput(block.arguments) })
  }
  return [{ role: 'assistant', content: blocks }]
}

/**
 * Merge any run of same-role wire messages into one.
 *
 * The wire requires the roles to alternate and a tool result to answer the
 * `tool_use` block in the immediately preceding assistant turn. A parallel tool
 * run produces several user messages in a row, and a bridged image adds one
 * more; coalescing keeps the exchange valid without moving the blocks, which is
 * what preserves the call/result adjacency.
 *
 * A leading assistant turn is impossible for a request the harness assembles
 * (the derived history opens with the system prompt) but IS possible for a
 * trimmed conversation, and the wire refuses it outright. It is dropped rather
 * than reordered: a leading assistant turn carries no context the model needs.
 */
function coalesce(messages: WireMessage[]): WireMessage[] {
  const out: WireMessage[] = []
  for (const message of messages) {
    const last = out[out.length - 1]
    if (last !== undefined && last.role === message.role) {
      last.content.push(...message.content)
      continue
    }
    if (out.length === 0 && message.role === 'assistant') continue
    out.push({ role: message.role, content: [...message.content] })
  }
  return out
}

/**
 * The thinking-control fields one request spells.
 *
 * Effort is the knob these models actually publish (models.dev lists
 * `{type:'effort', values:['low','medium','high','xhigh','max']}` for
 * `claude-haiku-5-5`), and on the current Messages wire it rides
 * `output_config.effort`. The disabling words the plugin's vocabularies already
 * use for the other surfaces (`none`, `off`) map to the wire's own
 * `thinking: {type:'disabled'}`.
 *
 * This is the one detail of this module that a live request has not confirmed
 * from this plugin, because no credential for either family was available when
 * it was written. It is isolated here, one expression wide, precisely so that a
 * deployment which measures something else changes one line instead of
 * unpicking the protocol — the same treatment `CLINEPASS.chatThinking` records
 * for its own unverified spelling.
 */
export function resolveMessagesThinking(effort: string | undefined): Record<string, unknown> {
  if (effort === undefined) return {}
  if (effort === 'none' || effort === 'off') return { thinking: { type: 'disabled' } }
  return { output_config: { effort } }
}

/**
 * Serialize one request into the Messages wire body.
 * @param options - the assembled request.
 * @param model - the upstream model id.
 * @param images - provider-ready image URLs, keyed by attachment id.
 * @returns the wire body.
 */
export function serializeMessagesRequest(
  options: GenerateOptions,
  model: string,
  images?: RequestImageUrls,
): Record<string, unknown> {
  // The system prompt is a top-level parameter here, so both spellings the
  // harness uses for it — the one-shot `system` string and a system-role
  // message in the derived history — land in the same slot.
  const system: string[] = []
  if (options.system !== undefined && options.system.length > 0) system.push(options.system)
  const messages: WireMessage[] = []
  // A tool result's image rides a user turn that FOLLOWS the result, and that
  // turn is held back until its whole parallel run has landed — the same rule
  // the chat-completions serializer documents at length. Emitting it inline
  // splits `assistant(tool_use:[A,B]) -> user(tool_result A) -> user(bridge)`,
  // and a result that no longer directly answers its call is a wire error every
  // later request of the conversation repeats.
  const pendingBridges: WireMessage[] = []
  for (const message of options.messages) {
    if (message.role === 'system') {
      const text = flattenText(message.content)
      if (text.length > 0) system.push(text)
      continue
    }
    const wire = message.role === 'assistant' ? assistantTurns(message) : wireMessage(message, images)
    if (message.role !== 'tool') {
      messages.push(...pendingBridges.splice(0), ...wire)
      continue
    }
    const first = wire[0]
    if (first !== undefined) messages.push(first)
    pendingBridges.push(...wire.slice(1))
  }
  messages.push(...pendingBridges)
  return {
    model,
    messages: coalesce(messages),
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: true,
    ...system.length === 0 ? {} : { system: system.join('\n\n') },
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.stop === undefined || options.stop.length === 0 ? {} : { stop_sequences: [...options.stop] },
    ...options.tools === undefined || options.tools.length === 0
      ? {}
      : {
        tools: options.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })),
      },
    ...resolveMessagesThinking(options.reasoningEffort),
  }
}

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  callId?: string | undefined
  name?: string | undefined
  /**
   * Whether the wire closed this block with its own `content_block_stop`.
   *
   * This is the per-call completion proof, and it is load-bearing for tool
   * calls only. `message_stop` proves the STREAM ended, not that each open block
   * finished: an endpoint chooses a command's arguments by choosing when to
   * disconnect, so a stream cut mid-`input_json_delta` would otherwise complete
   * a tool call whose arguments are a half-written JSON string. The harness then
   * hands that raw fragment to the tool, because its own argument parser
   * degrades to the unstripped string rather than refusing.
   *
   * The responses translator carries the identical marker for the identical
   * reason (`function_call_arguments.done`).
   */
  complete: boolean
}

/**
 * A later counter, unless it is a zero the earlier event already answered.
 *
 * Zero is not evidence: an unset optional struct field serializes as 0, so a
 * `message_delta` reporting `cache_read_input_tokens: 0` cannot mean "this turn
 * read nothing from cache" when the prompt event reported 900. See `mergeUsage`.
 */
function positiveOr(later: number | undefined, earlier: number | undefined): number | undefined {
  if (later !== undefined && later > 0) return later
  return earlier
}

function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: ToolCallId(block.callId ?? ''),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}

/** One streamed event on the wire. */
interface WireEvent {
  type?: string
  index?: number
  message?: { usage?: MessageUsage }
  usage?: MessageUsage
  delta?: { type?: string; text?: string; thinking?: string; partial_json?: string; stop_reason?: string | null }
  content_block?: { type?: string; id?: string; name?: string }
  error?: { type?: string; message?: string }
}

/**
 * Consume Messages SSE payloads and yield StreamChunks.
 *
 * Completion is the wire's own `message_stop` event, and the stream is read
 * until EOF rather than to a `[DONE]` sentinel: this wire never sends one.
 * Reaching EOF without a terminal event is a truncated response, EXCEPT when a
 * `stop_reason` already arrived — some gateways close right after the
 * `message_delta` that carries it, and that reason is the upstream's own
 * completion signal (the same tolerance the chat translator extends to a Go
 * route that closes without its sentinel).
 *
 * A `stop` with nothing model-visible to show — no text and no tool call — is
 * reported as `EMPTY_RESPONSE` rather than success, for the reason the chat
 * translator documents: a turn that ends after reasoning alone is indistinguish-
 * able from a hang, and that code is on the retryable list.
 */
export async function* translateMessages(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  const open = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let pendingFinish: FinishReason | undefined
  let pendingUsage: TokenUsage | undefined
  let stopped = false

  function openBlock(index: number, kind: OpenBlock['kind']): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: '', complete: false }
    open.set(index, block)
    order.push(block)
    return block
  }

  /**
   * The finish a truncated stream reports, in place of the settled one.
   *
   * A tool call the wire never closed is dropped and the finish becomes an
   * error, so the retry layer sees a cut stream instead of `tool-calls` reaching
   * the tool executor with a partial command. A reason that is ALREADY an error
   * stands: it is more specific than the truncation and must not be masked.
   */
  function truncationReason(settled: FinishReason): FinishReason {
    if (settled.kind === 'error') return settled
    return {
      kind: 'error',
      failure: {
        message: 'messages stream carried a tool call whose arguments never completed',
        code: 'STREAM_CLOSED',
      },
    }
  }

  /**
   * Usage arrives split across two events — `message_start` carries the prompt
   * counters and `message_delta` the final output count — so the later event
   * refines the earlier one rather than replacing it. A counter the later event
   * omits is kept.
   *
   * A reported ZERO is treated like an omitted counter, for the cache fields as
   * well as the token counts, because neither event can assert "this turn used
   * none of X" from a zero that may just be an unset struct field. A Go-struct
   * relay that zero-fills its optional cache counters on `message_delta` would
   * otherwise erase the real count `message_start` reported, taking the total
   * that the 100K billing tier is measured on with it.
   *
   * The total is REBUILT from the merged counters and re-validated here rather
   * than carried over, so it can neither disagree with the fields beside it nor
   * escape the safety check `mapMessageUsage` applies to a single report.
   */
  function mergeUsage(usage: MessageUsage): void {
    const next = mapMessageUsage(usage)
    const previous = pendingUsage
    if (previous === undefined) {
      pendingUsage = next
      return
    }
    const inputTokens = next.inputTokens > 0 ? next.inputTokens : previous.inputTokens
    const outputTokens = next.outputTokens > 0 ? next.outputTokens : previous.outputTokens
    const cacheReadTokens = positiveOr(next.cacheReadTokens, previous.cacheReadTokens)
    const cacheWriteTokens = positiveOr(next.cacheWriteTokens, previous.cacheWriteTokens)
    const combined = inputTokens + outputTokens + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0)
    const exact = [inputTokens, outputTokens, cacheReadTokens ?? 0, cacheWriteTokens ?? 0]
      .every(count => Number.isSafeInteger(count) && count >= 0)
      && Number.isSafeInteger(combined)
    pendingUsage = {
      inputTokens,
      outputTokens,
      ...exact ? { totalTokens: combined } : {},
      ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
      ...cacheWriteTokens === undefined ? {} : { cacheWriteTokens },
    }
  }

  function* closeOut(): Generator<StreamChunk> {
    // A tool call the wire never closed is dropped rather than completed. The
    // block-start already went out, so the harness sees a started-but-unfinished
    // call; the finish below reports the truncation, which is what keeps a
    // half-written command from being executed.
    let truncated = false
    for (const block of order) {
      if (block.kind === 'tool-call' && !block.complete) {
        truncated = true
        continue
      }
      yield { type: 'block-end', index: block.index, block: closeBlock(block) }
    }
    if (pendingUsage) yield { type: 'usage', usage: pendingUsage }
    yield { type: 'finish', reason: closeOutReason(truncated) }
  }

  function closeOutReason(truncated: boolean): FinishReason {
    const reason = pendingFinish ?? { kind: 'stop' as const }
    if (truncated) return truncationReason(reason)
    // Only a block that actually CARRIED something is model-visible. A
    // `content_block_start` with no delta after it is an empty container, not a
    // reply: counting it as output would report success for a turn that said
    // nothing, and EMPTY_RESPONSE is the retryable code that catches exactly
    // that. The chat translator cannot reach this state because it opens a text
    // block only once a non-empty delta arrives.
    const visible = order.some(block => block.kind !== 'reasoning' && block.text.length > 0)
    if (reason.kind !== 'stop' || visible) return reason
    // Name the shape actually seen, so an operator can tell a model that thought
    // and then stopped apart from one that emitted nothing at all.
    const thought = order.some(block => block.kind === 'reasoning' && block.text.length > 0)
    return {
      kind: 'error',
      failure: {
        message: thought
          ? 'model ended the turn after reasoning without a reply or a tool call'
          : 'model returned a completed response with no content',
        code: EMPTY_RESPONSE_CODE,
      },
    }
  }

  for await (const payload of payloads) {
    let event: WireEvent
    try {
      event = JSON.parse(payload) as WireEvent
    } catch {
      throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    switch (event.type) {
      // Keepalives and the wire's periodic `ping` carry nothing to translate.
      case 'ping':
      case undefined: break
      case 'message_start': {
        if (event.message?.usage) mergeUsage(event.message.usage)
        break
      }
      case 'content_block_start': {
        const index = event.index ?? 0
        const type = event.content_block?.type
        // `redacted_thinking` carries encrypted reasoning this plugin cannot
        // display, and a block type the wire adds later is equally unrenderable;
        // both are skipped rather than half-translated into a text block.
        if (type !== 'text' && type !== 'thinking' && type !== 'tool_use') break
        // A second `content_block_start` for a wire index that is still open is
        // a malformed stream -- likely a gateway retrying a block. Opening a
        // harness block anyway would emit two starts and leave the first closed
        // as a phantom call with empty arguments, which the executor then runs.
        // The open block wins and its identity is not overwritten, so fragments
        // already collected stay attached to the right call.
        if (open.has(index)) break
        const kind = type === 'thinking' ? 'reasoning' : type === 'tool_use' ? 'tool-call' : 'text'
        // A tool call's identity arrives once, here; the arguments follow as
        // `input_json_delta` fragments.
        const block = openBlock(index, kind)
        block.callId = event.content_block?.id
        block.name = event.content_block?.name
        yield { type: 'block-start', index: block.index, blockType: kind }
        break
      }
      case 'content_block_delta': {
        const block = open.get(event.index ?? 0)
        if (block === undefined) break
        const delta = event.delta
        // The delta's TYPE must agree with the block it names, because the two
        // routes carry different kinds of information: a thinking delta is the
        // model's private scratch work and must never be rendered as the
        // assistant's reply, and an argument fragment must never be appended to
        // visible text. A mismatch is a malformed stream, so the fragment is
        // dropped rather than filed under whichever route arrived. Routing on
        // the delta type alone would put `thinking_delta` text into a text
        // block's `text` -- reasoning printed as the answer.
        if (delta?.type === 'text_delta' && block.kind === 'text' && typeof delta.text === 'string') {
          block.text += delta.text
          yield { type: 'text-delta', index: block.index, text: delta.text }
          break
        }
        if (delta?.type === 'thinking_delta' && block.kind === 'reasoning' && typeof delta.thinking === 'string') {
          block.text += delta.thinking
          yield { type: 'reasoning-delta', index: block.index, text: delta.thinking }
          break
        }
        if (delta?.type === 'input_json_delta' && block.kind === 'tool-call' && typeof delta.partial_json === 'string') {
          block.text += delta.partial_json
          yield {
            type: 'tool-call-delta',
            index: block.index,
            id: ToolCallId(block.callId ?? ''),
            ...block.name === undefined ? {} : { name: block.name },
            argumentsDelta: delta.partial_json,
          }
          break
        }
        // `signature_delta` closes a thinking block with the provider's own
        // signature. It is not model-visible text, so it is deliberately not
        // streamed as one.
        break
      }
      case 'content_block_stop': {
        // The wire's own per-block completion proof; see `OpenBlock.complete`.
        const block = open.get(event.index ?? 0)
        if (block !== undefined) block.complete = true
        break
      }
      case 'message_delta': {
        if (event.usage) mergeUsage(event.usage)
        const stop = event.delta?.stop_reason
        if (typeof stop === 'string' && stop.length > 0) pendingFinish = mapStopReason(stop)
        break
      }
      case 'message_stop': {
        stopped = true
        break
      }
      case 'error': {
        const message = event.error?.message ?? 'upstream reported an error'
        throw new LlmError(message, 'SERVER', { cause: new Error(event.error?.type ?? 'messages_error') })
      }
      default: break
    }

    // The terminal event closes the turn. Blocks, usage and finish are all
    // deferred to here so that no chunk follows `finish`.
    if (stopped) {
      yield* closeOut()
      return
    }
  }

  if (pendingFinish !== undefined) {
    yield* closeOut()
    return
  }
  throw new LlmError('messages stream ended without a terminal event', 'STREAM_CLOSED')
}

/** Stream one Messages call as harness chunks. */
export async function* streamMessages(
  connection: ProtocolConnection,
  options: GenerateOptions,
  model: string,
  images?: RequestImageUrls,
): AsyncGenerator<StreamChunk> {
  const response = await postSse(
    messagesConnection(connection),
    'messages',
    serializeMessagesRequest(options, model, images),
    options.signal,
  )
  yield* translateMessages(parseSseUntilEof(response.body as ReadableStream<BufferSource>))
}
