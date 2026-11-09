/**
 * The hand-maintained model registry: display names, context capacities,
 * vision support, and reasoning vocabularies for the models the Protocom
 * official API serves, keyed by upstream model id. The registry — not the
 * endpoint's listing — is the catalog of record: every entry is offered even
 * while the listing omits it, so a shrinking or flaky listing cannot silently
 * empty the model menu. Ids the registry does not know still ride along from
 * the listing, with the endpoint's own display name and the fallback context
 * window.
 *
 * The endpoint discloses only `id`, `object`, `created`, `owned_by`, `type`,
 * and `display_name` — no context, modality, or reasoning metadata exists on
 * the wire — so every fact below is hand-maintained from the serving model's
 * own published specification and verified against the endpoint.
 *
 * @module dsh-protocom-api/model-registry
 */

import { variantLengths, withinLadderCeiling } from './context-variants.ts'
import {
  CONTEXT_100K,
  CONTEXT_1M,
  CONTEXT_200K,
  CONTEXT_256K,
  CONTEXT_LADDER,
  GROUP_DEFAULTS,
} from './groups.ts'
import type { GroupKey, GroupReasoning, Protocol } from './groups.ts'
import type { ProviderFamily } from './family.ts'

export { CONTEXT_100K, CONTEXT_1M, CONTEXT_LADDER } from './groups.ts'

/** Reasoning vocabulary one registry model supports. */
export interface RegistryReasoning {
  efforts: readonly string[]
  defaultEffort?: string
}

/** Per-million-token USD prices, when published. */
export interface RegistryPricing {
  input: number
  output: number
  cacheRead?: number
}

/**
 * The wire protocol a gateway-declared endpoint list implies, or undefined when
 * the list names none this plugin can speak.
 *
 * Preference order is chat-completions, then responses, then messages: a model
 * offered on several surfaces is served on the first one this plugin has the
 * richest, best-tested support for, and only a model that declares NO OpenAI
 * surface falls through to the Anthropic wire.
 * @param endpoints - the gateway's own `supported_endpoints` list.
 * @returns the protocol to use, or undefined when nothing here can serve it.
 */
export function protocolForEndpoints(endpoints: readonly string[] | undefined): Protocol | undefined {
  if (endpoints === undefined || endpoints.length === 0) return undefined
  if (endpoints.includes('/chat/completions')) return 'chat-completions'
  if (endpoints.includes('/responses')) return 'responses'
  if (endpoints.includes('/messages')) return 'messages'
  return undefined
}

/**
 * Whether a model is servable at all on the endpoint's own declared surfaces.
 *
 * This is the honesty gate for a family whose gateway publishes
 * `supported_endpoints`: a model advertising only a wire this plugin does not
 * implement is EXCLUDED rather than listed. Listing it would be worse than
 * useless — every call fails with a 400 that looks like a plugin bug rather
 * than a missing capability.
 *
 * All three wires a gateway can declare are implemented, so the gate is now
 * exactly "does any declared surface map to a protocol". `messages` used to be
 * excluded here because the adapter refused it at dispatch; the Anthropic wire
 * is implemented, and excluding it now would hide the models that need it —
 * every Claude id on Command Code and `claude-haiku-5-5` on OpenCode Go declare
 * `/messages` and nothing else.
 * @param model - the upstream row, endpoints included.
 * @returns whether at least one declared endpoint maps to a supported wire.
 */
export function servesDeclaredEndpoints(model: UpstreamModel): boolean {
  if (model.endpoints === undefined || model.endpoints.length === 0) return true
  return protocolForEndpoints(model.endpoints) !== undefined
}

/** One known model: how to recognize it and what to say about it. */
export interface RegistryEntry {
  /** Exact upstream model id. */
  id: string
  displayName: string
  family: string
  /** Combined request/response context capacity in tokens. */
  contextWindow: number
  reasoning?: RegistryReasoning
  /**
   * Whether this model accepts image input through the endpoint. Verified by
   * request, not inferred from the model family.
   */
  vision?: boolean
  /**
   * Provider groups this entry is a *membership source* for. Absent means the
   * entry is metadata only: it is offered wherever the endpoint's own listing
   * names it, and nowhere else. Grouping membership this way is what keeps one
   * group's menu from advertising every other group's models. Group keys are
   * family-scoped (e.g. `codex` for Protocom, `go` for OpenCode Go).
   */
  groups?: readonly string[]
  /**
   * Identity key, when this entry must NOT be aliased with another entry that
   * happens to share its display name.
   *
   * Aliasing exists because one model is often listed under several ids --
   * `glm-5.2` and its vendor-prefixed form, a bare id and a dated snapshot --
   * and a visibility or context choice should cover all of them. The join is by
   * display name, which is normally right and occasionally wrong: the relay's
   * `glm-5.2` and `zai-org/GLM-5.2` share a name, a window and a vocabulary,
   * yet the first answers 400 to a disabled-thinking request and the second
   * answers 200. They are different upstream routes, so a setting made for one
   * must not silently govern the other.
   *
   * Setting this keeps the entry on its own identity and implicitly removes it
   * from any name-group it would otherwise join.
   */
  identity?: string
  /**
   * Wire protocol this model must use on its family's endpoint, overriding the
   * group's default. OpenCode Go routes a per-model set to the Responses
   * surface only (grok-4.6, muse-spark-*, gpt-5.6-luna answer 503/ModelError
   * on chat-completions), while the rest only answer on chat-completions.
   */
  protocol?: Protocol
  /**
   * Whether this model emits its thinking inline in the `content` stream as a
   * `<think>...</think>` segment rather than in a reasoning channel. The
   * chat-completions translator lifts that segment into a reasoning block so
   * the harness still sees a thinking stream (MiniMax M3 on OpenCode Go).
   */
  inlineReasoning?: boolean
  /**
   * Menu priority: lower sorts earlier. Assigned to the models whose reasoning
   * content actually streams, so the picker leads with readable thinking.
   */
  rank?: number
  pricing?: RegistryPricing
  /**
   * Context rungs this model offers INSTEAD of the ones the shared ladder
   * derives. Absent for every other entry, because for every other model the
   * ladder's steps are merely different cap sizes and any of them will do.
   *
   * It exists for the one case where the rungs are not interchangeable: a model
   * whose PRICE changes with the request's own input size. Claude Haiku 5.5 is
   * billed 5x above 100,000 input tokens per request — 0.10/0.50 per MTok at or
   * below it, 0.50/2.50 above — so 100K and 200K are not two cap sizes but two
   * different products, and the ladder derives neither.
   *
   * The model's own window is always offered as well, so declaring this can
   * never make a model unreachable at its full capacity.
   */
  contextLengths?: readonly number[]
}

/**
 * Context capacity assumed for a model neither the registry nor the endpoint
 * sizes. It is the ladder floor, not a smaller "safe" number: assuming less
 * than the floor produced a single 128K entry for every unknown model — a
 * choice no model served by this endpoint can honour, and a residue of the
 * registry's original global-catalog design.
 */
export const FALLBACK_CONTEXT_WINDOW = CONTEXT_200K

/**
 * The reasoning vocabulary shared by the GLM-5.2/5.3 generation. GLM refuses
 * `thinking: {type: "disabled"}`, so `off` is deliberately absent: every
 * effort here keeps thinking enabled and varies its budget.
 */
const GLM_REASONING: RegistryReasoning = {
  efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'high',
}

/** The reasoning vocabulary shared by the GPT-5.6 generation. */
const GPT_REASONING: RegistryReasoning = {
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'medium',
}

/**
 * The relay's full seven-level vocabulary, for a model PROBED against all of
 * them (2026-10-01) rather than assumed to have them.
 *
 * Eight registry entries carried no vocabulary at all, and that is exactly what
 * removed the Effort submenu from them: with nothing declared the picker has no
 * levels to offer, so the models had no thinking control. Each was probed level
 * by level, and every model using this constant answered 200 across the set.
 * The relay's own error text enumerates the same seven when handed a bad value.
 *
 * Relay-scoped, like GLM_REASONING and GPT_REASONING above, and deliberately
 * not shared with GO_FULL_REASONING: the relay spells the disabling word
 * `none` and answers 400 to `off`, while the Go gateway is the exact reverse.
 */
const FULL_REASONING: RegistryReasoning = {
  efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'high',
}

/**
 * The ladder steps one model can offer.
 *
 * A rung is offered when it is no larger than the model's window, and the
 * model's OWN window is always offered as a final rung. Both halves matter:
 *
 *  - Without the second, a model whose window falls between two rungs loses
 *    its ceiling. The ladder is binary (1,048,576) while providers publish
 *    decimal figures, so a 1,000,000-token model used to top out at 400K --
 *    24 of the 41 Go entries could never be offered their own window, and a
 *    500,000-token model could never be offered more than 400K either.
 *
 *  - The window is added once and sorted, so a model that IS a rung does not
 *    list it twice.
 * @param contextWindow - the model's declared capacity.
 * @returns the offered lengths, smallest first.
 */
export function contextChoicesFor(contextWindow: number): number[] {
  const offered = CONTEXT_LADDER.filter(length => length < contextWindow)
  return [...offered, contextWindow].sort((left, right) => left - right)
}

/**
 * The initial registry. Order is presentation order, but the adapter re-sorts
 * by {@link RegistryEntry.rank} so the recommended models lead the menu.
 */
export const REGISTRY: readonly RegistryEntry[] = [
  {
    id: 'kimi-k3',
    displayName: 'Kimi K3',
    family: 'kimi',
    contextWindow: CONTEXT_256K,
    // Live-verified 2026-09-27: minimal, medium, xhigh and max all answer 200.
    // Only `none` is refused, so the narrower pair this used to declare hid
    // levels the model serves.
    reasoning: { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
    vision: true,
    rank: 1,
  },
  {
    id: 'glm-5.2',
    displayName: 'GLM-5.2',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    // Text-only by the vendor's own documentation. Declared rather than left
    // absent: an absent verdict now means "unknown", and unknown is permissive.
    vision: false,
    rank: 2,
  },
  {
    id: 'mimo-v2.5',
    displayName: 'MiMo V2.5',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'high' },
    vision: true,
    rank: 3,
  },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    displayName: 'DeepSeek V4.1 Flash',
    family: 'deepseek',
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ['none', 'low', 'high', 'max'], defaultEffort: 'none' },
    vision: true,
  },
  {
    id: 'deepseek-v4.1-flash',
    displayName: 'DeepSeek V4.1 Flash',
    family: 'deepseek',
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ['none', 'low', 'high', 'max'], defaultEffort: 'none' },
    vision: true,
  },
  {
    // PROBED 2026-10-01: this route now ACCEPTS `reasoning_effort` at six of
    // the seven levels (only `medium` answers 400). The note that stood here
    // recorded an outright rejection and was the reason this model had no
    // Effort submenu; the endpoint changed and the note did not. The declared
    // set is the measured one, with `medium` deliberately absent because the
    // relay refuses it.
    id: 'moonshotai/Kimi-K2.7-Code',
    displayName: 'Kimi K2.7 Code',
    family: 'kimi',
    contextWindow: CONTEXT_256K,
    reasoning: { efforts: ['none', 'minimal', 'low', 'high', 'xhigh', 'max'], defaultEffort: 'low' },
    vision: true,
  },
  {
    id: 'zai-org/GLM-5.2',
    displayName: 'GLM-5.2',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: false,
    // Same name as the bare id, but NOT the same route: live-verified
    // 2026-09-27, the bare `glm-5.2` answers 400 to a disabled-thinking
    // request while this one answers 200. Aliasing them by name, which is the
    // default, would make a visibility or context choice on either silently
    // govern both, so this entry keeps its own identity.
    identity: 'zai-org/GLM-5.2',
  },
  {
    id: 'glm-5.3',
    displayName: 'GLM-5.3',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: false,
  },
  {
    id: 'z-ai/glm-5.3-flash',
    displayName: 'GLM-5.3 Flash',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: true,
  },
  {
    id: 'z-ai/glm-5.3-flashx',
    displayName: 'GLM-5.3 FlashX',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: true,
  },
  { id: 'Qwen/Qwen3.8-27B', displayName: 'Qwen3.8 27B', family: 'qwen', contextWindow: CONTEXT_1M, reasoning: FULL_REASONING, vision: true },
  { id: 'qwen3.8-max', displayName: 'Qwen3.8 Max', family: 'qwen', contextWindow: CONTEXT_1M },
  { id: 'Qwen/Qwen3.7-Flash', displayName: 'Qwen3.7 Flash', family: 'qwen', contextWindow: CONTEXT_256K, reasoning: FULL_REASONING, vision: true },
  { id: 'Qwen/Qwen3.8-Omni-Flash', displayName: 'Qwen3.8 Omni Flash', family: 'qwen', contextWindow: CONTEXT_1M, reasoning: FULL_REASONING, vision: true },
  {
    id: 'MiniMaxAI/MiniMax-M3',
    displayName: 'MiniMax M3',
    family: 'minimax',
    contextWindow: CONTEXT_1M,
    // Live-verified 2026-09-27: none and xhigh both answer 200 on top of the
    // three this declared, so the pair was a menu restriction rather than a
    // capability limit.
    reasoning: { efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'high' },
    vision: true,
  },
  {
    id: 'mimo-v2.5-pro',
    displayName: 'MiMo V2.5 Pro',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'high' },
    // The endpoint answered 404 "no endpoints found that support image input".
    vision: false,
  },
  {
    id: 'google/gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    family: 'gemini',
    contextWindow: CONTEXT_1M,
    // Probed 2026-10-01: all seven levels answer 200.
    reasoning: FULL_REASONING,
    vision: true,
  },
  {
    id: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    family: 'gpt',
    contextWindow: CONTEXT_1M,
    reasoning: GPT_REASONING,
    vision: true,
    groups: ['codex'],
  },
  {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    family: 'gpt',
    contextWindow: CONTEXT_1M,
    reasoning: GPT_REASONING,
    vision: true,
    groups: ['codex'],
  },
  {
    // Verified by request against this endpoint: `step-5-preview` answers a
    // chat turn carrying an inline image (HTTP 200, "Red"), and StepFun
    // publishes it at a 1M window. It is the only StepFun id curated here —
    // the others ride from the group's own listing with the group's ladder,
    // because sizing a model on a guess would narrow its menu to steps it
    // cannot honour.
    id: 'step-5-preview',
    displayName: 'Step 5 Preview',
    family: 'step',
    contextWindow: CONTEXT_1M,
    vision: true,
    groups: ['stepfun'],
  },
  // These four answer "not available on this endpoint" on /v1/chat/completions
  // whenever the endpoint lists them, so their facts cannot be verified by
  // request; the values follow their generation's published window. They stay
  // catalogued rather than blocked — the picker's toggles are how a deployment
  // says which models it wants, and a model that starts serving should simply
  // start working.
  { id: 'google/gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', family: 'gemini', contextWindow: CONTEXT_1M, vision: true },
  { id: 'tencent/hy4-preview', displayName: 'HY-4 Preview', family: 'hunyuan', contextWindow: CONTEXT_256K },
  { id: 'inclusionai/ling-3.0-flash-sante:free', displayName: 'Ling 3.0 Flash Sante', family: 'inclusionai', contextWindow: CONTEXT_256K },
  { id: 'Qwen/Qwen3.8-Flash', displayName: 'Qwen3.8 Flash', family: 'qwen', contextWindow: CONTEXT_1M, vision: true },
  // Context values below follow each model's published ceiling; the two marked
  // unverified follow their family's documented window.
  { id: 'tencent/hy3-paid', displayName: 'HY-3', family: 'hunyuan', contextWindow: CONTEXT_256K, reasoning: FULL_REASONING },
  { id: 'meituan/LongCat-2.0:free', displayName: 'LongCat 2.0', family: 'longcat', contextWindow: CONTEXT_256K },
  { id: 'poolside/laguna-s-2.1-free', displayName: 'Laguna S 2.1 Free', family: 'poolside', contextWindow: CONTEXT_256K, reasoning: FULL_REASONING },
  { id: 'meta/muse-spark-1.3-contributor', displayName: 'Muse Spark 1.3 Contributor', family: 'meta', contextWindow: CONTEXT_1M, reasoning: FULL_REASONING, vision: true },
  /* ---------------------------------------------------------------------
   * Added 2026-09-27 after a live listing sweep. These were served but absent
   * here, which does not hide them -- the listing is the membership source --
   * but leaves them sized by the family floor, offering no Effort control, and
   * relying on the permissive vision default.
   *
   * Every field is live-verified against the relay itself, not taken from a
   * third party: all seven effort levels answered 200 on each id below, and an
   * inline image answered 200 on all five. The window is the consensus of the
   * independent providers models.dev reports, which is the same source this
   * registry already cites for windows it cannot probe.
   * ------------------------------------------------------------------- */
  {
    id: 'mimo-v2.6-flash',
    displayName: 'MiMo V2.6 Flash',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true,
  },
  {
    id: 'mimo-v2.6-pro',
    displayName: 'MiMo V2.6 Pro',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true,
  },
  {
    id: 'xiaomi/mimo-v2.6-flash',
    displayName: 'MiMo V2.6 Flash',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true,
  },
  {
    id: 'xiaomi/mimo-v2.6-pro-ultraspeed',
    displayName: 'MiMo V2.6 Pro Ultraspeed',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true,
  },
  {
    id: 'gpt-6-luna',
    displayName: 'GPT-6 Luna',
    family: 'gpt',
    contextWindow: 1_050_000,
    reasoning: FULL_REASONING,
    vision: true,
    protocol: 'responses',
  },
]

/** Find the registry entry for one upstream id. */
export function matchRegistry(id: string, registry: readonly RegistryEntry[] = REGISTRY): RegistryEntry | undefined {
  return registry.find(entry => entry.id === id)
}

/** Whether one registry entry is a membership source for a group. */
export function servesGroup(entry: RegistryEntry, key: string): boolean {
  return entry.groups?.includes(key) === true
}

/**
 * Ids a listing advertises but the endpoint cannot serve a chat turn for,
 * verified by request. Two kinds live here, because both produce the same
 * defect -- a menu entry whose every use ends in an error:
 *
 * - **Refused on this route only.** StepFun's audio and image-editing models
 *   answer 404 "the model ... does not exist or you do not have access to it",
 *   and the two Step-3.5 snapshots answer 400 "this model is not enabled for
 *   the Responses API". Verified with the StepFun credential against both
 *   /v1/chat/completions and /v1/responses.
 * - **Refused on every route.** Four aggregate ids answer 400 "Model X is not
 *   available on this endpoint. Call it on /provider/v1/chat/completions
 *   instead." on both routes. That named path is not a usable API on this
 *   relay -- it answers a Cloudflare 525 SSL-handshake-failed HTML page, or
 *   HTML with HTTP 200 -- so there is nothing the adapter could route to.
 *
 * A listing is an advertisement, not a promise: eight of the eleven ids one
 * StepFun key lists and four of the twenty-six an aggregate key lists cannot
 * serve a turn at all, and a menu entry whose every use ends in an error is
 * the defect this catalog exists to remove. They are listed here rather than
 * dropped silently -- the settings panel names them "endpoint does not serve"
 * -- and a model the endpoint starts serving again is one line away from the
 * menu.
 *
 * Every id below was re-verified by live request on the release that added it;
 * no entry is inferred from documentation.
 */
export const REFUSED_CHAT_MODEL_IDS: readonly string[] = [
  // StepFun: refused on this relay's routes (404 not-found / 400 not-enabled).
  'step-3.5-flash',
  'step-3.5-flash-2603',
  'step-explore',
  'step-image-edit-2',
  'stepaudio-2.5-asr',
  'stepaudio-2.5-chat',
  'stepaudio-2.5-realtime',
  'stepaudio-2.5-tts',
  // Aggregate: listed, but "not available on this endpoint" on both routes.
  'Qwen/Qwen3.8-Flash',
  'google/gemini-3.7-flash',
  'tencent/hy4-preview',
  'inclusionai/ling-3.0-flash-sante:free',
  // The bare id is listed and refused; the `:free` suffix variant is a
  // different id the relay does not list at all. Re-verified 2026-09-27.
  'meituan/LongCat-2.0',
  // Registry entries that no credential lists and every route answers 404
  // for, re-verified 2026-09-27. Family-scoping is what makes this correct:
  // `mimo-v2.5` is refused HERE and still served on OpenCode Go, where its
  // own registry entry keeps it in that menu.
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'meituan/LongCat-2.0:free',
]

/** Whether the endpoint's chat route answers for one upstream id. */
export function servesChat(id: string, refused: readonly string[] = REFUSED_CHAT_MODEL_IDS): boolean {
  return !refused.includes(id)
}

/**
 * Whether one model accepts image input, after the deployment's own choice.
 *
 * Resolution order is explicit setting, then the registry's verified verdict,
 * then permissive: the endpoint — not this registry — is the authority on a
 * model's modality and discloses none, so the registry can only ever be
 * incomplete. A wrong "no" makes a documented capability unreachable for every
 * deployment at once; a wrong "yes" costs one upstream error that names the
 * model. `vision: false` stays the way to say "verified text-only".
 * @param id - upstream model id, alias resolved through {@link identityKey}.
 * @param declared - the deployment's per-model choices.
 */
export function acceptsImages(id: string, declared?: ReadonlyMap<string, boolean>, registry: readonly RegistryEntry[] = REGISTRY): boolean {
  const chosen = declared?.get(identityKey(id, registry))
  if (chosen !== undefined) return chosen
  return matchRegistry(id, registry)?.vision !== false
}

/**
 * One selectable model identity: a display name and every upstream id that
 * serves it. The endpoint lists some models under both an organization- and a
 * bare-prefixed id, which would otherwise present the same model twice in the
 * menu and twice in the visibility list.
 */
export interface ModelIdentity {
  displayName: string
  /** Every upstream id for this identity, in registry order. */
  ids: readonly string[]
  /** The entry whose facts describe the identity. */
  entry: RegistryEntry
}

/**
 * The models the plugin recommends out of the box: the ones whose reasoning
 * content actually streams from this endpoint, in preference order. A
 * deployment overrides the list through the `recommendedModels` setting; it
 * only ever orders the menu, so a model left off it stays fully selectable.
 */
export const DEFAULT_RECOMMENDED: readonly string[] = REGISTRY
  // A refused id is not in the menu at all, so recommending it would put a
  // model that can never appear at the head of a user-facing setting.
  .filter(entry => entry.rank !== undefined && servesChat(entry.id))
  .slice()
  .sort((left, right) => (left.rank as number) - (right.rank as number))
  .map(entry => entry.id)

/**
 * The identity key of one upstream id: the first registry id of the model it
 * belongs to. Aliases of one model share a key, so a recommendation or a
 * visibility choice made against either id applies to both.
 *
 * An entry that declares its own {@link RegistryEntry.identity} opts out of the
 * name join entirely, and no name group may absorb it either -- otherwise the
 * opt-out would only work in one direction, and a choice made on the OTHER id
 * would still land on both.
 */
export function identityKey(id: string, registry: readonly RegistryEntry[] = REGISTRY): string {
  const entry = matchRegistry(id, registry)
  if (entry === undefined) return id
  if (entry.identity !== undefined) return entry.identity
  const sibling = registry.find(candidate => candidate.displayName === entry.displayName
    && candidate.identity === undefined)
  return sibling?.id ?? id
}

/**
 * Collapse the registry into one row per identity, in registry order.
 *
 * Keyed by {@link identityKey} rather than by display name, so an entry that
 * opts out of the name join stays its own row. Grouping by name here would
 * re-merge exactly the pair an opt-out exists to separate, and every count
 * derived from this list would disagree with the menu it describes.
 */
export function modelIdentities(registry: readonly RegistryEntry[] = REGISTRY): ModelIdentity[] {
  const byIdentity = new Map<string, { entry: RegistryEntry; ids: string[] }>()
  for (const entry of registry) {
    const identity = identityKey(entry.id, registry)
    const hit = byIdentity.get(identity)
    if (hit === undefined) byIdentity.set(identity, { entry, ids: [entry.id] })
    else hit.ids.push(entry.id)
  }
  return [...byIdentity.values()].map(({ entry, ids }) => ({ displayName: entry.displayName, ids, entry }))
}

/** Short capacity label: 128K, 256K, 512K, 1M. */
export function contextLabel(tokens: number): string {
  // Providers report windows in both bases: binary (1,048,576) and decimal
  // (1,000,000 — OpenCode Go's models.dev figures). Label either cleanly
  // rather than printing 977K for a decimal million.
  //
  // A model can offer BOTH bases as separate steps, and the naive labels collide
  // -- 1M and 1M, or 100K and 100K -- which leaves the operator choosing between
  // two identical chips with different budgets behind them. The BINARY figure
  // keeps the plain label it has always had, because it is the one the ladder is
  // built from; the DECIMAL one is marked, because it is the exception and it is
  // the one a vendor's price list is written in.
  //
  // The 100K line needs its own branch for the same reason the million does.
  // 100,000 decimal tokenises as "100K" only if something says so -- the general
  // rule divides by 1024 and would print 98K -- while a 102,400 window really is
  // 100 binary K and renders as "100K" through that general rule. Marking the
  // decimal rung is therefore what keeps the pair apart, and marking the binary
  // one instead would mislabel every genuine 100K window.
  if (tokens === CONTEXT_100K) return '100K (dec)'
  if (tokens === 1_000_000) return '1M (dec)'
  if (tokens % 1_048_576 === 0) return `${tokens / 1_048_576}M`
  // Round decimal figures, printed in the base the vendor wrote them in.
  //
  // A price boundary is published ("<= 200K", "> 256K", "> 272K") in ROUND
  // DECIMAL tokens, so the rung minted from it is 200,000 / 256,000 / 272,000 --
  // and the binary division below renders those as "195K" / "250K" / "266K"
  // sitting next to genuine 200K / 256K rungs. That is indistinguishable from a
  // rounding bug to anyone reading the menu, and it hides which side of the
  // cliff a chip is on.
  //
  // The test is "is this figure a multiple of 1000": every decimal figure a
  // vendor publishes is, and NO binary rung is (204,800 / 262,144 / 409,600 /
  // 1,048,576 all leave a remainder), so the two bases stay distinguishable
  // without a lookup table. 256,000 needs this even though it is also an exact
  // binary multiple -- 256,000 / 1024 = 250, which is where the misleading
  // "250K" came from.
  //
  // Marking them follows the convention the 100K and 1M branches already set:
  // the binary figure keeps the plain label because the ladder is built from it,
  // and the decimal figure is marked because it is the exception -- and the one
  // the price list is written in.
  if (tokens % 1_000 === 0) {
    const decimalK = tokens / 1_000
    return decimalK >= 1_000 ? `${decimalK / 1_000}M (dec)` : `${decimalK}K (dec)`
  }
  return `${Math.round(tokens / 1024)}K`
}

/** Selector name for one entry at one context length: `{displayName} [{label}]`. */
export function displayNameWithContext(displayName: string, tokens: number): string {
  return `${displayName} [${contextLabel(tokens)}]`
}

/** One upstream listing row, as much of it as this plugin reads. */
export interface UpstreamModel {
  id: string
  /** Endpoint-supplied human name; may equal {@link id}. */
  displayName?: string
  contextWindow?: number
  maxTokens?: number
  /** Gateway capability flags some listings disclose. */
  supportsReasoningEffort?: boolean
  reasoningEfforts?: string[]
  /**
   * Endpoint paths this model is served on, as the GATEWAY itself declares them
   * (Command Code publishes this on every listing row). This is the routing
   * truth rather than a hint: a model advertising only `/messages` answers 400
   * on `/chat/completions`, so id-prefix guessing would produce a guaranteed
   * failure for every call. Absent means the endpoint said nothing, and the
   * group's own protocol stands.
   */
  endpoints?: readonly string[]
  /**
   * A DEFINITE image verdict, when a capability source stated one. Absent means
   * "not stated", which the permissive default reads as accepted; false means
   * the model is text-only and must not be sent an image.
   */
  vision?: boolean
  /**
   * A definite "this model cannot reason" verdict, when a capability source
   * stated one. Absent leaves the group's own vocabulary in charge.
   */
  reasoning?: boolean
  /** Dollars per million input tokens, when a capability source published one. */
  inputCost?: number
  /** Dollars per million output tokens, when published. */
  outputCost?: number
  /** Dollars per million cached input tokens, when published. */
  cacheReadCost?: number
  /**
   * Whether the account's subscription tier excludes this model.
   *
   * Set by the adapter from the account's own plan, because the endpoints
   * listing is NOT plan-filtered: verified live, the listing advertised Pro-
   * and Max-tier models that an individual-goat account answers 403
   * MODEL_NOT_IN_PLAN for. Such a model is kept out of the menu rather than
   * listed and failing on every call.
   */
  outOfPlan?: boolean
}

/** One catalog model after registry projection, before variant expansion. */
export interface CatalogModel {
  upstreamId: string
  displayName: string
  contextWindow: number
  /** Whether the endpoint published this window, rather than this plugin assuming it. */
  contextWindowDisclosed?: boolean
  contextOptions?: number[]
  /** Rungs this model declares for itself; see {@link GroupCatalogModel.contextLengths}. */
  contextLengths?: readonly number[]
  reasoning?: RegistryReasoning
  /** Whether the model accepts image input, after the deployment's override. */
  vision: boolean
  /** Menu priority; lower sorts earlier. */
  rank: number
}

/**
 * Project one discovered upstream model into catalog form. Registry entries
 * win on every field they declare; unknown ids keep the endpoint's own
 * display name when it adds information over the raw id. Reasoning metadata
 * resolves registry first, then endpoint-disclosed effort lists, then the
 * group's own default vocabulary.
 * @param upstream - one listing row, or a hand-built row for a registry entry.
 * @param groupReasoning - the group's own vocabulary, used when nothing else declares one.
 * @param declaredVision - the deployment's per-model image capability.
 * @returns the model as the menu presents it.
 */
export function catalogEntry(
  upstream: UpstreamModel,
  groupReasoning?: GroupReasoning,
  declaredVision?: ReadonlyMap<string, boolean>,
  registry: readonly RegistryEntry[] = REGISTRY,
): CatalogModel {
  const entry = matchRegistry(upstream.id, registry)
  const disclosed: RegistryReasoning | undefined = upstream.reasoningEfforts !== undefined
    && upstream.reasoningEfforts.length > 0
    ? {
      efforts: upstream.reasoningEfforts,
      defaultEffort: upstream.reasoningEfforts.includes('high')
        ? 'high'
        : upstream.reasoningEfforts[0] as string,
    }
    : undefined
  const reasoning = entry?.reasoning ?? disclosed ?? groupReasoning
  if (entry === undefined) {
    return {
      upstreamId: upstream.id,
      displayName: upstream.displayName !== undefined && upstream.displayName !== upstream.id
        ? upstream.displayName
        : upstream.id,
      contextWindow: upstream.contextWindow ?? FALLBACK_CONTEXT_WINDOW,
      // Only the endpoint's own number is a fact. The floor default is a guess,
      // and the two must stay distinguishable downstream.
      ...upstream.contextWindow === undefined ? {} : { contextWindowDisclosed: true },
      ...reasoning === undefined ? {} : { reasoning },
      // A source that states the verdict outranks the permissive default; a
      // deployment's own declaration still outranks both.
      vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, undefined, registry),
      rank: Number.MAX_SAFE_INTEGER,
    }
  }
  return {
    upstreamId: upstream.id,
    displayName: entry.displayName,
    contextWindow: entry.contextWindow,
    contextOptions: contextChoicesFor(entry.contextWindow),
    ...entry.contextLengths === undefined ? {} : { contextLengths: entry.contextLengths },
    ...reasoning === undefined ? {} : { reasoning },
    vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, undefined, registry),
    rank: entry.rank ?? Number.MAX_SAFE_INTEGER,
  }
}

/**
 * The context variants one model should be offered, under a group's ladder.
 *
 * One expression evaluated by the adapter that mints a group's menu entries AND
 * by the settings row that draws the chips, so the two cannot disagree — the
 * defect that made a row show a single pressed chip which refused every click.
 *
 * Three inputs, in order of authority:
 *
 *  1. a per-model choice the deployment stored, when this model has one,
 *  2. the group's ladder, when it has one,
 *  3. nothing at all — which offers the model once under its bare id — EXCEPT
 *     for a model declaring its own rungs, see below.
 *
 * The group ladder is the switch, not merely a filter: with no `contextLengths`
 * configured a model lists once under its bare id, which is the shape most
 * deployments run and the historical one. A model whose entry declares
 * {@link RegistryEntry.contextLengths} is the one exception, and it exists
 * because those rungs are not interchangeable cap sizes but different PRICES
 * (Haiku 5.5's 100K): offering only the bare id there would hide the choice the
 * entry exists to expose.
 *
 * A declared rung is screened by the group's CEILING rather than by rung
 * matching, which is what keeps a deployment's deliberate cap authoritative
 * while sparing every operator from having to name a model's price boundary in
 * their own ladder.
 * @param model - the projected row.
 * @param ladder - the group's effective ladder.
 * @param chosen - the deployment's stored per-model choice for this identity.
 * @returns the lengths to offer, or undefined for a single bare-id entry.
 */
export function contextVariantsFor(
  model: Pick<GroupCatalogModel, 'contextOptions' | 'contextWindow' | 'contextWindowDisclosed' | 'contextLengths'>,
  ladder: readonly number[] | undefined,
  chosen?: readonly number[],
): number[] | undefined {
  if (chosen !== undefined && chosen.length > 0) {
    // A model cannot honour a budget beyond its own window, so a stored choice
    // above it is dropped rather than advertised.
    const allowed = chosen.filter(length => length <= model.contextWindow)
    return allowed.length > 0 ? [...new Set(allowed)].sort((left, right) => left - right) : undefined
  }
  // The rungs the MODEL declares for itself, screened by the group's CEILING
  // rather than by rung matching: such a rung exists because the model's PRICE
  // moves at it, so it must not depend on an operator having named that exact
  // figure in their own ladder. A deliberate cap still outranks it, which is why
  // the ceiling filter -- not an unconditional union -- is what applies here.
  const declared = (model.contextLengths ?? []).filter(length => withinLadderCeiling(length, ladder))
  if (ladder === undefined || ladder.length === 0) {
    // No group ladder: the model lists once under its bare id, which is the
    // historical shape and the one most deployments run. A model declaring its
    // own rungs is the single exception, because those rungs are not
    // interchangeable and offering only the bare id would hide the choice the
    // entry exists to expose.
    return declared.length === 0 ? undefined : [...new Set(declared)].sort((left, right) => left - right)
  }
  const offered = contextStepsFor(model, ladder)
  return [...new Set([...offered, ...declared])].sort((left, right) => left - right)
}

/**
 * The context steps one model may be offered.
 *
 * One expression, evaluated by both the adapter that mints menu entries and the
 * settings row that draws the chips, so the two cannot disagree -- the defect
 * that made a row show a single pressed chip which refused every click.
 *
 * Three inputs, in order of authority:
 *
 *  1. the registry's own options for a model it sizes,
 *  2. the endpoint's DISCLOSED length, when it publishes one per row,
 *  3. the group ladder unfiltered, when nothing but this plugin's assumption
 *     bounds the model.
 *
 * The distinction in (2) and (3) is load-bearing rather than pedantic. Command
 * Code publishes `context_length` on every row, so a step above it is an entry
 * the model cannot honour: a 256K model was offered 400K and 1M. StepFun
 * publishes nothing, and its uncurated ids carry only a floor guess, so the same
 * filtering there would hide steps those models serve.
 * @param model - the projected row.
 * @param ladder - the group's effective ladder.
 * @returns the steps to offer, never empty.
 */
export function contextStepsFor(
  model: Pick<GroupCatalogModel, 'contextOptions' | 'contextWindow' | 'contextWindowDisclosed'>,
  ladder: readonly number[] | undefined,
): number[] {
  if (model.contextOptions !== undefined) {
    // Ladder-derived options are screened by RUNG MATCHING, and that is
    // deliberate rather than incidental: a deployment that sets a group's
    // contextLengths to one rung has CAPPED the group, and a model there must
    // stay at that cap even though its own options include smaller rungs below
    // it. Matching by rung is what expresses that cap, so it is kept.
    const matched = variantLengths(model.contextOptions, ladder) ?? []
    // The model's own window is its CAPACITY, not one of the budgets a ladder
    // picks between: a window between two rungs (grok-4.7 declares 500,000) or
    // naming neither (1,000,000 against a 1,048,576 rung) would otherwise be
    // capped below its own ceiling by a filter that never meant to touch it.
    const steps = withinLadderCeiling(model.contextWindow, ladder)
      ? [...new Set([...matched, model.contextWindow])]
      : [...new Set(matched)]
    // Never empty: a model with no step at all would vanish from the menu, so
    // an empty match degrades to its own window exactly as it always has.
    return steps.length > 0 ? steps.sort((left, right) => left - right) : [model.contextWindow]
  }
  if (ladder === undefined || ladder.length === 0) return [model.contextWindow]
  const allowed = model.contextWindowDisclosed === true
    ? ladder.filter(length => length <= model.contextWindow)
    : [...ladder]
  return allowed.length > 0 ? allowed : [model.contextWindow]
}

/** One model as a group's own model menu presents it. */
export interface GroupCatalogModel {
  /** The upstream id this row's menu entries dispatch. */
  upstreamId: string
  /**
   * Every upstream id that presents this identity, in listing then registry
   * order. Hiding or starring the identity covers all of them, so no alias can
   * survive as a second row carrying the same model's name.
   */
  ids: readonly string[]
  displayName: string
  contextWindow: number
  /**
   * Whether {@link contextWindow} is the ENDPOINT's own disclosure rather than
   * a registry value or a floor default.
   *
   * The distinction decides whether the window may be used to filter the
   * ladder. An endpoint that publishes a per-row length is stating a fact, so a
   * step above it is a menu entry the model cannot honour. A number this plugin
   * assumed is only a floor, and filtering by it would hide steps the model can
   * serve -- which is the case StepFun's uncurated ids depend on.
   */
  contextWindowDisclosed?: boolean
  /** Ladder steps the registry allows this model, when it sizes the model. */
  contextOptions?: readonly number[]
  /**
   * Rungs this model declares for itself, beyond the shared ladder's cap sizes.
   * Absent for every model whose steps are interchangeable; present for one
   * whose PRICE depends on which rung is picked (see
   * {@link RegistryEntry.contextLengths}).
   */
  contextLengths?: readonly number[]
  reasoning?: RegistryReasoning
  /** Whether the model accepts image input, after the deployment's override. */
  vision: boolean
  rank: number
}

/** One row under construction, whose alias list is still growing. */
type MutableCatalogRow = Omit<GroupCatalogModel, 'ids'> & { ids: string[] }

/** Deployment choices a group's catalog projection honours. */
export interface GroupCatalogOptions {
  /** Upstream ids the menu must not offer. */
  hidden?: ReadonlySet<string>
  /** Upstream ids that lead the menu, most preferred first. */
  recommended?: readonly string[]
  /** Explicit per-model image capability, keyed by model identity. */
  vision?: ReadonlyMap<string, boolean>
  /**
   * Whether a group with no rows at all falls back to the whole registry
   * (default true). The adapter leaves this on, because an unreachable listing
   * must not empty the model menu. A configuration surface turns it off until
   * it has actually interrogated the group, so a group nobody has probed does
   * not advertise every other group's models.
   */
  registryFallback?: boolean
  /**
   * The provider family this catalog is for. Absent means Protocom — the
   * historical caller — so the shipped registry, refusal list, and group
   * reasoning defaults apply. A family scopes every lookup (registry, refused
   * ids, and the group's own reasoning vocabulary) to its own endpoint.
   */
  family?: ProviderFamily
}

/**
 * One group's own model menu: the models that group's menu offers, in the
 * order the menu renders them. Membership is the group's live listing — the
 * credential scopes what the route serves — plus the registry entries tagged
 * for that group, so a group's menu holds its own models instead of every
 * group's and a model the endpoint starts listing appears without a plugin
 * release. Ids the endpoint refuses on its chat route never appear
 * ({`link servesChat}). A missing or empty listing falls back to the whole
 * registry, so a degraded endpoint cannot empty the menu.
 *
 * The adapter's `listModels` and the settings panel's per-group model editor
 * both project through here, so the list a user configures cannot drift from
 * the list the picker shows.
 * `param key - the group whose catalog is projected.
 * `param listing - that group's live listing, or `undefined` when unreachable.
 * `param options - the deployment's visibility, ordering, and modality choices.
 * `returns one row per model identity, in menu order.
 */
export function groupCatalog(
  key: string,
  listing: readonly UpstreamModel[] | undefined,
  options: GroupCatalogOptions = {},
): GroupCatalogModel[] {
  const registry = options.family?.registry ?? REGISTRY
  const refused = options.family?.refused ?? REFUSED_CHAT_MODEL_IDS
  const groupReasoning = options.family === undefined
    ? GROUP_DEFAULTS[key as GroupKey].reasoning
    : options.family.defaults[key]?.reasoning
  const rows: UpstreamModel[] = listing === undefined ? [] : [...listing]
  for (const entry of registry) {
    if (!servesGroup(entry, key)) continue
    if (!rows.some(row => row.id === entry.id)) rows.push({ id: entry.id })
  }
  // "No listing" and "empty listing" are both no information, not "no models".
  if (rows.length === 0 && options.registryFallback !== false) {
    for (const entry of registry) rows.push({ id: entry.id })
  }
  const rankOf = (id: string): number => {
    const at = options.recommended?.indexOf(identityKey(id, registry)) ?? -1
    return at === -1 ? Number.MAX_SAFE_INTEGER : at
  }
  const ranked = rows
    // A row the endpoint refuses to chat on, or that declares only surfaces
    // this plugin cannot speak, is not offered: listing it would turn every
    // call into a 400 that reads like a bug rather than a missing capability.
    // "Surfaces this plugin can speak" now includes the Anthropic Messages
    // wire, so the Claude rows both gateways serve there are offered rather
    // than hidden.
    .filter(row => servesChat(row.id, refused)
      && servesDeclaredEndpoints(row)
      && row.outOfPlan !== true
      && options.hidden?.has(row.id) !== true)
    .map((row, index) => ({ index, row, rank: rankOf(row.id) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
  // Grouped by IDENTITY, not by display name. The two usually agree -- one
  // model listed under a prefixed and a bare id is one row -- but an entry may
  // opt out of the name join, and those two routes must stay separate rows
  // because they behave differently. Grouping by name here would silently
  // re-merge exactly the pair the opt-out exists to separate.
  const byIdentity = new Map<string, MutableCatalogRow>()
  for (const { row } of ranked) {
    const model = catalogEntry(row, groupReasoning, options.vision, registry)
    const identity = identityKey(row.id, registry)
    const hit = byIdentity.get(identity)
    if (hit === undefined) {
      byIdentity.set(identity, {
        upstreamId: row.id,
        ids: [row.id],
        displayName: model.displayName,
        contextWindow: model.contextWindow,
        // Carried through: the adapter and the settings row both need to know
        // whether this window is the endpoint's fact or this plugin's guess.
        ...model.contextWindowDisclosed === true ? { contextWindowDisclosed: true } : {},
        ...model.contextOptions === undefined ? {} : { contextOptions: [...model.contextOptions] },
        ...model.contextLengths === undefined ? {} : { contextLengths: [...model.contextLengths] },
        ...model.reasoning === undefined ? {} : { reasoning: model.reasoning },
        vision: model.vision,
        rank: model.rank,
      })
      continue
    }
    hit.ids.push(row.id)
  }
  return [...byIdentity.values()]
}
/* ------------------------------------------------------------------------
 * OpenCode Go (`https://opencode.ai/zen/go`): the subscription surface. Its
 * `/v1/models` listing discloses only `id`/`object`/`created`/`owned_by`, so
 * every fact below is hand-maintained from models.dev's `opencode-go` entry
 * and verified by request against the live endpoint.
 *
 * Verified wire facts (2026-09, live probing):
 * - Protocol is per-model: grok-4.6, muse-spark-1.2/1.3-contributor and
 *   gpt-5.6-luna answer 503/`ModelError` on /v1/chat/completions and only
 *   serve /v1/responses; every other listed model answers only on
 *   chat-completions (the same /responses call 503s); minimax-m2.7 and
 *   hy3-preview fail on both.
 * - Thinking on chat-completions rides `reasoning_effort` alone — the gateway
 *   parses `reasoningEffort ?? reasoning_effort ?? reasoning.effort`; a
 *   `thinking: {type:"disabled"}` block is refused on GLM routes — and the
 *   disabling word is per model: `none` (deepseek/qwen/kimi-k3/mimo/…), `off`
 *   (kimi-k2.7-code), or impossible (glm-5.1/5.2/5.3, minimax-m2.5: reasoning
 *   is mandatory there). `minimum` — not `minimal` — is qwen3.6-plus's word.
 * - Reasoning streams as `delta.reasoning_content` on chat (deepseek, glm,
 *   kimi-k2.7-code/k3, longcat, mimo-v2.5-pro, omen-alpha, qwen3.x), as
 *   `delta.reasoning`/`reasoning_details` on minimax-m2.5, inline as
 *   `<think>…</think>` inside `delta.content` on minimax-m3, and as reasoning
 *   items (`reasoning_summary_text.delta` etc.) on the responses models.
 * - Replaying assistant `reasoning_content` is accepted, and kimi-family
 *   models expect it for interleaved thinking.
 *
 * Open question, deliberately left on the conservative side (2026-10-08): the
 * vendor's endpoints table also maps `minimax-m3`, `minimax-m2.7`, `qwen3.8-max`,
 * `qwen3.8-flash` and `qwen3.7-plus` to `.../v1/messages` with
 * `@ai-sdk/anthropic`, while the wire facts above were established by probing
 * the CHAT surface of those same ids and finding them served there. Those two
 * observations are compatible — a gateway may accept more than the one canonical
 * path its docs name — so this registry leaves them on the group default rather
 * than moving five working models onto a wire they have never been observed on.
 * The asymmetry is intentional: routing a working model wrongly breaks it, while
 * leaving a model on a surface that answers costs nothing. An unauthenticated
 * probe cannot settle it (auth is checked before model routing, so every id
 * answers 401 on all three wires); the tie-break needs one real key.
 * ---------------------------------------------------------------------- */

/** Go vocabulary shared by the deepseek/glm-5.3-flash/kimi-k3/longcat/mimo-v2.5/minimax-m3/qwen3.8 generation. */
const GO_FULL_REASONING: RegistryReasoning = {
  efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'high',
}

/**
 * Kimi K3.1 Pro's vocabulary, and the first Go route whose THINKING CANNOT BE
 * TURNED OFF. models.dev publishes exactly `low`, `high`, `max` for it -- no
 * disabling word and no `none`/`minimal`/`medium`/`xhigh` -- and the vendor's
 * own quick-start for K3.1 Pro states that the model always thinks and that
 * omitting the effort defaults to `max`.
 *
 * That default is why this constant exists instead of reusing a sibling: every
 * other Go constant defaults to `high`, and on a model that always reasons the
 * default is a real spending and latency decision rather than a no-op. Reusing
 * `GO_QWEN37_REASONING` here would offer `none` (a 400 on this route) and hide
 * `max` (the vendor's own default).
 */
const GO_KIMI31_REASONING: RegistryReasoning = {
  efforts: ['low', 'high', 'max'],
  defaultEffort: 'max',
}

/** GLM-5.1/5.2/5.3 on Go: thinking cannot be disabled; `minimal`, `none` and `off` all answer 400. */
/**
 * The narrower Go vocabulary the MiMo v2.x routes accept: a disabling word and
 * three depths, with no `minimal`, `xhigh` or `max`. Probed 2026-10-01 against
 * mimo-v2.5, mimo-v2.6-flash and mimo-v2.6-pro -- each answered 200 on exactly
 * these four and 400 on the three it omits, so this is a measured ceiling
 * rather than a tidier-looking subset.
 */
const GO_TIGHT_REASONING: RegistryReasoning = {
  efforts: ['none', 'low', 'medium', 'high'],
  defaultEffort: 'high',
}

const GO_GLM_REASONING: RegistryReasoning = {
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'high',
}

/** muses/grok on the Go responses surface: `none` and `max` answer 400. */
const GO_RESPONSES_REASONING: RegistryReasoning = {
  efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  defaultEffort: 'medium',
}

/** Qwen3.7 generation on Go: `max`, `minimum` and `off` answer 400. */
const GO_QWEN37_REASONING: RegistryReasoning = {
  efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  defaultEffort: 'medium',
}

/**
 * The three-depth Go vocabulary the newer free tiers publish: `low`, `medium`
 * and `high` with no toggle and no disabling word, as models.dev lists for
 * `step-5-preview-free` and `gemini-4-argon-contributor`.
 *
 * Kept separate from {@link GO_RESPONSES_REASONING} even though the two are
 * close: that one is a probed accept set on the `/responses` surface and
 * includes `minimal`/`xhigh`, and borrowing it here would offer two depths these
 * routes do not publish.
 */
const GO_SHALLOW_REASONING: RegistryReasoning = {
  efforts: ['low', 'medium', 'high'],
  defaultEffort: 'medium',
}

/**
 * Claude Haiku 5.5's effort vocabulary on the Anthropic wire: the same five
 * depths Anthropic publishes for it (`low`, `medium`, `high`, `xhigh`, `max`)
 * and the same set the vendor CLI catalog lists for the Command Code ids beside
 * them. The disabling word is absent because this wire spells "off" as
 * `thinking: {type: 'disabled'}` rather than as an effort, which
 * {@link resolveMessagesThinking} handles.
 */
const HAIKU_MESSAGES_REASONING: RegistryReasoning = {
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'medium',
}

/**
 * The OpenCode Go registry. Every entry is a membership source for the single
 * `go` group, so the menu holds the whole catalog even while the live listing
 * is unreachable. `contextWindow` follows the model's published window
 * (models.dev); reasoning vocabularies are the live-verified accept sets.
 */
export const GO_REGISTRY: readonly RegistryEntry[] = [
  {
    id: 'deepseek-v4.1-flash',
    displayName: 'DeepSeek V4.1 Flash',
    family: 'deepseek',
    contextWindow: 1_000_000,
    reasoning: GO_FULL_REASONING,
    vision: true,
    groups: ['go'],
    rank: 1,
  },
  {
    id: 'glm-5.3',
    displayName: 'GLM-5.3',
    family: 'glm',
    contextWindow: 1_000_000,
    reasoning: GO_GLM_REASONING,
    vision: false,
    groups: ['go'],
    rank: 2,
  },
  {
    id: 'kimi-k3',
    displayName: 'Kimi K3',
    family: 'kimi',
    contextWindow: CONTEXT_1M,
    reasoning: GO_FULL_REASONING,
    vision: true,
    groups: ['go'],
    rank: 3,
  },
  {
    id: 'deepseek-v4-pro',
    displayName: 'DeepSeek V4 Pro',
    family: 'deepseek',
    contextWindow: 1_000_000,
    reasoning: GO_FULL_REASONING,
    vision: false,
    groups: ['go'],
    rank: 4,
  },
  {
    id: 'qwen3.8-max',
    displayName: 'Qwen3.8 Max',
    family: 'qwen',
    contextWindow: 1_000_000,
    reasoning: GO_FULL_REASONING,
    vision: true,
    groups: ['go'],
    rank: 5,
  },
  {
    id: 'grok-4.6',
    displayName: 'Grok 4.6',
    family: 'grok',
    contextWindow: 500_000,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: 'responses',
    groups: ['go'],
    rank: 6,
  },
  {
    // Listed by the endpoint and serviceable on /v1/responses, which the Go
    // gateway refuses to advertise. With no entry here the id fell back to the
    // group's chat protocol and every call answered 503 "Endpoint is
    // unavailable" (measured). Its effort vocabulary was probed model by model
    // rather than inherited: minimal/low/medium/high/xhigh all answer 200 and
    // none/max answer 400 -- the same set as grok-4.6, verified separately.
    id: 'grok-4.7',
    displayName: 'Grok 4.7',
    family: 'grok',
    contextWindow: 500_000,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: 'responses',
    // Price cliff at 200K (Go docs, 2026-10-28): $2.00/$6.00 per MTok at or
    // below 200,000 input tokens per request, $4.00/$12.00 above.
    //
    // This is the one cliff in the catalog that the group ladder cannot express
    // on its own. Its cheapest rung is 204,800 -- already PAST the 200K
    // boundary -- so before this declaration every offered budget was on the
    // expensive side and the cheap tier was unreachable from the menu at all.
    // Declaring 200,000 is what makes "stay under the line" expressible.
    //
    // The duplicate-looking chip beside 200K is real and intended: 200,000 and
    // the ladder's 204,800 are within the 2% base tolerance, so both are kept
    // but the labels distinguish them ("200K (dec)" vs "200K") and only the
    // former is under the line.
    contextLengths: [200_000],
    groups: ['go'],
    rank: 7,
  },
  { id: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', family: 'deepseek', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: false, groups: ['go'] },
  { id: 'deepseek-v4-flash-vision-exp', displayName: 'DeepSeek V4 Flash Vision', family: 'deepseek', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: true, groups: ['go'] },
  // Live-listed but absent from models.dev: the window is unverified, so the
  // entry keeps the family floor rather than claiming the generation's 1M.
  { id: 'deepseek-flash', displayName: 'DeepSeek Flash', family: 'deepseek', contextWindow: FALLBACK_CONTEXT_WINDOW, reasoning: GO_FULL_REASONING, groups: ['go'] },
  { id: 'glm-5.1', displayName: 'GLM-5.1', family: 'glm', contextWindow: 202_752, reasoning: GO_GLM_REASONING, vision: false, groups: ['go'] },
  { id: 'glm-5.2', displayName: 'GLM-5.2', family: 'glm', contextWindow: 1_000_000, reasoning: GO_GLM_REASONING, vision: false, groups: ['go'] },
  { id: 'glm-5.3-flash', displayName: 'GLM-5.3 Flash', family: 'glm', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: true, groups: ['go'] },
  {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    family: 'gpt',
    contextWindow: 1_050_000,
    // `minimal` answers 400; `none` disables.
    reasoning: { efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    vision: true,
    protocol: 'responses',
    // Price cliff at 272K (Go docs, 2026-10-28): $0.20/$1.20 per MTok at or
    // below 272,000 input tokens per request, $0.40/$1.80 above.
    //
    // Declared even though the ladder already has two rungs under the line
    // (204,800 and 262,144), because without it the menu cannot express the
    // boundary ITSELF: an operator who wants "as much as I can get while still
    // cheap" has to guess between 262,144 and 409,600, and 409,600 is double
    // the price. 272,000 is the actual ceiling of the cheap band.
    contextLengths: [272_000],
    groups: ['go'],
  },
  // hy3 and hy4-preview accept the effort field but never emit thinking on any
  // effort, so they carry no vocabulary — an effort picker would promise a
  // knob the model does not have.
  { id: 'hy3', displayName: 'HY-3', family: 'hunyuan', contextWindow: 256_000, reasoning: GO_FULL_REASONING, vision: false, groups: ['go'] },
  { id: 'hy4-preview', displayName: 'HY-4 Preview', family: 'hunyuan', contextWindow: 1_024_000, reasoning: GO_FULL_REASONING, vision: false, groups: ['go'] },
  // kimi-k2.6 and mimo-v2.5 accept the field but never stream thinking.
  { id: 'kimi-k2.6', displayName: 'Kimi K2.6', family: 'kimi', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
  {
    id: 'kimi-k2.7-code',
    displayName: 'Kimi K2.7 Code',
    family: 'kimi',
    contextWindow: CONTEXT_256K,
    // `none` answers 400 on this route; `off` is the disabling word.
    reasoning: { efforts: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    vision: true,
    groups: ['go'],
  },
  { id: 'longcat-2.0', displayName: 'LongCat 2.0', family: 'longcat', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: false, groups: ['go'] },
  { id: 'mimo-v2.5', displayName: 'MiMo V2.5', family: 'mimo', contextWindow: 1_000_000, reasoning: GO_TIGHT_REASONING, vision: true, groups: ['go'] },
  {
    id: 'mimo-v2.5-pro',
    displayName: 'MiMo V2.5 Pro',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    // `minimal`, `xhigh`, `max` and `off` all answer 400.
    reasoning: { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'medium' },
    vision: false,
    groups: ['go'],
  },
  {
    id: 'minimax-m2.5',
    displayName: 'MiniMax M2.5',
    family: 'minimax',
    contextWindow: CONTEXT_200K,
    // Reasoning is mandatory: `none`, `off` and `minimum` answer 400. The
    // stream arrives on `delta.reasoning` (plus `reasoning_details`), not
    // `reasoning_content`.
    reasoning: { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    vision: false,
    groups: ['go'],
  },
  {
    id: 'minimax-m3',
    displayName: 'MiniMax M3',
    family: 'minimax',
    contextWindow: 1_000_000,
    reasoning: GO_FULL_REASONING,
    vision: true,
    // Thinking streams inline inside `delta.content` as `<think>…</think>`.
    inlineReasoning: true,
    // Deliberately NO `contextLengths`, and the reason is a correction rather
    // than an omission. models.dev publishes a `tiers` array for this id with a
    // 512,000 boundary (0.30/1.20 -> 0.60/2.40), which reads like a price cliff
    // and would justify a rung the way it does for grok-4.7 and the Lunas.
    //
    // The vendor's own Go pricing table disagrees: 2026-10-28 lists MiniMax M3
    // as a single row at $0.30 / $1.20 / $0.06 cached, with no
    // "(<= N tokens)" / "(> N tokens)" pair -- and that paired form is exactly
    // how the same table spells the five cliffs it DOES have (Haiku at 100K,
    // Grok 4.7 at 200K, Qwen3.7 Plus at 256K, both Lunas at 272K). Absence of
    // the pair is therefore evidence, not silence.
    //
    // Command Code, which sells the same model, renders a two-row price table
    // whose two rows are IDENTICAL -- a second independent source saying the
    // 512K boundary does not move the price. Declaring a rung here would tell
    // the operator a cliff exists when it does not.
    groups: ['go'],
  },
  {
    id: 'muse-spark-1.2-contributor',
    displayName: 'Muse Spark 1.2 Contributor',
    family: 'meta',
    contextWindow: CONTEXT_1M,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: 'responses',
    groups: ['go'],
  },
  {
    id: 'muse-spark-1.3-contributor',
    displayName: 'Muse Spark 1.3 Contributor',
    family: 'meta',
    contextWindow: CONTEXT_1M,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: 'responses',
    groups: ['go'],
  },
  {
    id: 'omen-alpha',
    displayName: 'Omen Alpha',
    family: 'omen',
    contextWindow: 500_000,
    // `xhigh` answers 400; `off` and `minimum` are refused spellings.
    reasoning: { efforts: ['none', 'minimal', 'low', 'medium', 'high', 'max'], defaultEffort: 'medium' },
    vision: true,
    groups: ['go'],
  },
  {
    id: 'qwen3.6-plus',
    displayName: 'Qwen3.6 Plus',
    family: 'qwen',
    contextWindow: 1_000_000,
    // This route's minimal step is spelled `minimum`; `minimal`, `max` and
    // `off` all answer 400.
    reasoning: { efforts: ['none', 'minimum', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
    vision: true,
    groups: ['go'],
  },
  { id: 'qwen3.7-max', displayName: 'Qwen3.7 Max', family: 'qwen', contextWindow: 1_000_000, reasoning: GO_QWEN37_REASONING, vision: false, groups: ['go'] },
  // Price cliff at 256K (Go docs, 2026-10-28): $0.40/$1.60 per MTok at or below
  // 256,000 input tokens per request, $1.20/$4.80 above -- a 3x step, the
  // steepest in the catalog after Haiku's 5x.
  //
  // The ladder's 204,800 already sits under the line, so unlike grok-4.7 the
  // cheap tier was always reachable. What the declaration adds is the boundary,
  // which otherwise falls between 262,144 (just over) and 204,800 (24% under):
  // without it the operator cannot ask for "up to the cheap limit".
  { id: 'qwen3.7-plus', displayName: 'Qwen3.7 Plus', family: 'qwen', contextWindow: 1_000_000, reasoning: GO_QWEN37_REASONING, vision: true, contextLengths: [256_000], groups: ['go'] },
  { id: 'qwen3.8-flash', displayName: 'Qwen3.8 Flash', family: 'qwen', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: true, groups: ['go'] },
  /* ---------------------------------------------------------------------
   * The 2026-09 generation, added after a live listing sweep found them
   * served but absent from this registry. Until an entry exists a model still
   * appears in the menu -- the listing is the membership source -- but with the
   * family floor for a window, no effort vocabulary, and the permissive vision
   * default, so its metadata is simply wrong.
   *
   * Windows and vision come from models.dev's opencode-go entry (the same
   * source this registry already cites). Where models.dev publishes an effort
   * list it is used verbatim; where it publishes none the entry carries no
   * vocabulary, because a model with no selectable depth must not be offered a
   * picker that promises one.
   * ------------------------------------------------------------------- */
  // models.dev publishes no effort list: reasoning is on, with no selectable
  // depth. kimi-k2.6 beside it behaves the same way.
  { id: 'kimi-k2.5', displayName: 'Kimi K2.5', family: 'kimi', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
  { id: 'glm-5', displayName: 'GLM-5', family: 'glm', contextWindow: 202_752, vision: false, groups: ['go'] },
  { id: 'mimo-v2-pro', displayName: 'MiMo V2 Pro', family: 'mimo', contextWindow: CONTEXT_1M, vision: false, groups: ['go'] },
  { id: 'mimo-v2-omni', displayName: 'MiMo V2 Omni', family: 'mimo', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
  { id: 'mimo-v2.6-pro', displayName: 'MiMo V2.6 Pro', family: 'mimo', contextWindow: CONTEXT_1M, reasoning: GO_TIGHT_REASONING, vision: true, groups: ['go'] },
  { id: 'mimo-v2.6-flash', displayName: 'MiMo V2.6 Flash', family: 'mimo', contextWindow: CONTEXT_1M, reasoning: GO_TIGHT_REASONING, vision: true, groups: ['go'] },
  { id: 'longcat-2.5-preview-free', displayName: 'LongCat 2.5 Preview', family: 'longcat', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: true, groups: ['go'] },
  // Qwen3.5 carries a toggle only, so thinking is on or off and never graded;
  // an effort picker here would invent levels the route does not take.
  { id: 'qwen3.5-plus', displayName: 'Qwen3.5 Plus', family: 'qwen', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
  {
    id: 'space-bunny',
    displayName: 'Space Bunny',
    family: 'stealth',
    contextWindow: CONTEXT_1M,
    reasoning: HAIKU_MESSAGES_REASONING,
    vision: true,
    groups: ['go'],
  },
  {
    // Added with the 2026-10-08 listing refresh, which is also when the free
    // tier this family used to carry left: `space-bunny-free` stopped being
    // listed and the paid `space-bunny` appeared in its place.
    //
    // A free model with a published zero cost that still reasons: models.dev
    // gives `low/medium/high/xhigh/max` with no toggle, so it takes an effort
    // like the paid routes around it rather than a plain on/off.
    id: 'cat-jam-free',
    displayName: 'Cat Jam Free',
    family: 'stealth',
    contextWindow: CONTEXT_256K,
    reasoning: HAIKU_MESSAGES_REASONING,
    vision: false,
    groups: ['go'],
  },
  {
    // Added with the 2026-10-08 listing refresh. The docs table puts it on
    // `/v1/chat/completions` with `@ai-sdk/openai-compatible`, so the group
    // default already routes it and no `protocol` override is needed.
    //
    // A free model that still reasons: models.dev publishes `low/medium/high`
    // and no toggle, so it takes a graded effort rather than a plain on/off.
    id: 'step-5-preview-free',
    displayName: 'Step 5 Preview Free',
    family: 'step',
    contextWindow: 1_000_000,
    reasoning: GO_SHALLOW_REASONING,
    vision: true,
    groups: ['go'],
  },
  /* ---------------------------------------------------------------------
   * The 2026-10-28 listing refresh. The endpoint's catalog went from 40 ids
   * (2026-10-08) to 38, but seven ids left and six arrived, so this is a
   * near-total turn-over rather than a shrink: the departures are refused
   * above, and the arrivals below are the five that are servable on a wire
   * this plugin speaks. (`gemini-4-argon`, the sixth arrival, is on Google's
   * native surface and is refused instead.)
   *
   * Windows, vision and effort vocabularies come from models.dev's
   * `opencode-go` entry, cross-checked against the vendor's endpoints table for
   * the wire. Where models.dev publishes no effort list the entry carries no
   * vocabulary, because a model with no selectable depth must not be offered a
   * picker that promises one.
   * ------------------------------------------------------------------- */
  {
    // Arrived in the 2026-10-28 refresh. The docs table maps it to
    // `/v1/chat/completions` with `@ai-sdk/openai-compatible`, so the group
    // default already routes it.
    //
    // Thinking always runs and cannot be disabled, which is why this one takes
    // the dedicated constant rather than a sibling's.
    id: 'kimi-k3.1-pro',
    displayName: 'Kimi K3.1 Pro',
    family: 'kimi',
    contextWindow: CONTEXT_1M,
    reasoning: GO_KIMI31_REASONING,
    vision: true,
    groups: ['go'],
  },
  {
    // Arrived in the 2026-10-28 refresh, on `/v1/chat/completions`. The 3.1
    // sibling of the `minimax-m3` this registry already serves -- but the two
    // are NOT interchangeable on effort: m3 is a plain toggle there while 3.1
    // Flash takes the full five depths, so it borrows the GLM constant (same
    // five, same `high` default) rather than m3's toggle-only shape.
    //
    // Its 512,000-token OUTPUT ceiling is the largest on this endpoint and is
    // deliberately not modelled: the registry's `contextLengths` describes
    // input budgets, and conflating the two would offer a context rung the
    // model cannot actually read.
    id: 'minimax-m3.1-flash',
    displayName: 'MiniMax M3.1 Flash',
    family: 'minimax',
    contextWindow: 1_000_000,
    reasoning: GO_GLM_REASONING,
    vision: true,
    groups: ['go'],
  },
  {
    // Arrived in the 2026-10-28 refresh, on `/v1/chat/completions`. Distinct
    // from the `step-5-preview-free` that just left: same model, same three
    // published depths, but the PAID id. Declaring the free id as well would
    // mint a second row for one model, which is what `identityKey` collapsing
    // is for -- and the free id is not served any more anyway.
    id: 'step-5-preview',
    displayName: 'Step 5 Preview',
    family: 'step',
    contextWindow: 1_000_000,
    reasoning: GO_SHALLOW_REASONING,
    vision: true,
    groups: ['go'],
  },
  {
    // Arrived in the 2026-10-28 refresh on `/v1/chat/completions`, and FREE
    // while the endpoint keeps it: models.dev publishes 0/0/0 cost.
    //
    // Text-only, which is worth pinning explicitly -- the free tiers
    // around it are multimodal, and the permissive vision default would
    // otherwise let a screenshot be sent to a model that cannot read one.
    id: 'beam-free',
    displayName: 'Beam Free',
    family: 'stealth',
    contextWindow: CONTEXT_1M,
    reasoning: GO_GLM_REASONING,
    vision: false,
    groups: ['go'],
  },
  {
    // Arrived in the 2026-10-28 refresh on `/v1/chat/completions`, free while
    // the endpoint keeps it.
    //
    // Carries NO effort vocabulary on purpose. models.dev marks it
    // `reasoning: true` but publishes no `reasoning_options` for it, unlike
    // every reasoning model beside it, so there is no vocabulary to offer and
    // an effort picker here would promise a knob with no published positions.
    // Same treatment as `hy3`/`kimi-k2.6` above.
    id: 'iceman-contributor-free',
    displayName: 'Iceman Contributor Free',
    family: 'stealth',
    contextWindow: CONTEXT_256K,
    vision: false,
    groups: ['go'],
  },
  {
    id: 'grok-4.5',
    displayName: 'Grok 4.5',
    family: 'grok',
    contextWindow: 500_000,
    // Grok 4.6/4.7 beside it serve /v1/responses only and take
    // minimal/low/medium/high/xhigh. models.dev publishes low/medium/high for
    // 4.5 with no protocol note, so this entry claims only what is published
    // rather than inheriting the sibling's wider, differently-probed set.
    reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    vision: true,
    groups: ['go'],
  },
  {
    id: 'gpt-6-luna',
    displayName: 'GPT-6 Luna',
    family: 'gpt',
    contextWindow: 1_050_000,
    // The GPT-5 generation on this route serves /v1/responses; the same is
    // assumed here and the entry is marked as such so a wrong assumption fails
    // as a wrong protocol rather than as a silent 503 on the chat surface.
    reasoning: { efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    vision: true,
    protocol: 'responses',
    // Price cliff at 272K (Go docs, 2026-10-28): $0.10/$0.50 per MTok at or
    // below 272,000 input tokens per request, $0.20/$0.75 above. Declared for
    // the same reason as gpt-5.6-luna beside it -- see that entry.
    contextLengths: [272_000],
    groups: ['go'],
  },
  {
    // The one Go model served on the Anthropic wire, and the reason this plugin
    // speaks it at all. Verified 2026-10-08: the live listing carries it, and
    // the vendor's own endpoints table maps `claude-haiku-5-5` to
    // `https://opencode.ai/inference/go/v1/messages` with `@ai-sdk/anthropic` —
    // the same id on the chat surface fails as an unsupported model protocol,
    // which is what `protocol` pins here.
    //
    // `contextLengths` is the whole point of the entry. Haiku 5.5 is the only
    // model this plugin serves whose PRICE moves with the request's own input
    // size: 0.10/0.50 per MTok at or below 100,000 input tokens per request,
    // 5x that above, with the threshold counting cache reads and writes and no
    // pro-rating. The shared ladder's first rung is 200K, so without this the
    // cheap tier would be unreachable — the menu would offer only budgets that
    // sit past the cliff. Declaring 100K makes "stay under the cheap line" a
    // choice the model picker can actually express; `contextVariantsFor` holds it
    // below the group's ceiling like any other rung, and both the minted entries
    // and the settings chips read that one expression.
    //
    // Vision is from models.dev's `attachment: true` and its
    // `input: ['text','image','pdf']`; the 1M window is its published `limit`.
    id: 'claude-haiku-5-5',
    displayName: 'Claude Haiku 5.5',
    family: 'claude',
    contextWindow: 1_000_000,
    reasoning: HAIKU_MESSAGES_REASONING,
    vision: true,
    protocol: 'messages',
    contextLengths: [CONTEXT_100K],
    groups: ['go'],
  },
]

/**
 * Ids this endpoint cannot serve a chat turn for on any wire protocol.
 *
 * Two ways an id lands here, both verified by request rather than inferred:
 *
 *  - **Listed but unservable.** `minimax-m2.7` answers 503 on both
 *    chat-completions and responses; `hy3-preview` answers 400 "Model is
 *    unavailable". They stay listed (the probe table names them) but never
 *    reach the menu.
 *
 *  - **Declared here but no longer served.** These six were added when the
 *    endpoint's catalog listed them, and the catalog has since shrunk from 43
 *    ids to 36 (stable across three fetches, 2026-09-27). A registry entry
 *    tagged for this group is a menu MEMBERSHIP SOURCE, so it is offered even
 *    when the live listing no longer carries it -- which made every one of
 *    these a row whose every use answered 400 "Model is unavailable". That is
 *    the reported "sometimes it works, sometimes it errors": the row was
 *    selectable and always failed. Removing an id from this list is what puts
 *    it back the moment the endpoint serves it again.
 */
export const GO_REFUSED_MODEL_IDS: readonly string[] = [
  'hy3-preview',
  // Verified unserved 2026-09-27: 400 "Model is unavailable", and absent from
  // the live listing.
  'glm-5',
  'grok-4.5',
  'kimi-k2.5',
  'mimo-v2-omni',
  'mimo-v2-pro',
  'qwen3.5-plus',
  // ---- Dropped by the 2026-10-28 refresh -------------------------------
  //
  // Ids the 2026-10-08 listing still carried and the current one does not.
  // They are refused rather than deleted from GO_REGISTRY, which is the
  // convention this list already follows for `glm-5`/`grok-4.5`/`qwen3.5-plus`
  // and for `space-bunny-free`: a registry entry tagged for this group is a MENU
  // MEMBERSHIP SOURCE, so leaving one tagged while it is unserved puts a row in
  // the menu whose every call answers "Model is unavailable". Refusing keeps the
  // metadata one line away from returning, which matters because models.dev
  // still publishes windows for several of them.
  //
  // The listing SHRANK TWICE on this date, which is why two batches are
  // recorded. It read 38 ids in the morning and 28 when re-probed four times
  // over eighty seconds with four header variants (plain, no-cache, session,
  // bogus-bearer) -- all 28, so this is a real withdrawal and not a cache
  // artefact. The morning batch of eight arrived with the refresh; the ten
  // below went out during it.
  //
  // `cat-jam-free`, `longcat-2.5-preview-free`, `step-5-preview-free` and
  // `space-bunny` are FREE-tier ids their paid equivalents replaced. That is the
  // same tier flip `space-bunny-free` -> `space-bunny` documented last time.
  'cat-jam-free',
  'longcat-2.5-preview-free',
  'space-bunny',
  'step-5-preview-free',
  // Absent from models.dev too, so no metadata is being preserved here; they are
  // listed anyway so the refusal is explicit rather than implied by absence.
  'deepseek-flash',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
  // ---- Withdrawn between the morning and afternoon probes of 2026-10-31 ----
  //
  // These are the sharpest case in this list: several are models this registry
  // was actively serving with a hand-verified reasoning vocabulary
  // (`glm-5.1`, `grok-4.6`, `mimo-v2.5`, `qwen3.6-plus`, `qwen3.7-max`,
  // `minimax-m2.5`, `omen-alpha`). Their entries stay -- the vocabulary cost real
  // probing and comes back the moment the endpoint does -- but they must not be
  // offered while the listing omits them.
  //
  // `kimi-k2.6` and `minimax-m2.7` move here from the "listed but unservable"
  // group above: the earlier note said they were ADVERTISED yet failing
  // (410 Gone / 503). They are no longer advertised at all, which is a stronger
  // statement of the same conclusion.
  'glm-5.1',
  'grok-4.6',
  'kimi-k2.6',
  'minimax-m2.5',
  'minimax-m2.7',
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'omen-alpha',
  'qwen3.6-plus',
  'qwen3.7-max',
  // Dropped by the 2026-10-08 refresh, which is when the listing stopped
  // carrying this one. It is a REPLACE rather than a retirement -- the same
  // model's paid id `space-bunny` appeared in its place, and models.dev still
  // carries both -- but the effect on this menu is the same: a tagged entry the
  // endpoint no longer serves is a row whose every call answers "Model is
  // unavailable". Putting it here is what keeps it out of the menu while
  // leaving its metadata one line away from returning.
  'space-bunny-free',
  // Refused for a DIFFERENT reason from every other id above, and the
  // distinction matters: this one is alive and served, on a wire this plugin
  // does not speak.
  //
  // The docs table maps `gemini-4-argon-contributor` to
  // `https://opencode.ai/inference/go/v1/models/gemini-4-argon-contributor`
  // with `@ai-sdk/google`, and a probe on 2026-10-08 confirms the shape:
  // `:generateContent` below that path answers 401 (route exists, credentials
  // missing), `/chat/completions` below it answers 404, and the bare path
  // answers 400. It is Google's native generateContent surface -- a fourth
  // protocol, not any of the three this plugin speaks.
  //
  // It is therefore kept OUT of GO_REGISTRY while staying IN this list. A
  // registry entry is a menu membership source, so declaring one would mint a
  // row routed to the group's chat-completions default: selectable, and failing
  // on every single use with an error that reads like a plugin bug. Refusing it
  // omits the row instead, which is the honest answer until the fourth wire is
  // implemented.
  //
  // Its metadata for that day, from models.dev: window 1,048,576, input
  // `text,image,video,audio,pdf`, efforts `low`/`medium`/`high` with no toggle.
  'gemini-4-argon-contributor',
  // The paid sibling of the id above, added by the 2026-10-28 listing refresh
  // and refused for the SAME reason: the vendor's endpoints table maps
  // `gemini-4-argon` to
  // `https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon`
  // with `@ai-sdk/google`, which is Google's native `:generateContent` surface
  // rather than any of the three this plugin speaks.
  //
  // Worth stating plainly because it is easy to get backwards: on THIS relay
  // Gemini 4 is unreachable, but on Command Code the same model is an ordinary
  // chat-completions row (`google/gemini-4-argon`, endpoints
  // `/chat/completions` + `/responses`). Gemini 4 support therefore lands with
  // the Command Code catalog, not with a fourth wire here.
  'gemini-4-argon',
]

/** Go menu leads: the models whose thinking actually streams, in preference order. */
export const GO_DEFAULT_RECOMMENDED: readonly string[] = GO_REGISTRY
  // Same rule as the relay's list: a refused id cannot lead a menu that
  // never contains it.
  .filter(entry => entry.rank !== undefined && !GO_REFUSED_MODEL_IDS.includes(entry.id))
  .slice()
  .sort((left, right) => (left.rank as number) - (right.rank as number))
  .map(entry => entry.id)
