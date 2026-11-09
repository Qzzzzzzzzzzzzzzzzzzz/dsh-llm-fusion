import { createRequire as __createRequire } from 'node:module'; var require = __createRequire(import.meta.url);

// src/engines/protocom/index.ts
import { assertUsableApiKey, LlmError as LlmError11 } from "@deepseek-ai/dsh-llm";

// src/engines/protocom/adapter.ts
import { createHash } from "node:crypto";
import {
  IMAGE_OFFLOAD_REQUIRED_CODE,
  LlmAdapter,
  LlmError as LlmError7,
  offloadedImageText,
  projectOffloadedImages,
  ReasoningEffortId,
  requiredImageOffload
} from "@deepseek-ai/dsh-llm";
import { idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
import { requestImageDimensions } from "@deepseek-ai/dsh-attachment";

// src/engines/protocom/groups.ts
var DEFAULT_BASE_URL = "https://relay.protocom.org";
var CONTEXT_1M = 1048576;
var CONTEXT_400K = 409600;
var CONTEXT_256K = 262144;
var CONTEXT_200K = 204800;
var CONTEXT_100K = 1e5;
var CONTEXT_LADDER = [CONTEXT_200K, CONTEXT_256K, CONTEXT_400K, CONTEXT_1M];
var DEFAULT_BASE_URL_ORIGIN = new URL(DEFAULT_BASE_URL).origin;
var GROUP_KEYS = ["aggregate", "codex", "stepfun", "grok"];
var GROUP_DEFAULTS = {
  aggregate: { displayName: "Protocom Aggregate", protocol: "chat-completions" },
  codex: {
    displayName: "Protocom Codex",
    protocol: "responses",
    reasoning: { efforts: ["minimal", "low", "medium", "high", "xhigh"], defaultEffort: "medium" }
  },
  // StepFun: the relay's chat-completions surface is a translation onto
  // StepFun's own Responses API, and that translation is unusable — a replayed
  // assistant message is rendered as a content-part item the upstream refuses
  // ("210 validation errors", loc (..., 'EasyInputMessageParam', 'content',
  // 'str')), so every second turn and every tool round fails with HTTP 400.
  // Verified by request: the same conversation on /v1/responses answers 200,
  // tool calls and inline images included, which is why this group ships that
  // protocol. StepFun also publishes every model at the same four lengths
  // (200K/256K/400K/1M), so the group ships that ladder rather than one entry
  // at a fallback window.
  stepfun: {
    displayName: "Protocom StepFun",
    protocol: "responses",
    contextLengths: CONTEXT_LADDER,
    // Verified by request against the relay: `reasoning.effort` is accepted
    // (HTTP 200) on step-5-preview, step-3.7-flash and step-router-v1, and it
    // demonstrably controls how much the model thinks — on one prompt
    // `minimal`/`low` produced 0 reasoning tokens while `medium`/`high`
    // produced 14/24 (and an unset effort behaved like `medium`). StepFun's
    // Responses API publishes exactly this four-step vocabulary. Declaring it
    // is what puts an Effort submenu on these models: without it the thinking
    // budget was both uncontrolled and uncontrollable, which is how one
    // session reached 28.5K reasoning tokens before its first tool call.
    reasoning: { efforts: ["minimal", "low", "medium", "high"], defaultEffort: "medium" }
  },
  grok: {
    displayName: "Protocom Grok",
    protocol: "chat-completions",
    reasoning: { efforts: ["low", "high"], defaultEffort: "high" }
  }
};
function providerOf(key) {
  return `protocom-${key}`;
}
function groupOf(provider) {
  if (!provider.startsWith("protocom-")) return void 0;
  const key = provider.slice("protocom-".length);
  return GROUP_KEYS.includes(key) ? key : void 0;
}
function defaultKeyRef(key) {
  return `PROTOCOM_${key.toUpperCase()}_API_KEY`;
}

// src/engines/protocom/context-variants.ts
var MARKER = "::ctx@";
function encodeVariantId(upstreamId, tokens) {
  return `${upstreamId}${MARKER}${tokens}`;
}
function decodeVariantId(id) {
  const at = id.lastIndexOf(MARKER);
  if (at === -1) return { upstreamId: id };
  const tokens = Number(id.slice(at + MARKER.length));
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return { upstreamId: id };
  return { upstreamId: id.slice(0, at), contextWindow: tokens };
}
function stripVariantId(id) {
  return decodeVariantId(id).upstreamId;
}
var SAME_BUDGET_TOLERANCE = 0.08;
function withinLadderCeiling(contextWindow, configured) {
  if (configured === void 0 || configured.length === 0) return true;
  return contextWindow <= Math.max(...configured) * (1 + SAME_BUDGET_TOLERANCE);
}
function sameBudget(left, right) {
  const smaller = Math.min(left, right);
  if (smaller <= 0) return left === right;
  return Math.abs(left - right) / smaller <= SAME_BUDGET_TOLERANCE;
}
function variantLengths(contextOptions, configured) {
  if (configured === void 0 || configured.length === 0) return void 0;
  if (contextOptions === void 0) return [...new Set(configured)].sort((a, b) => a - b);
  const matched = contextOptions.filter((option) => configured.some((rung) => sameBudget(rung, option)));
  return matched.length === 0 ? void 0 : [...new Set(matched)].sort((a, b) => a - b);
}

// src/engines/protocom/model-registry.ts
function protocolForEndpoints(endpoints) {
  if (endpoints === void 0 || endpoints.length === 0) return void 0;
  if (endpoints.includes("/chat/completions")) return "chat-completions";
  if (endpoints.includes("/responses")) return "responses";
  if (endpoints.includes("/messages")) return "messages";
  return void 0;
}
function servesDeclaredEndpoints(model) {
  if (model.endpoints === void 0 || model.endpoints.length === 0) return true;
  return protocolForEndpoints(model.endpoints) !== void 0;
}
var FALLBACK_CONTEXT_WINDOW = CONTEXT_200K;
var GLM_REASONING = {
  efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
  defaultEffort: "high"
};
var GPT_REASONING = {
  efforts: ["low", "medium", "high", "xhigh", "max"],
  defaultEffort: "medium"
};
var FULL_REASONING = {
  efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  defaultEffort: "high"
};
function contextChoicesFor(contextWindow) {
  const offered = CONTEXT_LADDER.filter((length) => length < contextWindow);
  return [...offered, contextWindow].sort((left, right) => left - right);
}
var REGISTRY = [
  {
    id: "kimi-k3",
    displayName: "Kimi K3",
    family: "kimi",
    contextWindow: CONTEXT_256K,
    // Live-verified 2026-09-27: minimal, medium, xhigh and max all answer 200.
    // Only `none` is refused, so the narrower pair this used to declare hid
    // levels the model serves.
    reasoning: { efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], defaultEffort: "high" },
    vision: true,
    rank: 1
  },
  {
    id: "glm-5.2",
    displayName: "GLM-5.2",
    family: "glm",
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    // Text-only by the vendor's own documentation. Declared rather than left
    // absent: an absent verdict now means "unknown", and unknown is permissive.
    vision: false,
    rank: 2
  },
  {
    id: "mimo-v2.5",
    displayName: "MiMo V2.5",
    family: "mimo",
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ["none", "low", "medium", "high"], defaultEffort: "high" },
    vision: true,
    rank: 3
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    displayName: "DeepSeek V4.1 Flash",
    family: "deepseek",
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ["none", "low", "high", "max"], defaultEffort: "none" },
    vision: true
  },
  {
    id: "deepseek-v4.1-flash",
    displayName: "DeepSeek V4.1 Flash",
    family: "deepseek",
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ["none", "low", "high", "max"], defaultEffort: "none" },
    vision: true
  },
  {
    // PROBED 2026-10-01: this route now ACCEPTS `reasoning_effort` at six of
    // the seven levels (only `medium` answers 400). The note that stood here
    // recorded an outright rejection and was the reason this model had no
    // Effort submenu; the endpoint changed and the note did not. The declared
    // set is the measured one, with `medium` deliberately absent because the
    // relay refuses it.
    id: "moonshotai/Kimi-K2.7-Code",
    displayName: "Kimi K2.7 Code",
    family: "kimi",
    contextWindow: CONTEXT_256K,
    reasoning: { efforts: ["none", "minimal", "low", "high", "xhigh", "max"], defaultEffort: "low" },
    vision: true
  },
  {
    id: "zai-org/GLM-5.2",
    displayName: "GLM-5.2",
    family: "glm",
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: false,
    // Same name as the bare id, but NOT the same route: live-verified
    // 2026-09-27, the bare `glm-5.2` answers 400 to a disabled-thinking
    // request while this one answers 200. Aliasing them by name, which is the
    // default, would make a visibility or context choice on either silently
    // govern both, so this entry keeps its own identity.
    identity: "zai-org/GLM-5.2"
  },
  {
    id: "glm-5.3",
    displayName: "GLM-5.3",
    family: "glm",
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: false
  },
  {
    id: "z-ai/glm-5.3-flash",
    displayName: "GLM-5.3 Flash",
    family: "glm",
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: true
  },
  {
    id: "z-ai/glm-5.3-flashx",
    displayName: "GLM-5.3 FlashX",
    family: "glm",
    contextWindow: CONTEXT_1M,
    reasoning: GLM_REASONING,
    vision: true
  },
  { id: "Qwen/Qwen3.8-27B", displayName: "Qwen3.8 27B", family: "qwen", contextWindow: CONTEXT_1M, reasoning: FULL_REASONING, vision: true },
  { id: "qwen3.8-max", displayName: "Qwen3.8 Max", family: "qwen", contextWindow: CONTEXT_1M },
  { id: "Qwen/Qwen3.7-Flash", displayName: "Qwen3.7 Flash", family: "qwen", contextWindow: CONTEXT_256K, reasoning: FULL_REASONING, vision: true },
  { id: "Qwen/Qwen3.8-Omni-Flash", displayName: "Qwen3.8 Omni Flash", family: "qwen", contextWindow: CONTEXT_1M, reasoning: FULL_REASONING, vision: true },
  {
    id: "MiniMaxAI/MiniMax-M3",
    displayName: "MiniMax M3",
    family: "minimax",
    contextWindow: CONTEXT_1M,
    // Live-verified 2026-09-27: none and xhigh both answer 200 on top of the
    // three this declared, so the pair was a menu restriction rather than a
    // capability limit.
    reasoning: { efforts: ["none", "low", "medium", "high", "xhigh"], defaultEffort: "high" },
    vision: true
  },
  {
    id: "mimo-v2.5-pro",
    displayName: "MiMo V2.5 Pro",
    family: "mimo",
    contextWindow: CONTEXT_1M,
    reasoning: { efforts: ["none", "low", "medium", "high"], defaultEffort: "high" },
    // The endpoint answered 404 "no endpoints found that support image input".
    vision: false
  },
  {
    id: "google/gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    family: "gemini",
    contextWindow: CONTEXT_1M,
    // Probed 2026-10-01: all seven levels answer 200.
    reasoning: FULL_REASONING,
    vision: true
  },
  {
    id: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    family: "gpt",
    contextWindow: CONTEXT_1M,
    reasoning: GPT_REASONING,
    vision: true,
    groups: ["codex"]
  },
  {
    id: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    family: "gpt",
    contextWindow: CONTEXT_1M,
    reasoning: GPT_REASONING,
    vision: true,
    groups: ["codex"]
  },
  {
    // Verified by request against this endpoint: `step-5-preview` answers a
    // chat turn carrying an inline image (HTTP 200, "Red"), and StepFun
    // publishes it at a 1M window. It is the only StepFun id curated here —
    // the others ride from the group's own listing with the group's ladder,
    // because sizing a model on a guess would narrow its menu to steps it
    // cannot honour.
    id: "step-5-preview",
    displayName: "Step 5 Preview",
    family: "step",
    contextWindow: CONTEXT_1M,
    vision: true,
    groups: ["stepfun"]
  },
  // These four answer "not available on this endpoint" on /v1/chat/completions
  // whenever the endpoint lists them, so their facts cannot be verified by
  // request; the values follow their generation's published window. They stay
  // catalogued rather than blocked — the picker's toggles are how a deployment
  // says which models it wants, and a model that starts serving should simply
  // start working.
  { id: "google/gemini-3.7-flash", displayName: "Gemini 3.7 Flash", family: "gemini", contextWindow: CONTEXT_1M, vision: true },
  { id: "tencent/hy4-preview", displayName: "HY-4 Preview", family: "hunyuan", contextWindow: CONTEXT_256K },
  { id: "inclusionai/ling-3.0-flash-sante:free", displayName: "Ling 3.0 Flash Sante", family: "inclusionai", contextWindow: CONTEXT_256K },
  { id: "Qwen/Qwen3.8-Flash", displayName: "Qwen3.8 Flash", family: "qwen", contextWindow: CONTEXT_1M, vision: true },
  // Context values below follow each model's published ceiling; the two marked
  // unverified follow their family's documented window.
  { id: "tencent/hy3-paid", displayName: "HY-3", family: "hunyuan", contextWindow: CONTEXT_256K, reasoning: FULL_REASONING },
  { id: "meituan/LongCat-2.0:free", displayName: "LongCat 2.0", family: "longcat", contextWindow: CONTEXT_256K },
  { id: "poolside/laguna-s-2.1-free", displayName: "Laguna S 2.1 Free", family: "poolside", contextWindow: CONTEXT_256K, reasoning: FULL_REASONING },
  { id: "meta/muse-spark-1.3-contributor", displayName: "Muse Spark 1.3 Contributor", family: "meta", contextWindow: CONTEXT_1M, reasoning: FULL_REASONING, vision: true },
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
    id: "mimo-v2.6-flash",
    displayName: "MiMo V2.6 Flash",
    family: "mimo",
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true
  },
  {
    id: "mimo-v2.6-pro",
    displayName: "MiMo V2.6 Pro",
    family: "mimo",
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true
  },
  {
    id: "xiaomi/mimo-v2.6-flash",
    displayName: "MiMo V2.6 Flash",
    family: "mimo",
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true
  },
  {
    id: "xiaomi/mimo-v2.6-pro-ultraspeed",
    displayName: "MiMo V2.6 Pro Ultraspeed",
    family: "mimo",
    contextWindow: CONTEXT_1M,
    reasoning: FULL_REASONING,
    vision: true
  },
  {
    id: "gpt-6-luna",
    displayName: "GPT-6 Luna",
    family: "gpt",
    contextWindow: 105e4,
    reasoning: FULL_REASONING,
    vision: true,
    protocol: "responses"
  }
];
function matchRegistry(id, registry = REGISTRY) {
  return registry.find((entry) => entry.id === id);
}
function servesGroup(entry, key) {
  return entry.groups?.includes(key) === true;
}
var REFUSED_CHAT_MODEL_IDS = [
  // StepFun: refused on this relay's routes (404 not-found / 400 not-enabled).
  "step-3.5-flash",
  "step-3.5-flash-2603",
  "step-explore",
  "step-image-edit-2",
  "stepaudio-2.5-asr",
  "stepaudio-2.5-chat",
  "stepaudio-2.5-realtime",
  "stepaudio-2.5-tts",
  // Aggregate: listed, but "not available on this endpoint" on both routes.
  "Qwen/Qwen3.8-Flash",
  "google/gemini-3.7-flash",
  "tencent/hy4-preview",
  "inclusionai/ling-3.0-flash-sante:free",
  // The bare id is listed and refused; the `:free` suffix variant is a
  // different id the relay does not list at all. Re-verified 2026-09-27.
  "meituan/LongCat-2.0",
  // Registry entries that no credential lists and every route answers 404
  // for, re-verified 2026-09-27. Family-scoping is what makes this correct:
  // `mimo-v2.5` is refused HERE and still served on OpenCode Go, where its
  // own registry entry keeps it in that menu.
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "meituan/LongCat-2.0:free"
];
function servesChat(id, refused = REFUSED_CHAT_MODEL_IDS) {
  return !refused.includes(id);
}
function acceptsImages(id, declared, registry = REGISTRY) {
  const chosen = declared?.get(identityKey(id, registry));
  if (chosen !== void 0) return chosen;
  return matchRegistry(id, registry)?.vision !== false;
}
var DEFAULT_RECOMMENDED = REGISTRY.filter((entry) => entry.rank !== void 0 && servesChat(entry.id)).slice().sort((left, right) => left.rank - right.rank).map((entry) => entry.id);
function identityKey(id, registry = REGISTRY) {
  const entry = matchRegistry(id, registry);
  if (entry === void 0) return id;
  if (entry.identity !== void 0) return entry.identity;
  const sibling = registry.find((candidate) => candidate.displayName === entry.displayName && candidate.identity === void 0);
  return sibling?.id ?? id;
}
function modelIdentities(registry = REGISTRY) {
  const byIdentity = /* @__PURE__ */ new Map();
  for (const entry of registry) {
    const identity = identityKey(entry.id, registry);
    const hit = byIdentity.get(identity);
    if (hit === void 0) byIdentity.set(identity, { entry, ids: [entry.id] });
    else hit.ids.push(entry.id);
  }
  return [...byIdentity.values()].map(({ entry, ids }) => ({ displayName: entry.displayName, ids, entry }));
}
function contextLabel(tokens) {
  if (tokens === CONTEXT_100K) return "100K (dec)";
  if (tokens === 1e6) return "1M (dec)";
  if (tokens % 1048576 === 0) return `${tokens / 1048576}M`;
  if (tokens % 1e3 === 0) {
    const decimalK = tokens / 1e3;
    return decimalK >= 1e3 ? `${decimalK / 1e3}M (dec)` : `${decimalK}K (dec)`;
  }
  return `${Math.round(tokens / 1024)}K`;
}
function displayNameWithContext(displayName, tokens) {
  return `${displayName} [${contextLabel(tokens)}]`;
}
function catalogEntry(upstream, groupReasoning, declaredVision, registry = REGISTRY) {
  const entry = matchRegistry(upstream.id, registry);
  const disclosed = upstream.reasoningEfforts !== void 0 && upstream.reasoningEfforts.length > 0 ? {
    efforts: upstream.reasoningEfforts,
    defaultEffort: upstream.reasoningEfforts.includes("high") ? "high" : upstream.reasoningEfforts[0]
  } : void 0;
  const reasoning = entry?.reasoning ?? disclosed ?? groupReasoning;
  if (entry === void 0) {
    return {
      upstreamId: upstream.id,
      displayName: upstream.displayName !== void 0 && upstream.displayName !== upstream.id ? upstream.displayName : upstream.id,
      contextWindow: upstream.contextWindow ?? FALLBACK_CONTEXT_WINDOW,
      // Only the endpoint's own number is a fact. The floor default is a guess,
      // and the two must stay distinguishable downstream.
      ...upstream.contextWindow === void 0 ? {} : { contextWindowDisclosed: true },
      ...reasoning === void 0 ? {} : { reasoning },
      // A source that states the verdict outranks the permissive default; a
      // deployment's own declaration still outranks both.
      vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, void 0, registry),
      rank: Number.MAX_SAFE_INTEGER
    };
  }
  return {
    upstreamId: upstream.id,
    displayName: entry.displayName,
    contextWindow: entry.contextWindow,
    contextOptions: contextChoicesFor(entry.contextWindow),
    ...entry.contextLengths === void 0 ? {} : { contextLengths: entry.contextLengths },
    ...reasoning === void 0 ? {} : { reasoning },
    vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, void 0, registry),
    rank: entry.rank ?? Number.MAX_SAFE_INTEGER
  };
}
function contextVariantsFor(model, ladder, chosen) {
  if (chosen !== void 0 && chosen.length > 0) {
    const allowed = chosen.filter((length) => length <= model.contextWindow);
    return allowed.length > 0 ? [...new Set(allowed)].sort((left, right) => left - right) : void 0;
  }
  const declared = (model.contextLengths ?? []).filter((length) => withinLadderCeiling(length, ladder));
  if (ladder === void 0 || ladder.length === 0) {
    return declared.length === 0 ? void 0 : [...new Set(declared)].sort((left, right) => left - right);
  }
  const offered = contextStepsFor(model, ladder);
  return [.../* @__PURE__ */ new Set([...offered, ...declared])].sort((left, right) => left - right);
}
function contextStepsFor(model, ladder) {
  if (model.contextOptions !== void 0) {
    const matched = variantLengths(model.contextOptions, ladder) ?? [];
    const steps = withinLadderCeiling(model.contextWindow, ladder) ? [.../* @__PURE__ */ new Set([...matched, model.contextWindow])] : [...new Set(matched)];
    return steps.length > 0 ? steps.sort((left, right) => left - right) : [model.contextWindow];
  }
  if (ladder === void 0 || ladder.length === 0) return [model.contextWindow];
  const allowed = model.contextWindowDisclosed === true ? ladder.filter((length) => length <= model.contextWindow) : [...ladder];
  return allowed.length > 0 ? allowed : [model.contextWindow];
}
function groupCatalog(key, listing, options = {}) {
  const registry = options.family?.registry ?? REGISTRY;
  const refused = options.family?.refused ?? REFUSED_CHAT_MODEL_IDS;
  const groupReasoning = options.family === void 0 ? GROUP_DEFAULTS[key].reasoning : options.family.defaults[key]?.reasoning;
  const rows = listing === void 0 ? [] : [...listing];
  for (const entry of registry) {
    if (!servesGroup(entry, key)) continue;
    if (!rows.some((row) => row.id === entry.id)) rows.push({ id: entry.id });
  }
  if (rows.length === 0 && options.registryFallback !== false) {
    for (const entry of registry) rows.push({ id: entry.id });
  }
  const rankOf = (id) => {
    const at = options.recommended?.indexOf(identityKey(id, registry)) ?? -1;
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const ranked = rows.filter((row) => servesChat(row.id, refused) && servesDeclaredEndpoints(row) && row.outOfPlan !== true && options.hidden?.has(row.id) !== true).map((row, index) => ({ index, row, rank: rankOf(row.id) })).sort((left, right) => left.rank - right.rank || left.index - right.index);
  const byIdentity = /* @__PURE__ */ new Map();
  for (const { row } of ranked) {
    const model = catalogEntry(row, groupReasoning, options.vision, registry);
    const identity = identityKey(row.id, registry);
    const hit = byIdentity.get(identity);
    if (hit === void 0) {
      byIdentity.set(identity, {
        upstreamId: row.id,
        ids: [row.id],
        displayName: model.displayName,
        contextWindow: model.contextWindow,
        // Carried through: the adapter and the settings row both need to know
        // whether this window is the endpoint's fact or this plugin's guess.
        ...model.contextWindowDisclosed === true ? { contextWindowDisclosed: true } : {},
        ...model.contextOptions === void 0 ? {} : { contextOptions: [...model.contextOptions] },
        ...model.contextLengths === void 0 ? {} : { contextLengths: [...model.contextLengths] },
        ...model.reasoning === void 0 ? {} : { reasoning: model.reasoning },
        vision: model.vision,
        rank: model.rank
      });
      continue;
    }
    hit.ids.push(row.id);
  }
  return [...byIdentity.values()];
}
var GO_FULL_REASONING = {
  efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  defaultEffort: "high"
};
var GO_KIMI31_REASONING = {
  efforts: ["low", "high", "max"],
  defaultEffort: "max"
};
var GO_TIGHT_REASONING = {
  efforts: ["none", "low", "medium", "high"],
  defaultEffort: "high"
};
var GO_GLM_REASONING = {
  efforts: ["low", "medium", "high", "xhigh", "max"],
  defaultEffort: "high"
};
var GO_RESPONSES_REASONING = {
  efforts: ["minimal", "low", "medium", "high", "xhigh"],
  defaultEffort: "medium"
};
var GO_QWEN37_REASONING = {
  efforts: ["none", "minimal", "low", "medium", "high", "xhigh"],
  defaultEffort: "medium"
};
var GO_SHALLOW_REASONING = {
  efforts: ["low", "medium", "high"],
  defaultEffort: "medium"
};
var HAIKU_MESSAGES_REASONING = {
  efforts: ["low", "medium", "high", "xhigh", "max"],
  defaultEffort: "medium"
};
var GO_REGISTRY = [
  {
    id: "deepseek-v4.1-flash",
    displayName: "DeepSeek V4.1 Flash",
    family: "deepseek",
    contextWindow: 1e6,
    reasoning: GO_FULL_REASONING,
    vision: true,
    groups: ["go"],
    rank: 1
  },
  {
    id: "glm-5.3",
    displayName: "GLM-5.3",
    family: "glm",
    contextWindow: 1e6,
    reasoning: GO_GLM_REASONING,
    vision: false,
    groups: ["go"],
    rank: 2
  },
  {
    id: "kimi-k3",
    displayName: "Kimi K3",
    family: "kimi",
    contextWindow: CONTEXT_1M,
    reasoning: GO_FULL_REASONING,
    vision: true,
    groups: ["go"],
    rank: 3
  },
  {
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    family: "deepseek",
    contextWindow: 1e6,
    reasoning: GO_FULL_REASONING,
    vision: false,
    groups: ["go"],
    rank: 4
  },
  {
    id: "qwen3.8-max",
    displayName: "Qwen3.8 Max",
    family: "qwen",
    contextWindow: 1e6,
    reasoning: GO_FULL_REASONING,
    vision: true,
    groups: ["go"],
    rank: 5
  },
  {
    id: "grok-4.6",
    displayName: "Grok 4.6",
    family: "grok",
    contextWindow: 5e5,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: "responses",
    groups: ["go"],
    rank: 6
  },
  {
    // Listed by the endpoint and serviceable on /v1/responses, which the Go
    // gateway refuses to advertise. With no entry here the id fell back to the
    // group's chat protocol and every call answered 503 "Endpoint is
    // unavailable" (measured). Its effort vocabulary was probed model by model
    // rather than inherited: minimal/low/medium/high/xhigh all answer 200 and
    // none/max answer 400 -- the same set as grok-4.6, verified separately.
    id: "grok-4.7",
    displayName: "Grok 4.7",
    family: "grok",
    contextWindow: 5e5,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: "responses",
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
    contextLengths: [2e5],
    groups: ["go"],
    rank: 7
  },
  { id: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", family: "deepseek", contextWindow: 1e6, reasoning: GO_FULL_REASONING, vision: false, groups: ["go"] },
  { id: "deepseek-v4-flash-vision-exp", displayName: "DeepSeek V4 Flash Vision", family: "deepseek", contextWindow: 1e6, reasoning: GO_FULL_REASONING, vision: true, groups: ["go"] },
  // Live-listed but absent from models.dev: the window is unverified, so the
  // entry keeps the family floor rather than claiming the generation's 1M.
  { id: "deepseek-flash", displayName: "DeepSeek Flash", family: "deepseek", contextWindow: FALLBACK_CONTEXT_WINDOW, reasoning: GO_FULL_REASONING, groups: ["go"] },
  { id: "glm-5.1", displayName: "GLM-5.1", family: "glm", contextWindow: 202752, reasoning: GO_GLM_REASONING, vision: false, groups: ["go"] },
  { id: "glm-5.2", displayName: "GLM-5.2", family: "glm", contextWindow: 1e6, reasoning: GO_GLM_REASONING, vision: false, groups: ["go"] },
  { id: "glm-5.3-flash", displayName: "GLM-5.3 Flash", family: "glm", contextWindow: 1e6, reasoning: GO_FULL_REASONING, vision: true, groups: ["go"] },
  {
    id: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    family: "gpt",
    contextWindow: 105e4,
    // `minimal` answers 400; `none` disables.
    reasoning: { efforts: ["none", "low", "medium", "high", "xhigh", "max"], defaultEffort: "medium" },
    vision: true,
    protocol: "responses",
    // Price cliff at 272K (Go docs, 2026-10-28): $0.20/$1.20 per MTok at or
    // below 272,000 input tokens per request, $0.40/$1.80 above.
    //
    // Declared even though the ladder already has two rungs under the line
    // (204,800 and 262,144), because without it the menu cannot express the
    // boundary ITSELF: an operator who wants "as much as I can get while still
    // cheap" has to guess between 262,144 and 409,600, and 409,600 is double
    // the price. 272,000 is the actual ceiling of the cheap band.
    contextLengths: [272e3],
    groups: ["go"]
  },
  // hy3 and hy4-preview accept the effort field but never emit thinking on any
  // effort, so they carry no vocabulary — an effort picker would promise a
  // knob the model does not have.
  { id: "hy3", displayName: "HY-3", family: "hunyuan", contextWindow: 256e3, reasoning: GO_FULL_REASONING, vision: false, groups: ["go"] },
  { id: "hy4-preview", displayName: "HY-4 Preview", family: "hunyuan", contextWindow: 1024e3, reasoning: GO_FULL_REASONING, vision: false, groups: ["go"] },
  // kimi-k2.6 and mimo-v2.5 accept the field but never stream thinking.
  { id: "kimi-k2.6", displayName: "Kimi K2.6", family: "kimi", contextWindow: CONTEXT_256K, vision: true, groups: ["go"] },
  {
    id: "kimi-k2.7-code",
    displayName: "Kimi K2.7 Code",
    family: "kimi",
    contextWindow: CONTEXT_256K,
    // `none` answers 400 on this route; `off` is the disabling word.
    reasoning: { efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], defaultEffort: "medium" },
    vision: true,
    groups: ["go"]
  },
  { id: "longcat-2.0", displayName: "LongCat 2.0", family: "longcat", contextWindow: 1e6, reasoning: GO_FULL_REASONING, vision: false, groups: ["go"] },
  { id: "mimo-v2.5", displayName: "MiMo V2.5", family: "mimo", contextWindow: 1e6, reasoning: GO_TIGHT_REASONING, vision: true, groups: ["go"] },
  {
    id: "mimo-v2.5-pro",
    displayName: "MiMo V2.5 Pro",
    family: "mimo",
    contextWindow: CONTEXT_1M,
    // `minimal`, `xhigh`, `max` and `off` all answer 400.
    reasoning: { efforts: ["none", "low", "medium", "high"], defaultEffort: "medium" },
    vision: false,
    groups: ["go"]
  },
  {
    id: "minimax-m2.5",
    displayName: "MiniMax M2.5",
    family: "minimax",
    contextWindow: CONTEXT_200K,
    // Reasoning is mandatory: `none`, `off` and `minimum` answer 400. The
    // stream arrives on `delta.reasoning` (plus `reasoning_details`), not
    // `reasoning_content`.
    reasoning: { efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], defaultEffort: "medium" },
    vision: false,
    groups: ["go"]
  },
  {
    id: "minimax-m3",
    displayName: "MiniMax M3",
    family: "minimax",
    contextWindow: 1e6,
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
    groups: ["go"]
  },
  {
    id: "muse-spark-1.2-contributor",
    displayName: "Muse Spark 1.2 Contributor",
    family: "meta",
    contextWindow: CONTEXT_1M,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: "responses",
    groups: ["go"]
  },
  {
    id: "muse-spark-1.3-contributor",
    displayName: "Muse Spark 1.3 Contributor",
    family: "meta",
    contextWindow: CONTEXT_1M,
    reasoning: GO_RESPONSES_REASONING,
    vision: true,
    protocol: "responses",
    groups: ["go"]
  },
  {
    id: "omen-alpha",
    displayName: "Omen Alpha",
    family: "omen",
    contextWindow: 5e5,
    // `xhigh` answers 400; `off` and `minimum` are refused spellings.
    reasoning: { efforts: ["none", "minimal", "low", "medium", "high", "max"], defaultEffort: "medium" },
    vision: true,
    groups: ["go"]
  },
  {
    id: "qwen3.6-plus",
    displayName: "Qwen3.6 Plus",
    family: "qwen",
    contextWindow: 1e6,
    // This route's minimal step is spelled `minimum`; `minimal`, `max` and
    // `off` all answer 400.
    reasoning: { efforts: ["none", "minimum", "low", "medium", "high", "xhigh"], defaultEffort: "medium" },
    vision: true,
    groups: ["go"]
  },
  { id: "qwen3.7-max", displayName: "Qwen3.7 Max", family: "qwen", contextWindow: 1e6, reasoning: GO_QWEN37_REASONING, vision: false, groups: ["go"] },
  // Price cliff at 256K (Go docs, 2026-10-28): $0.40/$1.60 per MTok at or below
  // 256,000 input tokens per request, $1.20/$4.80 above -- a 3x step, the
  // steepest in the catalog after Haiku's 5x.
  //
  // The ladder's 204,800 already sits under the line, so unlike grok-4.7 the
  // cheap tier was always reachable. What the declaration adds is the boundary,
  // which otherwise falls between 262,144 (just over) and 204,800 (24% under):
  // without it the operator cannot ask for "up to the cheap limit".
  { id: "qwen3.7-plus", displayName: "Qwen3.7 Plus", family: "qwen", contextWindow: 1e6, reasoning: GO_QWEN37_REASONING, vision: true, contextLengths: [256e3], groups: ["go"] },
  { id: "qwen3.8-flash", displayName: "Qwen3.8 Flash", family: "qwen", contextWindow: 1e6, reasoning: GO_FULL_REASONING, vision: true, groups: ["go"] },
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
  { id: "kimi-k2.5", displayName: "Kimi K2.5", family: "kimi", contextWindow: CONTEXT_256K, vision: true, groups: ["go"] },
  { id: "glm-5", displayName: "GLM-5", family: "glm", contextWindow: 202752, vision: false, groups: ["go"] },
  { id: "mimo-v2-pro", displayName: "MiMo V2 Pro", family: "mimo", contextWindow: CONTEXT_1M, vision: false, groups: ["go"] },
  { id: "mimo-v2-omni", displayName: "MiMo V2 Omni", family: "mimo", contextWindow: CONTEXT_256K, vision: true, groups: ["go"] },
  { id: "mimo-v2.6-pro", displayName: "MiMo V2.6 Pro", family: "mimo", contextWindow: CONTEXT_1M, reasoning: GO_TIGHT_REASONING, vision: true, groups: ["go"] },
  { id: "mimo-v2.6-flash", displayName: "MiMo V2.6 Flash", family: "mimo", contextWindow: CONTEXT_1M, reasoning: GO_TIGHT_REASONING, vision: true, groups: ["go"] },
  { id: "longcat-2.5-preview-free", displayName: "LongCat 2.5 Preview", family: "longcat", contextWindow: 1e6, reasoning: GO_FULL_REASONING, vision: true, groups: ["go"] },
  // Qwen3.5 carries a toggle only, so thinking is on or off and never graded;
  // an effort picker here would invent levels the route does not take.
  { id: "qwen3.5-plus", displayName: "Qwen3.5 Plus", family: "qwen", contextWindow: CONTEXT_256K, vision: true, groups: ["go"] },
  {
    id: "space-bunny",
    displayName: "Space Bunny",
    family: "stealth",
    contextWindow: CONTEXT_1M,
    reasoning: HAIKU_MESSAGES_REASONING,
    vision: true,
    groups: ["go"]
  },
  {
    // Added with the 2026-10-08 listing refresh, which is also when the free
    // tier this family used to carry left: `space-bunny-free` stopped being
    // listed and the paid `space-bunny` appeared in its place.
    //
    // A free model with a published zero cost that still reasons: models.dev
    // gives `low/medium/high/xhigh/max` with no toggle, so it takes an effort
    // like the paid routes around it rather than a plain on/off.
    id: "cat-jam-free",
    displayName: "Cat Jam Free",
    family: "stealth",
    contextWindow: CONTEXT_256K,
    reasoning: HAIKU_MESSAGES_REASONING,
    vision: false,
    groups: ["go"]
  },
  {
    // Added with the 2026-10-08 listing refresh. The docs table puts it on
    // `/v1/chat/completions` with `@ai-sdk/openai-compatible`, so the group
    // default already routes it and no `protocol` override is needed.
    //
    // A free model that still reasons: models.dev publishes `low/medium/high`
    // and no toggle, so it takes a graded effort rather than a plain on/off.
    id: "step-5-preview-free",
    displayName: "Step 5 Preview Free",
    family: "step",
    contextWindow: 1e6,
    reasoning: GO_SHALLOW_REASONING,
    vision: true,
    groups: ["go"]
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
    id: "kimi-k3.1-pro",
    displayName: "Kimi K3.1 Pro",
    family: "kimi",
    contextWindow: CONTEXT_1M,
    reasoning: GO_KIMI31_REASONING,
    vision: true,
    groups: ["go"]
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
    id: "minimax-m3.1-flash",
    displayName: "MiniMax M3.1 Flash",
    family: "minimax",
    contextWindow: 1e6,
    reasoning: GO_GLM_REASONING,
    vision: true,
    groups: ["go"]
  },
  {
    // Arrived in the 2026-10-28 refresh, on `/v1/chat/completions`. Distinct
    // from the `step-5-preview-free` that just left: same model, same three
    // published depths, but the PAID id. Declaring the free id as well would
    // mint a second row for one model, which is what `identityKey` collapsing
    // is for -- and the free id is not served any more anyway.
    id: "step-5-preview",
    displayName: "Step 5 Preview",
    family: "step",
    contextWindow: 1e6,
    reasoning: GO_SHALLOW_REASONING,
    vision: true,
    groups: ["go"]
  },
  {
    // Arrived in the 2026-10-28 refresh on `/v1/chat/completions`, and FREE
    // while the endpoint keeps it: models.dev publishes 0/0/0 cost.
    //
    // Text-only, which is worth pinning explicitly -- the free tiers
    // around it are multimodal, and the permissive vision default would
    // otherwise let a screenshot be sent to a model that cannot read one.
    id: "beam-free",
    displayName: "Beam Free",
    family: "stealth",
    contextWindow: CONTEXT_1M,
    reasoning: GO_GLM_REASONING,
    vision: false,
    groups: ["go"]
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
    id: "iceman-contributor-free",
    displayName: "Iceman Contributor Free",
    family: "stealth",
    contextWindow: CONTEXT_256K,
    vision: false,
    groups: ["go"]
  },
  {
    id: "grok-4.5",
    displayName: "Grok 4.5",
    family: "grok",
    contextWindow: 5e5,
    // Grok 4.6/4.7 beside it serve /v1/responses only and take
    // minimal/low/medium/high/xhigh. models.dev publishes low/medium/high for
    // 4.5 with no protocol note, so this entry claims only what is published
    // rather than inheriting the sibling's wider, differently-probed set.
    reasoning: { efforts: ["low", "medium", "high"], defaultEffort: "medium" },
    vision: true,
    groups: ["go"]
  },
  {
    id: "gpt-6-luna",
    displayName: "GPT-6 Luna",
    family: "gpt",
    contextWindow: 105e4,
    // The GPT-5 generation on this route serves /v1/responses; the same is
    // assumed here and the entry is marked as such so a wrong assumption fails
    // as a wrong protocol rather than as a silent 503 on the chat surface.
    reasoning: { efforts: ["none", "low", "medium", "high", "xhigh", "max"], defaultEffort: "medium" },
    vision: true,
    protocol: "responses",
    // Price cliff at 272K (Go docs, 2026-10-28): $0.10/$0.50 per MTok at or
    // below 272,000 input tokens per request, $0.20/$0.75 above. Declared for
    // the same reason as gpt-5.6-luna beside it -- see that entry.
    contextLengths: [272e3],
    groups: ["go"]
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
    id: "claude-haiku-5-5",
    displayName: "Claude Haiku 5.5",
    family: "claude",
    contextWindow: 1e6,
    reasoning: HAIKU_MESSAGES_REASONING,
    vision: true,
    protocol: "messages",
    contextLengths: [CONTEXT_100K],
    groups: ["go"]
  }
];
var GO_REFUSED_MODEL_IDS = [
  "hy3-preview",
  // Verified unserved 2026-09-27: 400 "Model is unavailable", and absent from
  // the live listing.
  "glm-5",
  "grok-4.5",
  "kimi-k2.5",
  "mimo-v2-omni",
  "mimo-v2-pro",
  "qwen3.5-plus",
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
  "cat-jam-free",
  "longcat-2.5-preview-free",
  "space-bunny",
  "step-5-preview-free",
  // Absent from models.dev too, so no metadata is being preserved here; they are
  // listed anyway so the refusal is explicit rather than implied by absence.
  "deepseek-flash",
  "deepseek-v4-flash",
  "deepseek-v4-flash-vision-exp",
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
  "glm-5.1",
  "grok-4.6",
  "kimi-k2.6",
  "minimax-m2.5",
  "minimax-m2.7",
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "omen-alpha",
  "qwen3.6-plus",
  "qwen3.7-max",
  // Dropped by the 2026-10-08 refresh, which is when the listing stopped
  // carrying this one. It is a REPLACE rather than a retirement -- the same
  // model's paid id `space-bunny` appeared in its place, and models.dev still
  // carries both -- but the effect on this menu is the same: a tagged entry the
  // endpoint no longer serves is a row whose every call answers "Model is
  // unavailable". Putting it here is what keeps it out of the menu while
  // leaving its metadata one line away from returning.
  "space-bunny-free",
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
  "gemini-4-argon-contributor",
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
  "gemini-4-argon"
];
var GO_DEFAULT_RECOMMENDED = GO_REGISTRY.filter((entry) => entry.rank !== void 0 && !GO_REFUSED_MODEL_IDS.includes(entry.id)).slice().sort((left, right) => left.rank - right.rank).map((entry) => entry.id);

// src/engines/protocom/commandcode-tiers.ts
var SETS = {
  "none": [
    "MiniMaxAI/MiniMax-M2.5",
    "MiniMaxAI/MiniMax-M2.7",
    "Qwen/Qwen3.6-Max-Preview",
    "Qwen/Qwen3.6-Plus",
    "Qwen/Qwen3.7-Flash",
    "Qwen/Qwen3.7-Max",
    "Qwen/Qwen3.7-Plus",
    "claude-haiku-4-5-20251001",
    "meituan/LongCat-2.0",
    "moonshotai/Kimi-K2.5",
    "moonshotai/Kimi-K2.6",
    "moonshotai/Kimi-K2.7-Code",
    "moonshotai/Kimi-K2.7-Code-Highspeed",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "ornith/ornith-1.5-122b",
    "poolside/laguna-s-2.1-free",
    "stepfun/Step-3.5-Flash",
    "stepfun/Step-3.7-Flash",
    "tencent/hy3-paid",
    "thinkingmachines/inkling",
    "thinkingmachines/inkling-small",
    "xiaomi/mimo-v2.6-flash",
    "xiaomi/mimo-v2.6-pro",
    "xiaomi/mimo-v2.6-pro-ultraspeed",
    "zai-org/GLM-5",
    "zai-org/GLM-5.1",
    "zai-org/GLM-5.2-Fast"
  ],
  "low,medium,high,xhigh,max": [
    "claude-fable-5",
    "claude-fable-5-1",
    "claude-haiku-5-5",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-5",
    "claude-opus-5-5",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
    "claude-sonnet-5-5",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-6.1-terra",
    "meta/muse-spark-1.3",
    "minimax/minimax-m3.1-flash",
    "reflection/beam:free"
  ],
  "low,medium,high": [
    "MiniMaxAI/MiniMax-M3",
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.5-flash",
    "google/gemini-3.5-flash-lite",
    "google/gemini-3.6-flash",
    "google/gemini-3.7-flash",
    "google/gemini-3.8-flash",
    "google/gemini-4-argon",
    "gpt-5.4-mini",
    "inclusionai/ling-3.1-flash",
    "meta/muse-spark-open",
    "mistral/mistral-large-4",
    "nvidia/nemotron-3.5-super-vl",
    "stepfun/Step-5-Preview",
    "tencent/hy4-preview",
    "xai/grok-4.5"
  ],
  "low,medium,high,xhigh": [
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.5",
    "meta/muse-spark-1.1",
    "meta/muse-spark-1.2",
    "meta/muse-spark-1.2-contributor",
    "meta/muse-spark-1.3-contributor",
    "meta/muse-wonder-1.0",
    "stealth/glyph-cluster:free",
    "xai/grok-4.6",
    "xai/grok-4.7"
  ],
  "low,high,max": [
    "deepseek/deepseek-v4-flash-fast",
    "moonshotai/Kimi-K3",
    "moonshotai/Kimi-K3.1-Pro",
    "z-ai/glm-5.3-flash",
    "z-ai/glm-5.3-flashx",
    "zai-org/GLM-5.3"
  ],
  "low,medium,xhigh": [
    "Qwen/Qwen3.8-27B",
    "Qwen/Qwen3.8-Flash",
    "Qwen/Qwen3.8-Max",
    "Qwen/Qwen3.8-Max-0902",
    "Qwen/Qwen3.8-Max-Prime",
    "Qwen/Qwen3.8-Omni-Flash"
  ],
  "off,high,max": [
    "deepseek/deepseek-v4-flash",
    "deepseek/deepseek-v4-flash-vision-exp",
    "deepseek/deepseek-v4-pro"
  ],
  "off,low,high,max": [
    "deepseek/deepseek-v4.1-flash",
    "deepseek/deepseek-v4.1-flash-fast"
  ],
  "high,max": [
    "zai-org/GLM-5.2"
  ],
  "high,xhigh": [
    "sakana/fugu-ultra"
  ]
};
var BY_ID = /* @__PURE__ */ new Map();
for (const [key, ids] of Object.entries(SETS)) {
  if (key === "none") continue;
  const efforts2 = key.split(",");
  const defaultEffort = efforts2.includes("high") ? "high" : efforts2[0];
  for (const id of ids) BY_ID.set(id, { efforts: efforts2, defaultEffort });
}
function commandCodeReasoning(upstreamId) {
  return BY_ID.get(upstreamId);
}

// src/engines/protocom/commandcode-catalog.ts
var COMMANDCODE_TIERS = ["go", "goat", "pro", "max"];
function tierRank(name2) {
  if (name2 === void 0) return void 0;
  const at = COMMANDCODE_TIERS.indexOf(name2.trim().toLowerCase());
  return at === -1 ? void 0 : at;
}
function tierFromPlanId(planId) {
  if (planId === void 0) return void 0;
  for (const tier of COMMANDCODE_TIERS) {
    if (new RegExp(`(^|[^a-z])${tier}([^a-z]|$)`).test(planId.toLowerCase())) return tier;
  }
  return void 0;
}
function withinTier(modelGate, accountTier) {
  const gate = tierRank(modelGate);
  const have = tierRank(accountTier);
  if (gate === void 0 || have === void 0) return true;
  return gate <= have;
}
var MAX_ID_LENGTH = 256;
var MAX_CATALOG_ROWS = 1e3;
function reassembleFlightPayload(html) {
  const fragments = [];
  const pattern = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  for (const match of html.matchAll(pattern)) {
    try {
      fragments.push(JSON.parse(match[1]));
    } catch {
    }
  }
  return fragments.join("");
}
function modelsArrays(payload) {
  const marker = '"models":[';
  const found = [];
  let at = payload.indexOf(marker);
  let scanned = 0;
  while (at !== -1) {
    const start = at + marker.length - 1;
    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;
    for (let index = Math.max(start, scanned); index < payload.length; index += 1) {
      const char = payload[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "[") depth += 1;
      else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    if (end !== -1) {
      found.push(payload.slice(start, end + 1));
      scanned = end + 1;
    } else {
      scanned = payload.length;
    }
    at = payload.indexOf(marker, at + 1);
  }
  return found.sort((left, right) => right.length - left.length);
}
function nonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function parseCatalogRows(rows) {
  const byId = /* @__PURE__ */ new Map();
  if (!Array.isArray(rows)) return { byId, skipped: 0 };
  let skipped = 0;
  for (const raw of rows.slice(0, MAX_CATALOG_ROWS)) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      skipped += 1;
      continue;
    }
    const row = raw;
    const id = typeof row.id === "string" && row.id.length > 0 && row.id.length <= MAX_ID_LENGTH ? row.id : void 0;
    const reasoning = typeof row.reasoning === "boolean" ? row.reasoning : row.caps?.reasoning;
    const vision = typeof row.vision === "boolean" ? row.vision : row.caps?.vision;
    if (id === void 0 || typeof reasoning !== "boolean" || typeof vision !== "boolean") {
      skipped += 1;
      continue;
    }
    const contextWindow = nonNegative(row.contextWindow);
    const inputCost = nonNegative(row.inputCost);
    const outputCost = nonNegative(row.outputCost);
    const cacheReadCost = nonNegative(row.cacheReadCost);
    const minPlan = typeof row.minPlanName === "string" && row.minPlanName.length > 0 ? row.minPlanName : void 0;
    byId.set(id, {
      reasoning,
      vision,
      ...contextWindow === void 0 || contextWindow === 0 ? {} : { contextWindow },
      ...inputCost === void 0 ? {} : { inputCost },
      ...outputCost === void 0 ? {} : { outputCost },
      ...cacheReadCost === void 0 ? {} : { cacheReadCost },
      ...minPlan === void 0 ? {} : { minPlan }
    });
  }
  return { byId, skipped };
}
function catalogFor(byId, id) {
  const exact = byId.get(id);
  if (exact !== void 0) return exact;
  const tail = (value) => {
    const slash = value.lastIndexOf("/");
    return slash === -1 ? value : value.slice(slash + 1);
  };
  const wanted = tail(id);
  for (const [key, value] of byId) {
    if (tail(key) === wanted) return value;
  }
  const undated = /^(.*?)-\d{8}$/.exec(wanted)?.[1];
  if (undated !== void 0) {
    for (const [key, value] of byId) {
      if (tail(key) === undated) return value;
    }
  }
  return void 0;
}
function scrapeCatalog(html, failure) {
  if (html === void 0) return { byId: /* @__PURE__ */ new Map(), problem: failure ?? "the capability page could not be read" };
  const payload = reassembleFlightPayload(html);
  if (payload.length === 0) return { byId: /* @__PURE__ */ new Map(), problem: "the capability page carried no readable payload" };
  const candidates = modelsArrays(payload);
  if (candidates.length === 0) return { byId: /* @__PURE__ */ new Map(), problem: "the capability page carried no model catalog" };
  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const { byId } = parseCatalogRows(parsed);
    if (byId.size > 0) return { byId };
  }
  return { byId: /* @__PURE__ */ new Map(), problem: "the capability catalog did not parse" };
}
var COMMANDCODE_CATALOG_URL = "https://commandcode.ai/docs/plans/goat";
var CATALOG_TTL_MS = 6 * 60 * 60 * 1e3;
var MAX_CATALOG_BYTES = 8 * 1024 * 1024;
var MAX_PLAN_BYTES = 64 * 1024;

// src/engines/protocom/commandcode.ts
var COMMANDCODE_BASE_URL = "https://api.commandcode.ai/provider";
var COMMANDCODE_BASE_URL_ORIGIN = new URL(COMMANDCODE_BASE_URL).origin;
var COMMANDCODE_PROVIDER = "commandcode";
var COMMANDCODE_CREDENTIAL_REF = /^COMMANDCODE_[A-Z0-9_]+$/;
var COMMANDCODE_CONTEXT_LADDER = [2e5, 256e3, 4e5, 1e6];
var COMMANDCODE_REFUSED_MODEL_IDS = [];
var COMMANDCODE_RECOMMENDED = [];
var COMMANDCODE = {
  ns: "commandcode",
  sectionKey: "commandcode",
  label: "Command Code",
  baseURL: COMMANDCODE_BASE_URL,
  origin: COMMANDCODE_BASE_URL_ORIGIN,
  credentialRef: COMMANDCODE_CREDENTIAL_REF,
  keys: ["cc"],
  defaults: {
    cc: {
      displayName: "Command Code",
      // Most models are served on chat-completions (73 of 82 declare it), and
      // the per-model endpoint declaration overrides this wherever the gateway
      // says otherwise, so this is a fallback rather than a guess.
      protocol: "chat-completions",
      contextLengths: COMMANDCODE_CONTEXT_LADDER
    }
  },
  providerOf: () => COMMANDCODE_PROVIDER,
  groupOf: (provider) => provider === COMMANDCODE_PROVIDER ? "cc" : void 0,
  keyRef: () => "COMMANDCODE_API_KEY",
  // No shipped recommendation: which models matter depends on the plan, and a
  // hand-picked order would silently hide the rest behind a scroll.
  recommended: [],
  // No hand-maintained registry: this endpoint DISCLOSES context length and
  // routing on every row, so a hand-written copy could only go stale.
  registry: [],
  refused: COMMANDCODE_REFUSED_MODEL_IDS,
  // The endpoints listing discloses no capability at all; this page embeds the
  // reasoning/vision/pricing catalog the menu renders.
  capabilityCatalogUrl: COMMANDCODE_CATALOG_URL,
  // The capability page answers WHETHER a model reasons but never which depths
  // it accepts, and the endpoints listing has no reasoning field at all. Both
  // sources are therefore silent on effort, which is why no Command Code model
  // offered a thinking control. The vendor's CLI catalog publishes the exact
  // per-model tiers and joins this listing on all 82 ids, so it is the source.
  reasoningFor: commandCodeReasoning,
  // Bare `reasoning_effort`, with no `thinking` block beside it.
  //
  // The default spelling sends `thinking: {type}` too, which this gateway
  // accepts on its Anthropic wire only: the vendor's own BYOK reference
  // documents the OpenAI surface as taking `reasoning_effort` alone, and its
  // CLI emits that single field. Sending the block anyway would be a
  // provider-side rejection that reads like a plugin defect, so the mode is
  // declared rather than inherited from the default.
  chatThinking: "effort-only",
  // Account endpoints, all verified live on 2026-09-23 with a real key:
  //   GET /alpha/whoami                -> 200 {success,user,org}
  //   GET /alpha/billing/credits       -> 200 {credits,windowLimits{limited,
  //                                         fiveHour{used,cap,resetAt},weekly{...}}}
  //   GET /alpha/billing/subscriptions -> 200 {data{planId,status,currentPeriodEnd}}
  //   GET /alpha/usage/summary         -> 200 {totalCount,totalCost,successRate,
  //                                         totalTokensIn,totalTokensOut,...}
  // The subscription's planId ("individual-goat") is what gates the model menu:
  // the endpoints listing is NOT plan-filtered and advertises Pro/Max models an
  // account on a lower tier cannot call.
  planIdPath: "/alpha/billing/subscriptions",
  creditsPath: "/alpha/billing/credits",
  usagePath: "/alpha/usage/summary",
  // The fenced route the settings panel reads. Its kind is 'account' rather
  // than 'balance': Command Code answers a different shape from Protocom's
  // relay, and the client picks its parser and strip from this value.
  telemetryPath: "/api/commandcode/account",
  telemetryKind: "account"
};

// src/engines/protocom/clinepass.ts
var CLINEPASS_BASE_URL = "https://api.cline.bot/api/v1";
var CLINEPASS_BASE_URL_ORIGIN = new URL(CLINEPASS_BASE_URL).origin;
var CLINEPASS_PROVIDER = "clinepass";
var CLINEPASS_CREDENTIAL_REF = /^CLINE_[A-Z0-9_]+$/;
var CLINEPASS_KEY_REF = "CLINE_API_KEY";
var CLINEPASS_CONTEXT_LADDER = [2e5, 256e3, 4e5, 1e6];
var CLINEPASS_REFUSED_MODEL_IDS = [
  "cline-pass/glm-5.2",
  "cline-pass/kimi-k2.6",
  "cline-pass/kimi-k2.7-code",
  "cline-pass/deepseek-v4-flash"
];
var CLINE_TOGGLE_REASONING = { efforts: ["none", "medium"], defaultEffort: "medium" };
var efforts = (values, defaultEffort) => ({ efforts: values, defaultEffort });
var CLINEPASS_REGISTRY = [
  // 1,048,576 with a 131,072 output ceiling; accepts image, video and audio.
  { id: "cline-pass/mimo-v2.6-flash", displayName: "MiMo V2.6 Flash", family: "mimo", contextWindow: 1048576, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ["clinepass"] },
  { id: "cline-pass/mimo-v2.6-pro", displayName: "MiMo V2.6 Pro", family: "mimo", contextWindow: 1048576, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ["clinepass"] },
  // 1,310,720 -- larger than any other model here, and larger than the 1M
  // ladder step, so its own window is the step that matters.
  { id: "cline-pass/glm-5.3", displayName: "GLM-5.3", family: "glm", contextWindow: 1310720, reasoning: efforts(["low", "high", "max"], "high"), vision: false, groups: ["clinepass"] },
  { id: "cline-pass/glm-5.3-flash", displayName: "GLM-5.3 Flash", family: "glm", contextWindow: 1310720, reasoning: efforts(["low", "high", "max"], "high"), vision: true, groups: ["clinepass"] },
  // Both a toggle and effort levels, so the effort set is the one that carries
  // the disabling word as well.
  { id: "cline-pass/kimi-k3", displayName: "Kimi K3", family: "kimi", contextWindow: 1048576, reasoning: efforts(["none", "low", "high", "max"], "high"), vision: true, groups: ["clinepass"] },
  { id: "cline-pass/deepseek-v4-pro", displayName: "DeepSeek V4 Pro", family: "deepseek", contextWindow: 1048576, reasoning: efforts(["none", "high", "xhigh"], "high"), vision: false, groups: ["clinepass"] },
  { id: "cline-pass/deepseek-v4.1-flash", displayName: "DeepSeek V4.1 Flash", family: "deepseek", contextWindow: 1048576, reasoning: efforts(["none", "low", "high", "max"], "high"), vision: true, groups: ["clinepass"] },
  // 1,050,000 rather than the 1,048,576 its family usually declares.
  { id: "cline-pass/mimo-v2.5", displayName: "MiMo V2.5", family: "mimo", contextWindow: 105e4, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ["clinepass"] },
  { id: "cline-pass/mimo-v2.5-pro", displayName: "MiMo V2.5 Pro", family: "mimo", contextWindow: 105e4, reasoning: CLINE_TOGGLE_REASONING, vision: false, groups: ["clinepass"] },
  { id: "cline-pass/minimax-m3", displayName: "MiniMax M3", family: "minimax", contextWindow: 1048576, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ["clinepass"] },
  { id: "cline-pass/muse-spark-1.3-contributor", displayName: "Muse Spark 1.3 Contributor", family: "meta", contextWindow: 1048576, reasoning: efforts(["minimal", "low", "medium", "high", "xhigh", "max"], "medium"), vision: true, groups: ["clinepass"] },
  // 128,000 and an 8,192 output ceiling -- roughly a tenth of every sibling --
  // with NO reasoning declared and no image support. Worth stating because
  // models.dev reports 1,000,000 and vision for this id, and a menu built on
  // that would promise eight times the window the gateway serves.
  { id: "cline-pass/qwen3.8-max", displayName: "Qwen3.8 Max", family: "qwen", contextWindow: 128e3, vision: false, groups: ["clinepass"] },
  { id: "cline-pass/qwen3.7-max", displayName: "Qwen3.7 Max", family: "qwen", contextWindow: 1e6, reasoning: CLINE_TOGGLE_REASONING, vision: false, groups: ["clinepass"] },
  { id: "cline-pass/qwen3.7-plus", displayName: "Qwen3.7 Plus", family: "qwen", contextWindow: 1e6, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ["clinepass"] }
];
var CLINEPASS_RECOMMENDED = [];
var CLINEPASS = {
  ns: "clinepass",
  sectionKey: "clinepass",
  label: "ClinePass",
  baseURL: CLINEPASS_BASE_URL,
  origin: CLINEPASS_BASE_URL_ORIGIN,
  credentialRef: CLINEPASS_CREDENTIAL_REF,
  keys: ["clinepass"],
  defaults: {
    clinepass: {
      displayName: "ClinePass",
      protocol: "chat-completions",
      contextLengths: CLINEPASS_CONTEXT_LADDER
    }
  },
  providerOf: () => CLINEPASS_PROVIDER,
  groupOf: (provider) => provider === CLINEPASS_PROVIDER ? "clinepass" : void 0,
  keyRef: () => CLINEPASS_KEY_REF,
  recommended: CLINEPASS_RECOMMENDED,
  registry: CLINEPASS_REGISTRY,
  refused: CLINEPASS_REFUSED_MODEL_IDS,
  listingIsMembership: false,
  chatThinking: "reasoning-object"
};

// src/engines/protocom/family.ts
var PROTOCOM = {
  ns: "protocom-api",
  sectionKey: "protocom",
  label: "Protocom",
  baseURL: DEFAULT_BASE_URL,
  origin: DEFAULT_BASE_URL_ORIGIN,
  credentialRef: /^PROTOCOM_[A-Z0-9_]+$/,
  keys: GROUP_KEYS,
  defaults: GROUP_DEFAULTS,
  providerOf,
  groupOf,
  keyRef: defaultKeyRef,
  recommended: DEFAULT_RECOMMENDED,
  registry: REGISTRY,
  refused: REFUSED_CHAT_MODEL_IDS,
  telemetryPath: "/api/protocom-api/balance",
  telemetryKind: "balance"
};
var GO_DEFAULT_BASE_URL = "https://opencode.ai/zen/go";
var GO_DEFAULT_BASE_URL_ORIGIN = new URL(GO_DEFAULT_BASE_URL).origin;
var GO_CREDENTIAL_REF = /^OPENCODE_[A-Z0-9_]+$/;
var GO_PROVIDER = "opencode-go-sub";
var OPENCODE_GO = {
  ns: "opencode-go",
  sectionKey: "opencodeGo",
  label: "OpenCode Go",
  baseURL: GO_DEFAULT_BASE_URL,
  origin: GO_DEFAULT_BASE_URL_ORIGIN,
  credentialRef: GO_CREDENTIAL_REF,
  keys: ["go"],
  defaults: {
    go: {
      displayName: "OpenCode Go",
      protocol: "chat-completions",
      // One ladder for every listed model: the endpoint discloses no context
      // metadata, so unregistered ids still offer the steps their fallback
      // window clears.
      contextLengths: [204800, 262144, 409600, 1048576]
    }
  },
  providerOf: () => GO_PROVIDER,
  groupOf: (provider) => provider === GO_PROVIDER ? "go" : void 0,
  keyRef: () => "OPENCODE_GO_API_KEY",
  recommended: GO_DEFAULT_RECOMMENDED,
  registry: GO_REGISTRY,
  refused: GO_REFUSED_MODEL_IDS,
  sessionHeader: "x-opencode-session",
  chatThinking: "effort-only",
  telemetryPath: "/api/opencode-go/usage",
  telemetryKind: "quota"
};
var FAMILIES = [PROTOCOM, OPENCODE_GO, COMMANDCODE, CLINEPASS];

// src/engines/protocom/retry.ts
var DEFAULT_RETRY_MAX_ATTEMPTS = 20;
var DEFAULT_RETRY_MAX_DELAY_MS = 36e5;
var RETRY_INITIAL_DELAY_MS = 500;
var RETRY_JITTER_RATIO = 0.1;
var MAX_RETRY_ATTEMPTS = 100;
var MAX_RETRY_DELAY_MS = 2147483647;
var RETRYABLE_FAILURE_CODES = Object.freeze([
  "EMPTY_RESPONSE",
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT"
]);
function retryPolicyFor(budget) {
  return Object.freeze({
    mode: "normal",
    retryableCodes: RETRYABLE_FAILURE_CODES,
    maxRetries: budget.retryMaxAttempts,
    initialDelayMs: RETRY_INITIAL_DELAY_MS,
    maxDelayMs: budget.retryMaxDelayMs,
    jitterRatio: RETRY_JITTER_RATIO
  });
}
function retryBudgetSpanMs(budget) {
  let total = 0;
  for (let attempt = 0; attempt < budget.retryMaxAttempts; attempt += 1) {
    total += Math.min(RETRY_INITIAL_DELAY_MS * 2 ** attempt, budget.retryMaxDelayMs);
  }
  return total;
}

// src/engines/protocom/bounded-read.ts
async function readBoundedBytes(response, limit) {
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    throw new Error(`the reply declared ${declared} bytes, over the ${limit}-byte limit`);
  }
  const reader = response.body?.getReader();
  if (reader === void 0) throw new Error("the reply carried no body");
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === void 0) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`the reply exceeded the ${limit}-byte limit`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks, total));
}

// src/engines/protocom/discovery.ts
import { attributionHeaders, LlmError } from "@deepseek-ai/dsh-llm";

// src/engines/protocom/config.ts
import z from "@deepseek-ai/schemastery";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { credentialRef } from "@deepseek-ai/dsh-credentials";

// src/engines/protocom/key-pool.ts
var KEY_COOLDOWN_MS = 6e4;
var KEY_AFFINITY_LIMIT = 512;
var MAX_KEYS_PER_GROUP = 16;
var NON_SESSION = "\0no-session";
function hashSession(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = hash * 31 + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash);
}
var KeyPool = class {
  /**
   * @param keyCount - how many keys this pool holds.
   * @param policy - how to choose among them.
   * @param now - clock, injectable so cooldown behaviour is testable.
   */
  constructor(keyCount, policy, now = () => Date.now()) {
    this.keyCount = keyCount;
    this.policy = policy;
    this.now = now;
  }
  /** Session id to key index. Insertion order is the eviction order. */
  affinity = /* @__PURE__ */ new Map();
  /** Key index to the instant its cooldown ends, in epoch milliseconds. */
  cooldownUntil = /* @__PURE__ */ new Map();
  /**
   * The key each traffic stream most recently received. Sticky mode already
   * knows this through {@link affinity}; recording it for every mode is what
   * lets a failure report name the key that actually failed, without the
   * adapter having to know anything about pools or credentials.
   */
  lastPicked = /* @__PURE__ */ new Map();
  /**
   * Record which key a stream received, evicting the oldest past the cap.
   *
   * Insertion order is the recency order, so re-inserting refreshes a stream's
   * position exactly as the affinity map already does. Without the cap this grew
   * once per (session, group) for the life of the Host: measured 5000 distinct
   * session ids leaving 5000 entries, against an affinity map correctly held at
   * 512. A long-lived process would leak one small entry per conversation.
   * @param stream - the Session id, or the non-session sentinel.
   * @param index - the key it was served.
   */
  remember(stream, index) {
    this.lastPicked.delete(stream);
    this.lastPicked.set(stream, index);
    while (this.lastPicked.size > KEY_AFFINITY_LIMIT) {
      const oldest = this.lastPicked.keys().next();
      if (oldest.done === true) break;
      this.lastPicked.delete(oldest.value);
    }
  }
  /** Resize after a settings change, dropping affinities the new size cannot address. */
  reconfigure(keyCount, policy) {
    this.keyCount = keyCount;
    this.policy = policy;
    for (const [session, index] of this.affinity) {
      if (index >= keyCount) this.affinity.delete(session);
    }
    for (const index of [...this.cooldownUntil.keys()]) {
      if (index >= keyCount) this.cooldownUntil.delete(index);
    }
    for (const [stream, index] of this.lastPicked) {
      if (index >= keyCount) this.lastPicked.delete(stream);
    }
  }
  /** Whether one key is currently parked after a failure. */
  isCoolingDown(index) {
    const until = this.cooldownUntil.get(index);
    if (until === void 0) return false;
    if (until <= this.now()) {
      this.cooldownUntil.delete(index);
      return false;
    }
    return true;
  }
  /** Park one key so later selections step over it. */
  markFailed(index) {
    this.cooldownUntil.set(index, this.now() + KEY_COOLDOWN_MS);
  }
  /** Clear one key's cooldown, after it served a request successfully. */
  markServed(index) {
    this.cooldownUntil.delete(index);
  }
  /**
   * The key a given traffic stream last received, for failure attribution.
   * @param sessionId - the conversation, or undefined for non-Session traffic.
   * @returns the last selected index, or undefined when this stream is new.
   */
  lastIndexFor(sessionId) {
    const index = this.lastPicked.get(sessionId ?? NON_SESSION);
    return index !== void 0 && index < this.keyCount ? index : void 0;
  }
  /**
   * Choose one key index for a request.
   *
   * Sticky mode reuses the Session's affinity; round-robin advances with the
   * ordinal. Both skip keys in cooldown, and a Session whose pinned key is
   * parked is re-pinned to the replacement so the rest of its run stays warm.
   * @param request - the Session (when any) and the request ordinal.
   * @returns the chosen index, or undefined when every key is parked.
   */
  select(request) {
    if (this.keyCount === 0) return void 0;
    const start = this.policy === "sticky" ? this.anchor(request) : request.ordinal;
    for (let step = 0; step < this.keyCount; step += 1) {
      const index = (start + step) % this.keyCount;
      if (this.isCoolingDown(index)) continue;
      if (this.policy === "sticky" && request.sessionId !== void 0) this.pin(request.sessionId, index);
      this.remember(request.sessionId ?? NON_SESSION, index);
      return index;
    }
    const fallback = this.soonestRecovering();
    this.remember(request.sessionId ?? NON_SESSION, fallback);
    return fallback;
  }
  /** The parked key whose cooldown ends first, or 0 when none is on record. */
  soonestRecovering() {
    let best;
    let bestUntil = Number.POSITIVE_INFINITY;
    for (const [index, until] of this.cooldownUntil) {
      if (index >= this.keyCount) continue;
      if (until < bestUntil) {
        best = index;
        bestUntil = until;
      }
    }
    return best ?? 0;
  }
  /** The index a sticky selection should start from. */
  anchor(request) {
    if (request.sessionId !== void 0) {
      const pinned = this.affinity.get(request.sessionId);
      if (pinned !== void 0 && pinned < this.keyCount) return pinned;
      if (pinned === void 0) {
        return hashSession(request.sessionId) % this.keyCount;
      }
    }
    return request.ordinal;
  }
  /** Record one Session's affinity, evicting the oldest entry past the cap. */
  pin(sessionId, index) {
    this.affinity.delete(sessionId);
    this.affinity.set(sessionId, index);
    while (this.affinity.size > KEY_AFFINITY_LIMIT) {
      const oldest = this.affinity.keys().next();
      if (oldest.done === true) break;
      this.affinity.delete(oldest.value);
    }
  }
};

// src/engines/protocom/credential-shape.ts
function describePathShapedSecret(value) {
  const inner = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  if (/^[A-Za-z]:[\\/]/.test(inner)) return "a drive path";
  if (inner.startsWith("\\\\")) return "a UNC path";
  if (/^[A-Za-z]:[^\\/]/.test(inner)) return "a drive-relative path";
  if (/ \(\d+\)$/.test(value) && /[\\/]/.test(inner)) return "a path with a duplicate-download suffix";
  return void 0;
}

// src/engines/protocom/config.ts
var DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
if (MAX_RETRY_DELAY_MS !== MAX_TIMER_DELAY_MS) {
  throw new Error("dsh-protocom-api: retry.ts MAX_RETRY_DELAY_MS must equal the harness MAX_TIMER_DELAY_MS");
}
var PROTOCOM_CREDENTIAL_REF = /^PROTOCOM_[A-Z0-9_]+$/;
var group = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().role("credential-ref"),
  protocol: z.union(["chat-completions", "responses", "messages"]),
  contextLengths: z.array(z.number().step(1).min(1)),
  showBalance: z.boolean().default(true),
  replayReasoning: z.boolean().default(false),
  assistantTextReplay: z.union(["keep", "drop", "user"]).default("keep"),
  // No schema default for apiKeys: Schemastery normalizes an absent array to
  // `[]`, and the resolver treats an empty array as "no extra keys", which is
  // exactly the single-key behavior an absent field means.
  apiKeys: z.array(z.string().role("credential-ref")),
  keyPolicy: z.union(["sticky", "round-robin"]).default("sticky")
});
function sectionSchema(baseURL, recommended) {
  return z.object({
    baseURL: z.string().default(baseURL),
    allowCustomBaseURL: z.boolean(),
    streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    retryMaxAttempts: z.number().step(1).min(0).max(MAX_RETRY_ATTEMPTS).default(DEFAULT_RETRY_MAX_ATTEMPTS),
    retryMaxDelayMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RETRY_MAX_DELAY_MS),
    groups: z.dict(group).default({}),
    hiddenModels: z.array(z.string()).default([]),
    recommendedModels: z.array(z.string()).default([...recommended]),
    modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
    visionModels: z.dict(z.boolean()).default({})
  });
}
var ProtocomSection = sectionSchema(DEFAULT_BASE_URL, DEFAULT_RECOMMENDED);
var GoSection = sectionSchema(GO_DEFAULT_BASE_URL, GO_DEFAULT_RECOMMENDED);
var CommandCodeSection = sectionSchema(COMMANDCODE_BASE_URL, COMMANDCODE_RECOMMENDED);
var ClinePassSection = sectionSchema(CLINEPASS_BASE_URL, CLINEPASS_RECOMMENDED);
var fusionSeat = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string()
});
var FusionSection = z.object({
  enabled: z.boolean().default(false),
  leader: fusionSeat,
  coder: fusionSeat,
  includeForks: z.boolean().default(true),
  applyLeader: z.boolean().default(true)
});
var Config = z.object({
  protocom: ProtocomSection.volatile(),
  opencodeGo: GoSection.volatile(),
  commandcode: CommandCodeSection.volatile(),
  clinepass: ClinePassSection.volatile(),
  fusion: FusionSection.volatile()
});
function resolveAdapterOptions(config, family = PROTOCOM) {
  const baseURL = resolveBaseURL((config.baseURL ?? family.baseURL).replace(/\/+$/, "").replace(/\/v1$/, ""));
  if (config.allowCustomBaseURL !== true && new URL(baseURL).origin !== family.origin) {
    throw new Error(
      `${family.ns}: baseURL "${baseURL}" points away from the shipped endpoint (${family.origin}); set allowCustomBaseURL: true to confirm this deployment really sends its API key there`
    );
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`${family.ns}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
  }
  const retryMaxAttempts = config.retryMaxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
  if (!Number.isSafeInteger(retryMaxAttempts) || retryMaxAttempts < 0 || retryMaxAttempts > MAX_RETRY_ATTEMPTS) {
    throw new Error(`${family.ns}: retryMaxAttempts must be an integer between 0 and ${MAX_RETRY_ATTEMPTS}`);
  }
  const retryMaxDelayMs = config.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
  if (!Number.isFinite(retryMaxDelayMs) || retryMaxDelayMs < RETRY_INITIAL_DELAY_MS || retryMaxDelayMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `${family.ns}: retryMaxDelayMs must be at least ${RETRY_INITIAL_DELAY_MS} and no greater than ${MAX_TIMER_DELAY_MS}`
    );
  }
  const supplied = config.groups ?? {};
  for (const key of Object.keys(supplied)) {
    if (!family.keys.includes(key)) {
      throw new Error(`${family.ns}: unknown group "${key}"; expected one of ${family.keys.join(", ")}`);
    }
  }
  const groups = /* @__PURE__ */ new Map();
  for (const key of family.keys) {
    const source = supplied[key] ?? {};
    const defaults = family.defaults[key] ?? { displayName: key, protocol: "chat-completions" };
    if (source.contextLengths !== void 0) {
      if (source.contextLengths.some((length) => !Number.isSafeInteger(length) || length <= 0)) {
        throw new Error(`${family.ns}: group "${key}" contextLengths must be positive integers`);
      }
      if (new Set(source.contextLengths).size !== source.contextLengths.length) {
        throw new Error(`${family.ns}: group "${key}" contextLengths must not contain duplicates`);
      }
    }
    const effectiveLengths = source.contextLengths?.length ? source.contextLengths : defaults.contextLengths;
    const prospective = [
      ...source.apiKey === void 0 ? [] : [source.apiKey],
      ...source.apiKeys ?? []
    ];
    if (prospective.length > MAX_KEYS_PER_GROUP + 1) {
      throw new Error(`${family.ns}: group "${key}" configures more than ${MAX_KEYS_PER_GROUP} API keys`);
    }
    const apiKeyRefs = [];
    for (const candidate of prospective) {
      if (typeof candidate !== "string" || candidate.length === 0) {
        throw new Error(`${family.ns}: group "${key}" apiKeys entries must be non-empty credential references`);
      }
      if (!family.credentialRef.test(candidate)) {
        throw new Error(`${family.ns}: group "${key}" apiKey "${describeRejectedRef(candidate)}" must match ${String(family.credentialRef)}`);
      }
      try {
        const ref = credentialRef(candidate);
        if (apiKeyRefs.includes(ref)) {
          throw new Error(`${family.ns}: group "${key}" repeats the credential reference "${candidate}"`);
        }
        apiKeyRefs.push(ref);
      } catch (error) {
        if (error instanceof Error && error.message.includes("repeats the credential reference")) throw error;
        throw new Error(`${family.ns}: group "${key}" apiKey "${candidate}" is not a valid credential reference`, { cause: error });
      }
    }
    const apiKeyRef = apiKeyRefs[0];
    const keyPolicy = source.keyPolicy ?? "sticky";
    if (keyPolicy !== "sticky" && keyPolicy !== "round-robin") {
      throw new Error(`${family.ns}: group "${key}" keyPolicy must be "sticky" or "round-robin"`);
    }
    groups.set(key, {
      key,
      provider: family.providerOf(key),
      displayName: defaults.displayName,
      enabled: source.enabled ?? false,
      protocol: source.protocol ?? defaults.protocol,
      ...apiKeyRef === void 0 ? {} : { apiKeyRef },
      apiKeyRefs,
      keyPolicy,
      ...effectiveLengths === void 0 ? {} : { contextLengths: [...effectiveLengths] },
      showBalance: source.showBalance ?? true,
      replayReasoning: source.replayReasoning ?? false,
      assistantTextReplay: source.assistantTextReplay ?? "keep"
    });
  }
  const hidden = config.hiddenModels ?? [];
  for (const id of hidden) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`${family.ns}: hiddenModels entries must be non-empty model ids`);
    }
  }
  const recommended = config.recommendedModels ?? family.recommended;
  for (const id of recommended) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`${family.ns}: recommendedModels entries must be non-empty model ids`);
    }
  }
  const contexts = /* @__PURE__ */ new Map();
  for (const [id, lengths] of Object.entries(config.modelContexts ?? {})) {
    if (id.length === 0) {
      throw new Error(`${family.ns}: modelContexts keys must be non-empty model ids`);
    }
    if (lengths.length === 0) {
      throw new Error(`${family.ns}: modelContexts["${id}"] must list at least one length`);
    }
    if (lengths.some((length) => !Number.isSafeInteger(length) || length <= 0)) {
      throw new Error(`${family.ns}: modelContexts["${id}"] lengths must be positive integers`);
    }
    if (new Set(lengths).size !== lengths.length) {
      throw new Error(`${family.ns}: modelContexts["${id}"] lengths must not repeat`);
    }
    contexts.set(identityKey(id, family.registry), [...lengths].sort((left, right) => left - right));
  }
  const vision = /* @__PURE__ */ new Map();
  for (const [id, accepts] of Object.entries(config.visionModels ?? {})) {
    if (id.length === 0) {
      throw new Error(`${family.ns}: visionModels keys must be non-empty model ids`);
    }
    if (typeof accepts !== "boolean") {
      throw new Error(`${family.ns}: visionModels["${id}"] must be a boolean`);
    }
    vision.set(identityKey(id, family.registry), accepts);
  }
  return {
    family,
    baseURL,
    streamIdleTimeoutMs,
    retryMaxAttempts,
    retryMaxDelayMs,
    groups,
    modelContexts: contexts,
    visionModels: vision,
    hiddenModels: new Set(hidden),
    // Aliases collapse to one key, so picking either id recommends the model
    // once and the ordering cannot depend on which spelling was stored.
    recommendedModels: [...new Set(recommended.map((id) => identityKey(id, family.registry)))]
  };
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function describeRejectedRef(value) {
  const LIMIT = 32;
  return value.length <= LIMIT ? value : `${value.slice(0, LIMIT)}\u2026 (truncated)`;
}
function resolveBaseURL(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("protocom-api: baseURL must be an absolute http(s) URL");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("protocom-api: baseURL must not carry userinfo");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("protocom-api: baseURL must not carry a query string or fragment");
  }
  if (url.protocol === "http:" ? !isLoopbackHostname(url.hostname) : url.protocol !== "https:") {
    throw new Error("protocom-api: baseURL must use https; plain http is allowed only for a loopback host");
  }
  return raw;
}

// src/engines/protocom/discovery.ts
var MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
var MAX_TEXT_LENGTH = 256;
function bounded(value) {
  return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
}
function label(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return bounded(candidate);
  }
  return void 0;
}
function capacity(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) return candidate;
  }
  return void 0;
}
function strings(candidate) {
  if (!Array.isArray(candidate)) return void 0;
  const values = candidate.filter((value) => typeof value === "string" && value.length > 0).map(bounded);
  return values.length === 0 ? void 0 : values;
}
function parseModelsListing(body) {
  const listing = body;
  const rows = Array.isArray(listing?.data) ? listing.data : Array.isArray(listing?.models) ? listing.models : void 0;
  if (rows === void 0) {
    throw new LlmError(
      `the endpoint's model listing has neither a "data" nor a "models" array; enter this provider's models by hand`,
      "DISCOVERY_FAILED"
    );
  }
  const models = [];
  for (const raw of rows) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw;
    const id = label(entry.id);
    if (id === void 0) continue;
    const displayName = label(entry.display_name, entry.displayName, entry.name);
    const contextWindow = capacity(
      entry.context_window,
      entry.context_length,
      entry.contextWindow,
      entry.max_input_tokens
    );
    const maxTokens = capacity(entry.max_output_tokens, entry.max_tokens);
    const reasoningEfforts = strings(entry.reasoningEfforts) ?? strings(entry.reasoning_efforts);
    const supports = entry.supportsReasoningEffort === true || entry.supports_reasoning_effort === true;
    const endpoints = strings(entry.supported_endpoints) ?? strings(entry.supportedEndpoints);
    models.push({
      id,
      ...displayName === void 0 ? {} : { displayName },
      ...contextWindow === void 0 ? {} : { contextWindow },
      ...maxTokens === void 0 ? {} : { maxTokens },
      ...supports ? { supportsReasoningEffort: true } : {},
      ...reasoningEfforts === void 0 ? {} : { reasoningEfforts },
      ...endpoints === void 0 ? {} : { endpoints }
    });
  }
  return models;
}
async function fetchUpstreamModels(baseURL, apiKey, signal) {
  const url = `${baseURL}/v1/models`;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "application/json",
        ...apiKey === void 0 ? {} : { "authorization": `Bearer ${apiKey}` },
        ...attributionHeaders()
      },
      ...signal === void 0 ? {} : { signal }
    });
  } catch (error) {
    if (signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
    throw new LlmError(`could not reach ${url}`, "DISCOVERY_FAILED", { cause: error });
  }
  if (!response.ok) {
    throw new LlmError(
      `${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`,
      "DISCOVERY_FAILED"
    );
  }
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
  }
  const reader = response.body?.getReader();
  if (reader === void 0) {
    throw new LlmError(`${url} answered with no body`, "DISCOVERY_FAILED");
  }
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    if (value === void 0) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks, total));
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new LlmError(`${url} did not answer with JSON`, "DISCOVERY_FAILED", { cause: error });
  }
  return parseModelsListing(body);
}
function endpointOrigin(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return void 0;
  }
  if (url.username !== "" || url.password !== "") return void 0;
  if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
  return url.origin;
}
async function discoverModels(request, signal, hooks) {
  const configured = hooks.baseURL();
  try {
    resolveBaseURL(configured);
  } catch (error) {
    throw new LlmError(
      `protocom-api: the configured baseURL is not usable (${error instanceof Error ? error.message : String(error)})`,
      "DISCOVERY_FAILED",
      { cause: error }
    );
  }
  const configuredOrigin = endpointOrigin(configured);
  if (configuredOrigin === void 0) {
    throw new LlmError("protocom-api: the configured baseURL is not a usable http(s) origin", "DISCOVERY_FAILED");
  }
  const askedRaw = request.baseURL !== void 0 && request.baseURL.length > 0 ? request.baseURL : void 0;
  const asked = askedRaw === void 0 ? void 0 : askedRaw.replace(/\/+$/, "").replace(/\/v1$/, "");
  if (asked !== void 0) {
    try {
      resolveBaseURL(asked);
    } catch (error) {
      throw new LlmError(
        `protocom-api: the probe endpoint is not usable (${error instanceof Error ? error.message : String(error)})`,
        "DISCOVERY_FAILED",
        { cause: error }
      );
    }
  }
  const baseURL = asked ?? configured;
  const explicit = request.apiKey !== void 0 && request.apiKey.length > 0 ? request.apiKey : void 0;
  const usesStoredCredential = explicit === void 0 && request.provider !== void 0;
  if (usesStoredCredential && asked !== void 0 && endpointOrigin(baseURL) !== configuredOrigin) {
    throw new LlmError(
      "protocom-api: this endpoint differs from the configured baseURL, so the stored credential is not sent; supply an apiKey for this probe, or interrogate the configured endpoint",
      "DISCOVERY_FAILED"
    );
  }
  const apiKey = explicit ?? (request.provider === void 0 ? void 0 : await hooks.resolveApiKey(request.provider));
  const upstream = await fetchUpstreamModels(baseURL, apiKey, signal);
  return upstream.map((model) => ({
    id: model.id,
    ...model.displayName === void 0 ? {} : { name: model.displayName },
    ...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
    ...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
  }));
}

// src/engines/protocom/protocol/chat-completions.ts
import { contentHasImage, EMPTY_RESPONSE_CODE, LlmError as LlmError4, ToolCallId } from "@deepseek-ai/dsh-llm";

// ../dsh-protocom-api-main/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/dist/index.js
var ParseError = class extends Error {
  constructor(message, options) {
    super(message), this.name = "ParseError", this.type = options.type, this.field = options.field, this.value = options.value, this.line = options.line;
  }
};
var LF = 10;
var CR = 13;
var SPACE = 32;
function noop(_arg) {
}
function createParser(config) {
  if (typeof config == "function")
    throw new TypeError(
      "`config` must be an object, got a function instead. Did you mean `createParser({onEvent: fn})`?"
    );
  const { onEvent = noop, onError = noop, onRetry = noop, onComment, maxBufferSize } = config, pendingFragments = [];
  let pendingFragmentsLength = 0, isFirstChunk = true, id, data = "", dataLines = 0, eventType, terminated = false;
  function feed(chunk) {
    if (terminated)
      throw new Error(
        "Cannot feed parser: it was terminated after exceeding the configured max buffer size. Call `reset()` to resume parsing."
      );
    if (isFirstChunk && (isFirstChunk = false, chunk.charCodeAt(0) === 239 && chunk.charCodeAt(1) === 187 && chunk.charCodeAt(2) === 191 && (chunk = chunk.slice(3))), pendingFragments.length === 0) {
      const trailing2 = processLines(chunk);
      trailing2 !== "" && (pendingFragments.push(trailing2), pendingFragmentsLength = trailing2.length), checkBufferSize();
      return;
    }
    if (chunk.indexOf(`
`) === -1 && chunk.indexOf("\r") === -1) {
      pendingFragments.push(chunk), pendingFragmentsLength += chunk.length, checkBufferSize();
      return;
    }
    pendingFragments.push(chunk);
    const input = pendingFragments.join("");
    pendingFragments.length = 0, pendingFragmentsLength = 0;
    const trailing = processLines(input);
    trailing !== "" && (pendingFragments.push(trailing), pendingFragmentsLength = trailing.length), checkBufferSize();
  }
  function checkBufferSize() {
    maxBufferSize !== void 0 && (pendingFragmentsLength + data.length <= maxBufferSize || (terminated = true, pendingFragments.length = 0, pendingFragmentsLength = 0, id = void 0, data = "", dataLines = 0, eventType = void 0, onError(
      new ParseError(`Buffered data exceeded max buffer size of ${maxBufferSize} characters`, {
        type: "max-buffer-size-exceeded"
      })
    )));
  }
  function processLines(chunk) {
    let searchIndex = 0;
    if (chunk.indexOf("\r") === -1) {
      let lfIndex = chunk.indexOf(`
`, searchIndex);
      for (; lfIndex !== -1; ) {
        if (searchIndex === lfIndex) {
          dataLines > 0 && onEvent({ id, event: eventType, data }), id = void 0, data = "", dataLines = 0, eventType = void 0, searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
          continue;
        }
        const firstCharCode = chunk.charCodeAt(searchIndex);
        if (isDataPrefix(chunk, searchIndex, firstCharCode)) {
          const valueStart = chunk.charCodeAt(searchIndex + 5) === SPACE ? searchIndex + 6 : searchIndex + 5, value = chunk.slice(valueStart, lfIndex);
          if (dataLines === 0 && chunk.charCodeAt(lfIndex + 1) === LF) {
            onEvent({ id, event: eventType, data: value }), id = void 0, data = "", eventType = void 0, searchIndex = lfIndex + 2, lfIndex = chunk.indexOf(`
`, searchIndex);
            continue;
          }
          data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
        } else isEventPrefix(chunk, searchIndex, firstCharCode) ? eventType = chunk.slice(
          chunk.charCodeAt(searchIndex + 6) === SPACE ? searchIndex + 7 : searchIndex + 6,
          lfIndex
        ) || void 0 : parseLine(chunk, searchIndex, lfIndex);
        searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
      }
      return chunk.slice(searchIndex);
    }
    for (; searchIndex < chunk.length; ) {
      const crIndex = chunk.indexOf("\r", searchIndex), lfIndex = chunk.indexOf(`
`, searchIndex);
      let lineEnd = -1;
      if (crIndex !== -1 && lfIndex !== -1 ? lineEnd = crIndex < lfIndex ? crIndex : lfIndex : crIndex !== -1 ? crIndex === chunk.length - 1 ? lineEnd = -1 : lineEnd = crIndex : lfIndex !== -1 && (lineEnd = lfIndex), lineEnd === -1)
        break;
      parseLine(chunk, searchIndex, lineEnd), searchIndex = lineEnd + 1, chunk.charCodeAt(searchIndex - 1) === CR && chunk.charCodeAt(searchIndex) === LF && searchIndex++;
    }
    return chunk.slice(searchIndex);
  }
  function parseLine(chunk, start, end) {
    if (start === end) {
      dispatchEvent();
      return;
    }
    const firstCharCode = chunk.charCodeAt(start);
    if (isDataPrefix(chunk, start, firstCharCode)) {
      const valueStart = chunk.charCodeAt(start + 5) === SPACE ? start + 6 : start + 5, value2 = chunk.slice(valueStart, end);
      data = dataLines === 0 ? value2 : `${data}
${value2}`, dataLines++;
      return;
    }
    if (isEventPrefix(chunk, start, firstCharCode)) {
      eventType = chunk.slice(chunk.charCodeAt(start + 6) === SPACE ? start + 7 : start + 6, end) || void 0;
      return;
    }
    if (firstCharCode === 105 && chunk.charCodeAt(start + 1) === 100 && chunk.charCodeAt(start + 2) === 58) {
      const value2 = chunk.slice(chunk.charCodeAt(start + 3) === SPACE ? start + 4 : start + 3, end);
      value2.includes("\0") || (id = value2);
      return;
    }
    if (firstCharCode === 58) {
      if (onComment) {
        const line2 = chunk.slice(start, end);
        onComment(line2.slice(chunk.charCodeAt(start + 1) === SPACE ? 2 : 1));
      }
      return;
    }
    const line = chunk.slice(start, end), fieldSeparatorIndex = line.indexOf(":");
    if (fieldSeparatorIndex === -1) {
      processField(line, "", line);
      return;
    }
    const field = line.slice(0, fieldSeparatorIndex), offset = line.charCodeAt(fieldSeparatorIndex + 1) === SPACE ? 2 : 1, value = line.slice(fieldSeparatorIndex + offset);
    processField(field, value, line);
  }
  function processField(field, value, line) {
    switch (field) {
      case "event":
        eventType = value || void 0;
        break;
      case "data":
        data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
        break;
      case "id":
        value.includes("\0") || (id = value);
        break;
      case "retry":
        /^\d+$/.test(value) ? onRetry(parseInt(value, 10)) : onError(
          new ParseError(`Invalid \`retry\` value: "${value}"`, {
            type: "invalid-retry",
            value,
            line
          })
        );
        break;
      default:
        onError(
          new ParseError(
            `Unknown field "${field.length > 20 ? `${field.slice(0, 20)}\u2026` : field}"`,
            { type: "unknown-field", field, value, line }
          )
        );
        break;
    }
  }
  function dispatchEvent() {
    dataLines > 0 && onEvent({
      id,
      event: eventType,
      data
    }), id = void 0, data = "", dataLines = 0, eventType = void 0;
  }
  function reset(options = {}) {
    if (options.consume && pendingFragments.length > 0) {
      const incompleteLine = pendingFragments.join("");
      parseLine(incompleteLine, 0, incompleteLine.length);
    }
    isFirstChunk = true, id = void 0, data = "", dataLines = 0, eventType = void 0, pendingFragments.length = 0, pendingFragmentsLength = 0, terminated = false;
  }
  return { feed, reset };
}
function isDataPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 100 && chunk.charCodeAt(i + 1) === 97 && chunk.charCodeAt(i + 2) === 116 && chunk.charCodeAt(i + 3) === 97 && chunk.charCodeAt(i + 4) === 58;
}
function isEventPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 101 && chunk.charCodeAt(i + 1) === 118 && chunk.charCodeAt(i + 2) === 101 && chunk.charCodeAt(i + 3) === 110 && chunk.charCodeAt(i + 4) === 116 && chunk.charCodeAt(i + 5) === 58;
}

// ../dsh-protocom-api-main/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/dist/stream.js
var EventSourceParserStream = class extends TransformStream {
  constructor({ onError, onRetry, onComment, maxBufferSize } = {}) {
    let parser;
    super({
      start(controller) {
        parser = createParser({
          onEvent: (event) => {
            controller.enqueue(event);
          },
          onError(error) {
            typeof onError == "function" && onError(error), (onError === "terminate" || error.type === "max-buffer-size-exceeded") && controller.error(error);
          },
          onRetry,
          onComment,
          maxBufferSize
        });
      },
      transform(chunk) {
        parser.feed(chunk);
      }
    });
  }
};

// src/engines/protocom/sse.ts
import { LlmError as LlmError2 } from "@deepseek-ai/dsh-llm";
var DONE = "[DONE]";
var MAX_SSE_EVENT_CHARS = 8 * 1024 * 1024;
async function* read(stream) {
  const events = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ maxBufferSize: MAX_SSE_EVENT_CHARS }));
  try {
    for await (const { data } of events) yield data;
  } catch (error) {
    if (error instanceof ParseError && error.type === "max-buffer-size-exceeded") {
      throw new LlmError2(`SSE event exceeded ${MAX_SSE_EVENT_CHARS} characters`, "MALFORMED_RESPONSE", { cause: error });
    }
    throw error;
  }
}
async function* parseSse(stream) {
  for await (const data of read(stream)) {
    yield data;
    if (data === DONE) return;
  }
  throw new LlmError2("SSE stream ended without [DONE]", "STREAM_CLOSED");
}
async function* parseSseUntilEof(stream) {
  for await (const data of read(stream)) {
    yield data;
    if (data === DONE) return;
  }
}

// src/engines/protocom/protocol/http.ts
import { attributionHeaders as attributionHeaders2, LlmError as LlmError3, ProviderRequestId } from "@deepseek-ai/dsh-llm";

// src/engines/protocom/capture.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
var MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
function captureDir() {
  const dir = process.env["DSH_PROTOCOM_CAPTURE_DIR"];
  return dir !== void 0 && dir.trim().length > 0 ? dir.trim() : void 0;
}
async function captureWire(capture) {
  const dir = captureDir();
  if (dir === void 0) return;
  try {
    await mkdir(dir, { recursive: true });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const body = JSON.stringify({
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      url: capture.url,
      status: capture.status,
      // The upstream's own message is what names the rejected field; keep it
      // whole rather than truncating the one thing worth reading.
      request: capture.request.length > MAX_CAPTURE_BYTES ? "<request body omitted: too large>" : JSON.parse(capture.request),
      response: capture.response.slice(0, MAX_CAPTURE_BYTES)
    }, null, 2);
    await writeFile(join(dir, `${stamp}-${capture.status}.json`), body, "utf8");
  } catch {
  }
}

// src/engines/protocom/protocol/http.ts
function httpErrorCode(status) {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 413) return "INVALID_REQUEST";
  if (status === 429) return "RATE_LIMIT";
  if (status === 400) return "INVALID_REQUEST";
  if (status >= 500) return "SERVER";
  return `HTTP_${status}`;
}
var DEFAULT_RETRY_AFTER_CEILING_MS = 1e4;
function providerRetryAfterMs(value, ceilingMs) {
  if (value === null) return void 0;
  const seconds = /^\d+$/.test(value) ? Number(value) * 1e3 : Number.NaN;
  const delay = Number.isFinite(seconds) ? seconds : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay > 0 ? Math.min(delay, ceilingMs) : void 0;
}
async function postSse(connection, path, body, signal) {
  const url = `${connection.baseURL}/v1/${path}`;
  const serialized = JSON.stringify(body);
  const label2 = connection.label ?? "Protocom";
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${connection.apiKey}`,
        "content-type": "application/json",
        "accept": "text/event-stream",
        ...attributionHeaders2(),
        ...connection.headers
      },
      body: serialized,
      ...signal === void 0 ? {} : { signal }
    });
  } catch (error) {
    if (signal?.aborted) throw new LlmError3(`${label2} request aborted by caller`, "ABORTED", { cause: error });
    throw new LlmError3(`${label2} API request to ${url} failed`, "TRANSPORT", { cause: error });
  }
  if (response.ok) {
    if (!response.body) throw new LlmError3(`${label2} API returned no response body`, "EMPTY_RESPONSE");
    return response;
  }
  let message = `${label2} API error (HTTP ${response.status})`;
  const rawResponse = await response.text();
  try {
    const parsed = JSON.parse(rawResponse);
    const providerError = parsed.error;
    if (typeof providerError === "object" && providerError?.message) {
      message = providerError.message;
    } else if (typeof providerError === "string" && providerError.length > 0) {
      message = providerError;
    } else if (typeof parsed.message === "string" && parsed.message.length > 0) {
      message = parsed.message;
    } else if (rawResponse.trim().length > 0) {
      message += `: ${rawResponse.trim().slice(0, 300)}`;
    }
  } catch {
    if (rawResponse.trim().length > 0) message += `: ${rawResponse.trim().slice(0, 300)}`;
  }
  await captureWire({ url, status: response.status, request: serialized, response: rawResponse });
  const delay = providerRetryAfterMs(
    response.headers.get("retry-after"),
    connection.retryAfterCeilingMs ?? DEFAULT_RETRY_AFTER_CEILING_MS
  );
  const id = response.headers.get("x-request-id");
  throw new LlmError3(message, httpErrorCode(response.status), {
    cause: new Error(rawResponse.length > 0 ? rawResponse : `${label2} HTTP ${response.status}`),
    status: response.status,
    ...delay === void 0 ? {} : { providerRetryAfterMs: delay },
    ...id === null || id.length === 0 ? {} : { requestId: ProviderRequestId(id) }
  });
}

// src/engines/protocom/protocol/chat-completions.ts
function resolveThinking(effort, mode = "toggle") {
  if (mode === "effort-only") {
    return effort === void 0 ? {} : { reasoning_effort: effort };
  }
  if (mode === "reasoning-object") {
    if (effort === void 0) return {};
    if (effort === "none" || effort === "off") return { reasoning: { enabled: false } };
    return { reasoning: { enabled: true, effort } };
  }
  if (effort === "off") return { thinking: { type: "disabled" } };
  if (effort !== void 0) return { thinking: { type: "enabled" }, reasoning_effort: effort };
  return {};
}
function mapUsage(usage) {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  const combined = usage.prompt_tokens + usage.completion_tokens;
  const hasExactTotal = Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0 && Number.isSafeInteger(combined) && (usage.total_tokens === void 0 || usage.total_tokens === combined);
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...hasExactTotal ? { totalTokens: combined } : {},
    ...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== void 0 ? { reasoningTokens: reasoning } : {}
  };
}
function mapFinishReason(reason) {
  switch (reason) {
    case "stop":
      return { kind: "stop" };
    case "tool_calls":
      return { kind: "tool-calls" };
    case "length":
      return { kind: "max-tokens" };
    default:
      return {
        kind: "error",
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() }
      };
  }
}
function flattenText(blocks) {
  return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function assertTextOnly(blocks) {
  if (contentHasImage(blocks)) {
    throw new LlmError4("The chat-completions adapter does not support image content here.", "UNSUPPORTED_CONTENT");
  }
}
function imageParts(blocks, images) {
  const parts = [];
  if (images === void 0 || images.size === 0) return parts;
  for (const block of blocks) {
    if (block.type !== "image") continue;
    const url = images.get(String(block.attachment.attachmentId));
    if (url !== void 0) parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}
function userContent(blocks, images) {
  const text = flattenText(blocks);
  const retained = imageParts(blocks, images);
  if (retained.length === 0) return text;
  return [...text.length > 0 ? [{ type: "text", text }] : [], ...retained];
}
var TOOL_IMAGE_BRIDGE = "The image returned by the tool call above:";
function wireMessage(message, images) {
  if (message.role === "system") return [{ role: "system", content: flattenText(message.content) }];
  if (message.role === "tool") {
    const tool = {
      role: "tool",
      tool_call_id: String(message.toolCallId),
      content: flattenText(message.content)
    };
    const retained = imageParts(message.content, images);
    if (retained.length === 0) return [tool];
    return [tool, { role: "user", content: [{ type: "text", text: TOOL_IMAGE_BRIDGE }, ...retained] }];
  }
  if (message.role === "user") {
    return [{ role: "user", content: userContent(message.content, images) }];
  }
  throw new LlmError4("assistant messages are serialized by assistantMessages()", "INVALID_REQUEST");
}
function assistantMessages(message, replayReasoning, assistantTextReplay) {
  assertTextOnly(message.content);
  const text = flattenText(message.content);
  const reasoning = message.content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
  const toolCalls = message.content.filter((block) => block.type === "tool-call").map((block) => ({
    id: String(block.id),
    type: "function",
    function: { name: block.name, arguments: block.arguments }
  }));
  const body = {
    role: "assistant",
    content: text,
    // Reasoning is the model's own scratch work, and routes disagree about
    // whether it may come back: this relay answers 400 for a replayed
    // assistant turn that carries it, and DeepSeek's own API documents the
    // same. A route that needs its thinking back — an interleaved-thinking
    // provider — asks for it with `replayReasoning: true`.
    ...replayReasoning && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
  };
  if (text.length === 0 || assistantTextReplay === "keep") return [body];
  if (assistantTextReplay === "drop") return [{ ...body, content: "" }];
  return [{ role: "user", name: "assistant", content: text }, { ...body, content: "" }];
}
function wireMessages(message, images, replayReasoning, assistantTextReplay) {
  if (message.role === "assistant") return assistantMessages(message, replayReasoning, assistantTextReplay);
  return wireMessage(message, images);
}
function serializeChatRequest(options, model, images, replayReasoning = false, assistantTextReplay = "keep", thinking = "toggle") {
  const messages = [];
  if (options.system !== void 0) messages.push({ role: "system", content: options.system });
  const pendingBridges = [];
  for (const message of options.messages) {
    const wire = wireMessages(message, images, replayReasoning, assistantTextReplay);
    if (message.role !== "tool") {
      messages.push(...pendingBridges.splice(0), ...wire);
      continue;
    }
    const tool = wire[0];
    if (tool !== void 0) messages.push(tool);
    pendingBridges.push(...wire.slice(1));
  }
  messages.push(...pendingBridges);
  return {
    model,
    messages,
    stream: true,
    ...options.temperature === void 0 ? {} : { temperature: options.temperature },
    ...options.maxTokens === void 0 ? {} : { max_tokens: options.maxTokens },
    ...options.stop === void 0 || options.stop.length === 0 ? {} : { stop: options.stop },
    ...options.tools === void 0 || options.tools.length === 0 ? {} : {
      tools: options.tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters }
      }))
    },
    ...resolveThinking(options.reasoningEffort, thinking)
  };
}
function closeBlock(block) {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "reasoning":
      return { type: "reasoning", text: block.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: ToolCallId(block.callId ?? ""),
        name: block.name ?? "",
        arguments: block.text
      };
  }
}
function acceptIdentity(current, incoming) {
  return typeof incoming === "string" && incoming.length > 0 ? incoming : current;
}
var OPEN_TAG = "<think>";
var CLOSE_TAG = "</think>";
var ThinkTagExtractor = class {
  pending = "";
  state = "text";
  /** Consume one content delta; emit the segments it completes. */
  feed(input) {
    this.pending += input;
    const out = [];
    for (; ; ) {
      const tag = this.state === "text" ? OPEN_TAG : CLOSE_TAG;
      const at = this.pending.indexOf(tag);
      if (at === -1) {
        let keep = 0;
        for (let length = Math.min(tag.length - 1, this.pending.length); length > 0; length--) {
          if (tag.startsWith(this.pending.slice(this.pending.length - length))) {
            keep = length;
            break;
          }
        }
        const emit = this.pending.slice(0, this.pending.length - keep);
        if (emit.length > 0) out.push({ kind: this.state, text: emit });
        this.pending = this.pending.slice(this.pending.length - keep);
        return out;
      }
      if (at > 0) out.push({ kind: this.state, text: this.pending.slice(0, at) });
      this.state = this.state === "text" ? "reasoning" : "text";
      this.pending = this.pending.slice(at + tag.length);
    }
  }
  /** Emit whatever remains when the stream ends; an unclosed think stays reasoning. */
  flush() {
    const out = this.pending.length > 0 ? [{ kind: this.state, text: this.pending }] : [];
    this.pending = "";
    return out;
  }
};
async function* translateChatCompletions(payloads, behavior = {}) {
  let nextIndex = 0;
  let textBlock;
  let reasoningBlock;
  const toolBlocks = /* @__PURE__ */ new Map();
  const order = [];
  let pendingFinish;
  let pendingUsage;
  const think = behavior.inlineReasoning === true ? new ThinkTagExtractor() : void 0;
  function* emitReasoning(text) {
    if (text.length === 0) return;
    if (!reasoningBlock) {
      reasoningBlock = open("reasoning");
      yield { type: "block-start", index: reasoningBlock.index, blockType: "reasoning" };
    }
    reasoningBlock.text += text;
    yield { type: "reasoning-delta", index: reasoningBlock.index, text };
  }
  function* emitText(text) {
    if (text.length === 0) return;
    if (!textBlock) {
      textBlock = open("text");
      yield { type: "block-start", index: textBlock.index, blockType: "text" };
    }
    textBlock.text += text;
    yield { type: "text-delta", index: textBlock.index, text };
  }
  function* emitSegment(segment) {
    yield* segment.kind === "reasoning" ? emitReasoning(segment.text) : emitText(segment.text);
  }
  function open(kind) {
    const block = { index: nextIndex++, kind, text: "" };
    order.push(block);
    return block;
  }
  function* closeOut() {
    if (think !== void 0) {
      for (const segment of think.flush()) yield* emitSegment(segment);
    }
    for (const block of order) {
      yield { type: "block-end", index: block.index, block: closeBlock(block) };
    }
    if (pendingUsage) yield { type: "usage", usage: pendingUsage };
    yield { type: "finish", reason: closeOutReason() };
  }
  function closeOutReason() {
    const reason = pendingFinish ?? { kind: "stop" };
    if (reason.kind !== "stop" || order.some((block) => block.kind !== "reasoning")) return reason;
    return {
      kind: "error",
      failure: {
        message: order.length === 0 ? "model returned a completed response with no content" : "model ended the turn after reasoning without a reply or a tool call",
        code: EMPTY_RESPONSE_CODE
      }
    };
  }
  for await (const payload of payloads) {
    if (payload === DONE) {
      yield* closeOut();
      return;
    }
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      throw new LlmError4(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
    }
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      const reasoning = delta?.reasoning_content ?? (typeof delta?.reasoning === "string" ? delta.reasoning : void 0) ?? delta?.reasoning_details?.map((detail) => detail.text ?? "").join("");
      if (typeof reasoning === "string" && reasoning.length > 0) {
        yield* emitReasoning(reasoning);
      }
      const content = delta?.content;
      if (typeof content === "string" && content.length > 0) {
        if (think === void 0) {
          yield* emitText(content);
        } else {
          for (const segment of think.feed(content)) yield* emitSegment(segment);
        }
      }
      for (const call of delta?.tool_calls ?? []) {
        let block = toolBlocks.get(call.index);
        if (!block) {
          block = open("tool-call");
          toolBlocks.set(call.index, block);
          yield { type: "block-start", index: block.index, blockType: "tool-call" };
        }
        block.callId = acceptIdentity(block.callId, call.id);
        block.name = acceptIdentity(block.name, call.function?.name);
        const fragment = call.function?.arguments ?? "";
        block.text += fragment;
        yield {
          type: "tool-call-delta",
          index: block.index,
          id: ToolCallId(block.callId ?? ""),
          ...block.name !== void 0 ? { name: block.name } : {},
          argumentsDelta: fragment
        };
      }
      if (typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) {
        pendingFinish = mapFinishReason(choice.finish_reason);
      }
    }
    if (chunk.usage) pendingUsage = mapUsage(chunk.usage);
  }
  if (pendingFinish !== void 0) {
    yield* closeOut();
    return;
  }
  throw new LlmError4("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}
async function* streamChatCompletions(connection, options, model, images, behavior = {}) {
  const response = await postSse(
    connection,
    "chat/completions",
    serializeChatRequest(
      options,
      model,
      images,
      behavior.replayReasoning ?? false,
      behavior.assistantTextReplay ?? "keep",
      behavior.thinking ?? "toggle"
    ),
    options.signal
  );
  yield* translateChatCompletions(
    behavior.inlineReasoning === true ? parseSseUntilEof(response.body) : parseSse(response.body),
    behavior.inlineReasoning === true ? { inlineReasoning: true } : {}
  );
}

// src/engines/protocom/protocol/messages.ts
import { contentHasImage as contentHasImage2, EMPTY_RESPONSE_CODE as EMPTY_RESPONSE_CODE2, LlmError as LlmError5, ToolCallId as ToolCallId2 } from "@deepseek-ai/dsh-llm";
var ANTHROPIC_VERSION = "2023-06-01";
var DEFAULT_MAX_TOKENS = 8192;
function messagesConnection(connection) {
  return {
    ...connection,
    headers: {
      ...connection.headers,
      "x-api-key": connection.apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    }
  };
}
function mapMessageUsage(usage) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const read2 = usage.cache_read_input_tokens;
  const write = usage.cache_creation_input_tokens;
  const combined = input + output + (read2 ?? 0) + (write ?? 0);
  const exact = [input, output, read2 ?? 0, write ?? 0].every((count) => Number.isSafeInteger(count) && count >= 0) && Number.isSafeInteger(combined);
  return {
    inputTokens: input,
    outputTokens: output,
    ...exact ? { totalTokens: combined } : {},
    ...read2 === void 0 ? {} : { cacheReadTokens: read2 },
    ...write === void 0 ? {} : { cacheWriteTokens: write }
  };
}
function mapStopReason(reason) {
  switch (reason) {
    case "end_turn":
      return { kind: "stop" };
    case "stop_sequence":
      return { kind: "stop" };
    case "tool_use":
      return { kind: "tool-calls" };
    case "max_tokens":
      return { kind: "max-tokens" };
    default:
      return {
        kind: "error",
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() }
      };
  }
}
function flattenText2(blocks) {
  return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function imageSource(url) {
  const data = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (data !== null && data[1] !== void 0 && data[2] !== void 0) {
    return { type: "base64", media_type: data[1], data: data[2] };
  }
  if (/^https?:\/\//.test(url)) return { type: "url", url };
  return void 0;
}
function imageBlocks(blocks, images) {
  const out = [];
  if (images === void 0 || images.size === 0) return out;
  for (const block of blocks) {
    if (block.type !== "image") continue;
    const url = images.get(String(block.attachment.attachmentId));
    if (url === void 0) continue;
    const source = imageSource(url);
    if (source !== void 0) out.push({ type: "image", source });
  }
  return out;
}
var TOOL_IMAGE_BRIDGE2 = "The image returned by the tool call above:";
function wireMessage2(message, images) {
  if (message.role === "developer") {
    return [{ role: "user", content: [{ type: "text", text: flattenText2(message.content) }] }];
  }
  if (message.role === "user") {
    return [{ role: "user", content: userBlocks(message.content, images) }];
  }
  if (message.role === "tool") {
    const text = flattenText2(message.content);
    const block = {
      type: "tool_result",
      tool_use_id: String(message.toolCallId),
      content: text,
      // The wire's own failure flag. Sending the text alone loses the
      // distinction between a tool that answered and one that failed, which is
      // information the model uses.
      ...message.isError === true ? { is_error: true } : {}
    };
    const retained = imageBlocks(message.content, images);
    if (retained.length === 0) return [{ role: "user", content: [block] }];
    return [
      { role: "user", content: [block] },
      { role: "user", content: [{ type: "text", text: TOOL_IMAGE_BRIDGE2 }, ...retained] }
    ];
  }
  throw new LlmError5("assistant messages are serialized by assistantTurns()", "INVALID_REQUEST");
}
function userBlocks(blocks, images) {
  const text = flattenText2(blocks);
  const parts = text.length > 0 ? [{ type: "text", text }] : [];
  parts.push(...imageBlocks(blocks, images));
  return parts.length === 0 ? [{ type: "text", text }] : parts;
}
function toolInput(argumentsJson) {
  if (argumentsJson.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(argumentsJson);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
function assistantTurns(message) {
  if (contentHasImage2(message.content)) {
    throw new LlmError5(
      "The protocom-api messages adapter does not support image content on an assistant message.",
      "UNSUPPORTED_CONTENT"
    );
  }
  const blocks = [];
  const text = flattenText2(message.content);
  if (text.length > 0) blocks.push({ type: "text", text });
  for (const block of message.content) {
    if (block.type !== "tool-call") continue;
    blocks.push({ type: "tool_use", id: String(block.id), name: block.name, input: toolInput(block.arguments) });
  }
  return [{ role: "assistant", content: blocks }];
}
function coalesce(messages) {
  const out = [];
  for (const message of messages) {
    const last = out[out.length - 1];
    if (last !== void 0 && last.role === message.role) {
      last.content.push(...message.content);
      continue;
    }
    if (out.length === 0 && message.role === "assistant") continue;
    out.push({ role: message.role, content: [...message.content] });
  }
  return out;
}
function resolveMessagesThinking(effort) {
  if (effort === void 0) return {};
  if (effort === "none" || effort === "off") return { thinking: { type: "disabled" } };
  return { output_config: { effort } };
}
function serializeMessagesRequest(options, model, images) {
  const system = [];
  if (options.system !== void 0 && options.system.length > 0) system.push(options.system);
  const messages = [];
  const pendingBridges = [];
  for (const message of options.messages) {
    if (message.role === "system") {
      const text = flattenText2(message.content);
      if (text.length > 0) system.push(text);
      continue;
    }
    const wire = message.role === "assistant" ? assistantTurns(message) : wireMessage2(message, images);
    if (message.role !== "tool") {
      messages.push(...pendingBridges.splice(0), ...wire);
      continue;
    }
    const first = wire[0];
    if (first !== void 0) messages.push(first);
    pendingBridges.push(...wire.slice(1));
  }
  messages.push(...pendingBridges);
  return {
    model,
    messages: coalesce(messages),
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: true,
    ...system.length === 0 ? {} : { system: system.join("\n\n") },
    ...options.temperature === void 0 ? {} : { temperature: options.temperature },
    ...options.stop === void 0 || options.stop.length === 0 ? {} : { stop_sequences: [...options.stop] },
    ...options.tools === void 0 || options.tools.length === 0 ? {} : {
      tools: options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
      }))
    },
    ...resolveMessagesThinking(options.reasoningEffort)
  };
}
function positiveOr(later, earlier) {
  if (later !== void 0 && later > 0) return later;
  return earlier;
}
function closeBlock2(block) {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "reasoning":
      return { type: "reasoning", text: block.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: ToolCallId2(block.callId ?? ""),
        name: block.name ?? "",
        arguments: block.text
      };
  }
}
async function* translateMessages(payloads) {
  let nextIndex = 0;
  const open = /* @__PURE__ */ new Map();
  const order = [];
  let pendingFinish;
  let pendingUsage;
  let stopped = false;
  function openBlock(index, kind) {
    const block = { index: nextIndex++, kind, text: "", complete: false };
    open.set(index, block);
    order.push(block);
    return block;
  }
  function truncationReason(settled) {
    if (settled.kind === "error") return settled;
    return {
      kind: "error",
      failure: {
        message: "messages stream carried a tool call whose arguments never completed",
        code: "STREAM_CLOSED"
      }
    };
  }
  function mergeUsage(usage) {
    const next = mapMessageUsage(usage);
    const previous = pendingUsage;
    if (previous === void 0) {
      pendingUsage = next;
      return;
    }
    const inputTokens = next.inputTokens > 0 ? next.inputTokens : previous.inputTokens;
    const outputTokens = next.outputTokens > 0 ? next.outputTokens : previous.outputTokens;
    const cacheReadTokens = positiveOr(next.cacheReadTokens, previous.cacheReadTokens);
    const cacheWriteTokens = positiveOr(next.cacheWriteTokens, previous.cacheWriteTokens);
    const combined = inputTokens + outputTokens + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
    const exact = [inputTokens, outputTokens, cacheReadTokens ?? 0, cacheWriteTokens ?? 0].every((count) => Number.isSafeInteger(count) && count >= 0) && Number.isSafeInteger(combined);
    pendingUsage = {
      inputTokens,
      outputTokens,
      ...exact ? { totalTokens: combined } : {},
      ...cacheReadTokens === void 0 ? {} : { cacheReadTokens },
      ...cacheWriteTokens === void 0 ? {} : { cacheWriteTokens }
    };
  }
  function* closeOut() {
    let truncated = false;
    for (const block of order) {
      if (block.kind === "tool-call" && !block.complete) {
        truncated = true;
        continue;
      }
      yield { type: "block-end", index: block.index, block: closeBlock2(block) };
    }
    if (pendingUsage) yield { type: "usage", usage: pendingUsage };
    yield { type: "finish", reason: closeOutReason(truncated) };
  }
  function closeOutReason(truncated) {
    const reason = pendingFinish ?? { kind: "stop" };
    if (truncated) return truncationReason(reason);
    const visible = order.some((block) => block.kind !== "reasoning" && block.text.length > 0);
    if (reason.kind !== "stop" || visible) return reason;
    const thought = order.some((block) => block.kind === "reasoning" && block.text.length > 0);
    return {
      kind: "error",
      failure: {
        message: thought ? "model ended the turn after reasoning without a reply or a tool call" : "model returned a completed response with no content",
        code: EMPTY_RESPONSE_CODE2
      }
    };
  }
  for await (const payload of payloads) {
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new LlmError5(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
    }
    switch (event.type) {
      // Keepalives and the wire's periodic `ping` carry nothing to translate.
      case "ping":
      case void 0:
        break;
      case "message_start": {
        if (event.message?.usage) mergeUsage(event.message.usage);
        break;
      }
      case "content_block_start": {
        const index = event.index ?? 0;
        const type = event.content_block?.type;
        if (type !== "text" && type !== "thinking" && type !== "tool_use") break;
        if (open.has(index)) break;
        const kind = type === "thinking" ? "reasoning" : type === "tool_use" ? "tool-call" : "text";
        const block = openBlock(index, kind);
        block.callId = event.content_block?.id;
        block.name = event.content_block?.name;
        yield { type: "block-start", index: block.index, blockType: kind };
        break;
      }
      case "content_block_delta": {
        const block = open.get(event.index ?? 0);
        if (block === void 0) break;
        const delta = event.delta;
        if (delta?.type === "text_delta" && block.kind === "text" && typeof delta.text === "string") {
          block.text += delta.text;
          yield { type: "text-delta", index: block.index, text: delta.text };
          break;
        }
        if (delta?.type === "thinking_delta" && block.kind === "reasoning" && typeof delta.thinking === "string") {
          block.text += delta.thinking;
          yield { type: "reasoning-delta", index: block.index, text: delta.thinking };
          break;
        }
        if (delta?.type === "input_json_delta" && block.kind === "tool-call" && typeof delta.partial_json === "string") {
          block.text += delta.partial_json;
          yield {
            type: "tool-call-delta",
            index: block.index,
            id: ToolCallId2(block.callId ?? ""),
            ...block.name === void 0 ? {} : { name: block.name },
            argumentsDelta: delta.partial_json
          };
          break;
        }
        break;
      }
      case "content_block_stop": {
        const block = open.get(event.index ?? 0);
        if (block !== void 0) block.complete = true;
        break;
      }
      case "message_delta": {
        if (event.usage) mergeUsage(event.usage);
        const stop = event.delta?.stop_reason;
        if (typeof stop === "string" && stop.length > 0) pendingFinish = mapStopReason(stop);
        break;
      }
      case "message_stop": {
        stopped = true;
        break;
      }
      case "error": {
        const message = event.error?.message ?? "upstream reported an error";
        throw new LlmError5(message, "SERVER", { cause: new Error(event.error?.type ?? "messages_error") });
      }
      default:
        break;
    }
    if (stopped) {
      yield* closeOut();
      return;
    }
  }
  if (pendingFinish !== void 0) {
    yield* closeOut();
    return;
  }
  throw new LlmError5("messages stream ended without a terminal event", "STREAM_CLOSED");
}
async function* streamMessages(connection, options, model, images) {
  const response = await postSse(
    messagesConnection(connection),
    "messages",
    serializeMessagesRequest(options, model, images),
    options.signal
  );
  yield* translateMessages(parseSseUntilEof(response.body));
}

// src/engines/protocom/protocol/responses.ts
import { contentHasImage as contentHasImage3, EMPTY_RESPONSE_CODE as EMPTY_RESPONSE_CODE3, LlmError as LlmError6, ToolCallId as ToolCallId3 } from "@deepseek-ai/dsh-llm";
function mapResponseUsage(usage) {
  const cacheRead = usage.input_tokens_details?.cached_tokens;
  const reasoning = usage.output_tokens_details?.reasoning_tokens;
  const combined = usage.input_tokens + usage.output_tokens;
  const hasExactTotal = Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0 && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0 && Number.isSafeInteger(combined) && (usage.total_tokens === void 0 || usage.total_tokens === combined);
  return {
    inputTokens: usage.input_tokens - (cacheRead ?? 0),
    outputTokens: usage.output_tokens,
    ...hasExactTotal ? { totalTokens: combined } : {},
    ...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== void 0 ? { reasoningTokens: reasoning } : {}
  };
}
function flattenText3(blocks) {
  return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function inputTextItem(role, text) {
  return { type: "message", role, content: [{ type: "input_text", text }] };
}
function inputParts(blocks, images) {
  const text = flattenText3(blocks);
  const parts = text.length > 0 ? [{ type: "input_text", text }] : [];
  for (const block of blocks) {
    if (block.type !== "image") continue;
    const url = images?.get(String(block.attachment.attachmentId));
    if (url !== void 0) parts.push({ type: "input_image", image_url: url });
  }
  return parts.length === 0 ? [{ type: "input_text", text }] : parts;
}
function wireInput(message, images) {
  if (message.role === "system") return [inputTextItem("system", flattenText3(message.content))];
  if (message.role === "tool") {
    const parts = inputParts(message.content, images);
    return [{
      type: "function_call_output",
      call_id: String(message.toolCallId),
      // A text-only tool result keeps the historical string form, so nothing
      // about the common path changes; only a result carrying an image needs
      // the content-part form the protocol also accepts.
      output: parts.length === 1 && parts[0]?.type === "input_text" ? parts[0].text : parts
    }];
  }
  if (message.role === "user") {
    return [{ type: "message", role: "user", content: inputParts(message.content, images) }];
  }
  if (contentHasImage3(message.content)) {
    throw new LlmError6(
      "The protocom-api responses adapter does not support image content on an assistant message.",
      "UNSUPPORTED_CONTENT"
    );
  }
  const items = [];
  const text = flattenText3(message.content);
  if (text.length > 0) {
    items.push({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
  }
  for (const block of message.content) {
    if (block.type !== "tool-call") continue;
    items.push({
      type: "function_call",
      call_id: String(block.id),
      name: block.name,
      arguments: block.arguments
    });
  }
  return items;
}
function serializeResponsesRequest(options, model, images) {
  const input = [];
  for (const message of options.messages) input.push(...wireInput(message, images));
  const effort = options.reasoningEffort;
  return {
    model,
    input,
    stream: true,
    store: false,
    ...options.system === void 0 ? {} : { instructions: options.system },
    ...effort === void 0 || effort === "off" ? {} : { reasoning: { effort } },
    ...options.temperature === void 0 ? {} : { temperature: options.temperature },
    ...options.maxTokens === void 0 ? {} : { max_output_tokens: options.maxTokens },
    ...options.tools === void 0 || options.tools.length === 0 ? {} : {
      tools: options.tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    }
  };
}
function closeBlock3(block) {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "reasoning":
      return { type: "reasoning", text: block.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: ToolCallId3(block.callId ?? ""),
        name: block.name ?? "",
        arguments: block.text
      };
  }
}
function acceptIdentity2(current, incoming) {
  return typeof incoming === "string" && incoming.length > 0 ? incoming : current;
}
function streamedRemainder(streamed, complete) {
  if (complete === void 0 || complete.length === 0) return void 0;
  if (!complete.startsWith(streamed)) return void 0;
  return complete.slice(streamed.length);
}
function acceptComplete(block, complete) {
  if (complete === void 0 || complete.length === 0) return;
  if (block.text !== complete) return;
  block.complete = true;
}
function itemReasoningText(item) {
  const parts = [
    ...(item.content ?? []).filter((part) => part.type === "reasoning_text").map((part) => part.text ?? ""),
    ...(item.summary ?? []).map((part) => part.text ?? "")
  ].filter((text) => text.length > 0);
  return parts.length === 0 ? void 0 : parts.join("");
}
async function* translateResponses(payloads) {
  let nextIndex = 0;
  let textBlock;
  let reasoningBlock;
  const order = [];
  let pendingFinish;
  let pendingUsage;
  let sawToolCall = false;
  let sawTerminal = false;
  const toolBlocks = /* @__PURE__ */ new Map();
  function open(kind) {
    const block = { index: nextIndex++, kind, text: "" };
    order.push(block);
    return block;
  }
  function toolBlockFor(identity) {
    let block = toolBlocks.get(identity);
    if (!block) {
      block = open("tool-call");
      toolBlocks.set(identity, block);
    }
    return block;
  }
  function identityOf(itemId, outputIndex) {
    if (typeof itemId === "string" && itemId.length > 0) return itemId;
    if (typeof outputIndex === "number" && Number.isSafeInteger(outputIndex)) return `#${outputIndex}`;
    return void 0;
  }
  function* announce(block, id, name2) {
    block.callId = acceptIdentity2(block.callId, id);
    block.name = acceptIdentity2(block.name, name2);
    if (block.announced !== true) {
      block.announced = true;
      sawToolCall = true;
      yield { type: "block-start", index: block.index, blockType: "tool-call" };
    }
  }
  function* emitArguments(block, fragment) {
    if (block.complete === true || fragment.length === 0) return;
    block.text += fragment;
    yield {
      type: "tool-call-delta",
      index: block.index,
      id: ToolCallId3(block.callId ?? ""),
      ...block.name === void 0 ? {} : { name: block.name },
      argumentsDelta: fragment
    };
  }
  function* emitReasoning(fragment) {
    if (fragment === void 0 || fragment.length === 0) return;
    if (reasoningBlock === void 0) {
      reasoningBlock = open("reasoning");
      yield { type: "block-start", index: reasoningBlock.index, blockType: "reasoning" };
    }
    reasoningBlock.text += fragment;
    yield { type: "reasoning-delta", index: reasoningBlock.index, text: fragment };
  }
  for await (const payload of payloads) {
    if (payload === DONE) {
      sawTerminal = true;
      break;
    }
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new LlmError6(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
    }
    switch (event.type) {
      case "response.output_text.delta": {
        if (typeof event.delta !== "string" || event.delta.length === 0) break;
        if (!textBlock) {
          textBlock = open("text");
          yield { type: "block-start", index: textBlock.index, blockType: "text" };
        }
        textBlock.text += event.delta;
        yield { type: "text-delta", index: textBlock.index, text: event.delta };
        break;
      }
      // Streaming reasoning. Models differ on the spelling: the plain
      // `response.reasoning.delta`, the summary variant, or — StepFun's own
      // — `response.reasoning_text.delta`.
      case "response.reasoning.delta":
      case "response.reasoning_text.delta":
      case "response.reasoning_summary_text.delta": {
        yield* emitReasoning(typeof event.delta === "string" ? event.delta : void 0);
        break;
      }
      // Terminal reasoning: the whole text once more. Only the part the deltas
      // have not carried is emitted, so a model that streams AND restates never
      // doubles its reasoning, while a model that only restates still delivers
      // the complete text as one delta.
      case "response.reasoning.done":
      case "response.reasoning_text.done":
      case "response.reasoning_summary_text.done": {
        yield* emitReasoning(streamedRemainder(
          reasoningBlock?.text ?? "",
          typeof event.text === "string" ? event.text : void 0
        ));
        break;
      }
      case "response.reasoning_part.done":
      case "response.reasoning_summary_part.done": {
        yield* emitReasoning(streamedRemainder(
          reasoningBlock?.text ?? "",
          typeof event.part?.text === "string" ? event.part.text : void 0
        ));
        break;
      }
      case "response.output_item.added": {
        const item = event.item;
        if (item?.type === "reasoning") {
          yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", itemReasoningText(item)));
          break;
        }
        if (item?.type !== "function_call") break;
        const identity = identityOf(item.id ?? event.item_id, event.output_index);
        if (identity === void 0) break;
        const block = toolBlockFor(identity);
        yield* announce(block, item.call_id, item.name);
        yield* emitArguments(block, item.arguments ?? "");
        break;
      }
      case "response.function_call_arguments.delta": {
        const identity = identityOf(event.item_id, event.output_index);
        if (identity === void 0 || typeof event.delta !== "string") break;
        const deltaBlock = toolBlockFor(identity);
        yield* announce(deltaBlock, void 0, void 0);
        yield* emitArguments(deltaBlock, event.delta);
        break;
      }
      case "response.function_call_arguments.done": {
        const identity = identityOf(event.item_id, event.output_index);
        if (identity === void 0) break;
        const block = toolBlockFor(identity);
        yield* announce(block, void 0, void 0);
        yield* emitArguments(block, streamedRemainder(block.text, event.arguments) ?? "");
        acceptComplete(block, event.arguments);
        break;
      }
      case "response.output_item.done": {
        const item = event.item;
        if (item?.type === "reasoning") {
          yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", itemReasoningText(item)));
          break;
        }
        if (item?.type !== "function_call") break;
        const identity = identityOf(item.id ?? event.item_id, event.output_index);
        const block = identity === void 0 ? open("tool-call") : toolBlockFor(identity);
        yield* announce(block, item.call_id, item.name);
        yield* emitArguments(block, streamedRemainder(block.text, item.arguments) ?? "");
        acceptComplete(block, item.arguments);
        break;
      }
      case "response.completed":
      case "response.incomplete": {
        sawTerminal = true;
        if (event.response?.usage) pendingUsage = mapResponseUsage(event.response.usage);
        const reason2 = event.response?.incomplete_details?.reason;
        const incomplete = event.type === "response.incomplete" || event.response?.status === "incomplete";
        pendingFinish = sawToolCall ? { kind: "tool-calls" } : reason2 === "max_output_tokens" || reason2 === "max_tokens" || incomplete && reason2 === void 0 ? { kind: "max-tokens" } : { kind: "stop" };
        break;
      }
      case "response.failed": {
        sawTerminal = true;
        const message = event.response?.error?.message ?? "the model call failed";
        pendingFinish = {
          kind: "error",
          failure: { message, code: event.response?.error?.code ?? "PROVIDER_ERROR" }
        };
        break;
      }
      case "error": {
        sawTerminal = true;
        pendingFinish = {
          kind: "error",
          failure: { message: event.message ?? "the model call failed", code: event.code ?? "PROVIDER_ERROR" }
        };
        break;
      }
      default:
        break;
    }
  }
  if (!sawTerminal) {
    throw new LlmError6("Protocom responses stream ended before a terminal event", "STREAM_CLOSED");
  }
  let truncated = false;
  for (const block of order) {
    if (block.kind === "tool-call" && block.complete !== true) {
      truncated = true;
      continue;
    }
    yield { type: "block-end", index: block.index, block: closeBlock3(block) };
  }
  if (pendingUsage) yield { type: "usage", usage: pendingUsage };
  const settled = pendingFinish ?? (sawToolCall ? { kind: "tool-calls" } : { kind: "stop" });
  const reason = truncated && settled.kind !== "error" ? {
    kind: "error",
    failure: {
      message: "Protocom responses stream carried a tool call whose arguments never completed",
      code: "STREAM_CLOSED"
    }
  } : settled;
  yield {
    type: "finish",
    reason: reason.kind === "stop" && order.every((block) => block.kind === "reasoning") ? {
      kind: "error",
      failure: {
        // Reasoning is scratch work, never the turn's answer: a stream that
        // carries only a reasoning item and then stops is the same degenerate
        // completion the chat path guards against, and the same retryable
        // EMPTY_RESPONSE puts it in front of the retry layer (see the
        // chat-completions translator for the measured upstream behaviour).
        message: order.length === 0 ? "model returned a completed response with no content" : "model ended the turn after reasoning without a reply or a tool call",
        code: EMPTY_RESPONSE_CODE3
      }
    } : reason
  };
}
async function* streamResponses(connection, options, model, images) {
  const response = await postSse(
    connection,
    "responses",
    serializeResponsesRequest(options, model, images),
    options.signal
  );
  yield* translateResponses(parseSseUntilEof(response.body));
}

// src/engines/protocom/adapter.ts
var MODEL_LIST_TTL_MS = 6e4;
var PLAN_TTL_MS = 15 * 60 * 1e3;
var REQUEST_IMAGE_MAX_PIXELS = 64e4;
var REQUEST_IMAGE_TARGET_BYTES = 1024 * 1024;
function requestImageTargetFor(ref) {
  return {
    ...requestImageDimensions(ref.width, ref.height, REQUEST_IMAGE_MAX_PIXELS),
    maxBytes: REQUEST_IMAGE_TARGET_BYTES
  };
}
var REQUEST_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;
var REQUEST_IMAGE_MAX_COUNT = 600;
var STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";
var TEARDOWN_GRACE_MS = 1e3;
function oneShot(promise, signal) {
  let consumed = false;
  return {
    next: async () => {
      if (consumed) return { done: true, value: void 0 };
      consumed = true;
      return { done: false, value: await abortable(promise, signal) };
    }
  };
}
function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
function teardownGrace() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, TEARDOWN_GRACE_MS);
    timer.unref?.();
  });
}
function collectImageRefs(content, refs) {
  for (const block of content) {
    if (block.type === "image") refs.set(String(block.attachment.attachmentId), block.attachment);
  }
}
function toDataUrl(image) {
  return `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}`;
}
var WIRE_SESSION_PREFIX = "dsh-go-session-v1-";
function wireSessionValue(sessionId) {
  if (sessionId.length <= 64 && !/[^\x21-\x7e]/.test(sessionId) && !sessionId.startsWith(WIRE_SESSION_PREFIX)) {
    return sessionId;
  }
  return WIRE_SESSION_PREFIX + createHash("sha256").update(sessionId, "utf16le").digest("base64url");
}
function reasoningInfo(reasoning) {
  return {
    efforts: reasoning.efforts.map((effort) => ({
      id: ReasoningEffortId(effort),
      name: effort.charAt(0).toUpperCase() + effort.slice(1)
    })),
    ...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: ReasoningEffortId(reasoning.defaultEffort) }
  };
}
var ProtocomAdapter = class extends LlmAdapter {
  constructor(config) {
    super();
    this.config = config;
  }
  listings = /* @__PURE__ */ new Map();
  /**
   * The last successfully resolved listing per group. Dispatch reads it to see
   * which endpoints the gateway declared for a model, so protocol selection
   * costs no network round trip; {@link invalidateListings} drops it with the
   * promise cache so the two can never disagree.
   */
  resolved = /* @__PURE__ */ new Map();
  /**
   * Scraped capability catalogs, keyed by page URL. Cached because the page is
   * large (~765 KB) and changes at most daily, while the menu is built on every
   * discovery and settings read.
   */
  capabilityCache = /* @__PURE__ */ new Map();
  /**
   * The account's subscription tier per family. Cached for the same reason the
   * catalog is: it changes at most once a billing period while the menu is
   * rebuilt on every discovery and settings read.
   */
  tierCache = /* @__PURE__ */ new Map();
  /**
   * Stable per-adapter session id for calls that arrive without
   * `GenerateOptions.sessionId`. The OpenCode Go endpoint answers 400
   * `MissingSessionID` without one, so non-conversational traffic (title
   * generation, probes) rides this value: stable per adapter, never invented
   * per request, which keeps the gateway's session accounting honest.
   */
  fallbackSession = `dsh-${globalThis.crypto.randomUUID()}`;
  /** The family this adapter instance serves (Protocom for hand-built options). */
  family() {
    return this.config.options().family ?? PROTOCOM;
  }
  providerInfo(provider) {
    const family = this.family();
    const key = family.groupOf(provider);
    return { id: provider, name: key === void 0 ? provider : family.defaults[key]?.displayName ?? provider };
  }
  providerRetryPolicy(_provider) {
    return retryPolicyFor(this.config.options());
  }
  /** The enabled group behind one route; every dispatch path starts here. */
  groupFor(provider) {
    const family = this.family();
    const key = family.groupOf(provider);
    const group2 = key === void 0 ? void 0 : this.config.options().groups.get(key);
    if (group2 === void 0 || !group2.enabled) {
      throw new LlmError7(`${family.ns}: provider route "${provider}" is not an enabled group`, "NO_PROVIDER");
    }
    return group2;
  }
  /**
   * The endpoints the gateway itself declared for one model, when the last
   * listing is still cached. Serving from the cache keeps dispatch free of a
   * network round trip on the hot path; a cold cache simply falls back to the
   * group's protocol, which is what every family did before this existed.
   */
  declaredEndpoints(group2, model) {
    const cached = this.resolved.get(group2.key);
    if (cached === void 0) return void 0;
    return cached.find((row) => row.id === model)?.endpoints;
  }
  /** One group's live model listing, cached briefly; failures are not cached. */
  upstreamModels(group2, signal) {
    const hit = this.listings.get(group2.key);
    if (hit !== void 0 && Date.now() - hit.at < MODEL_LIST_TTL_MS) return hit.value;
    const { baseURL } = this.config.options();
    const family = this.family();
    const value = this.config.resolveApiKey(group2).then((apiKey) => fetchUpstreamModels(baseURL, apiKey, signal)).then(async (rows) => {
      if (family.capabilityCatalogUrl === void 0) return rows;
      const { byId } = await this.capabilities(family);
      if (byId.size === 0) return rows;
      const tier = await this.accountTier(family, group2);
      return rows.map((row) => {
        const found = catalogFor(byId, row.id);
        if (found === void 0) return row;
        if (!withinTier(found.minPlan, tier)) return { ...row, outOfPlan: true };
        return {
          ...row,
          ...found.contextWindow === void 0 || row.contextWindow !== void 0 ? {} : { contextWindow: found.contextWindow },
          ...found.inputCost === void 0 ? {} : { inputCost: found.inputCost },
          ...found.outputCost === void 0 ? {} : { outputCost: found.outputCost },
          ...found.cacheReadCost === void 0 ? {} : { cacheReadCost: found.cacheReadCost },
          // A definite vision verdict always wins; the permissive default
          // only applies where the catalog said nothing.
          ...row.vision === void 0 ? { vision: found.vision } : {},
          // A model that cannot reason must not be sent a thinking parameter.
          ...found.reasoning ? {} : { reasoning: false }
        };
      });
    });
    value.then((rows) => {
      if (this.listings.get(group2.key)?.value === value) this.resolved.set(group2.key, rows);
    }).catch(() => {
      if (this.listings.get(group2.key)?.value === value) {
        this.listings.delete(group2.key);
        this.resolved.delete(group2.key);
      }
    });
    this.listings.set(group2.key, { at: Date.now(), value });
    return value;
  }
  /** Forget cached listings so a configuration change re-interrogates. */
  invalidateListings() {
    this.listings.clear();
    this.resolved.clear();
  }
  /**
   * The input modalities one route advertises for one model. Image input is
   * declared wherever the model accepts it — the deployment's own choice, then
   * the registry's verified verdict, then permissive — and both wire protocols
   * carry one, so no protocol-shaped hole is left for a capability to fall
   * into.
   */
  inputModalitiesFor(upstreamId) {
    return acceptsImages(upstreamId, this.config.options().visionModels, this.family().registry) ? ["text", "image"] : ["text"];
  }
  /**
   * The context lengths one model should be offered at, delegating to the one
   * shared expression the settings row also evaluates so the menu entries and
   * the chips cannot describe different sets.
   */
  contextLengthsFor(group2, model) {
    return contextVariantsFor(
      model,
      group2.contextLengths,
      this.config.options().modelContexts.get(identityKey(model.upstreamId, this.family().registry))
    );
  }
  /** The catalog entries one model advertises, one per variant. */
  modelEntries(provider, group2, model) {
    const inputModalities = this.inputModalitiesFor(model.upstreamId);
    const lengths = this.contextLengthsFor(group2, model);
    if (lengths === void 0) {
      return [{
        provider,
        id: model.upstreamId,
        name: displayNameWithContext(model.displayName, model.contextWindow),
        inputModalities
      }];
    }
    return lengths.map((length) => ({
      provider,
      id: encodeVariantId(model.upstreamId, length),
      name: displayNameWithContext(model.displayName, length),
      inputModalities
    }));
  }
  /**
   * The capability catalog for one family, scraped from its own page and cached.
   *
   * Absent when the family names no page. A failed scrape returns an empty map
   * with the reason recorded, so callers degrade to "no capability claims"
   * rather than failing: the listing is still enough to serve models, and the
   * menu must not empty because a marketing page changed its markup.
   * @param family - the family whose page to read.
   * @returns capabilities by id, and the reason when the scrape degraded.
   */
  async capabilities(family) {
    const url = family.capabilityCatalogUrl;
    if (url === void 0) return { byId: /* @__PURE__ */ new Map() };
    const hit = this.capabilityCache.get(url);
    if (hit !== void 0 && Date.now() - hit.at < CATALOG_TTL_MS) return hit.value;
    let value;
    try {
      const response = await fetch(url, { headers: { accept: "text/html" }, redirect: "error" });
      if (!response.ok) {
        value = scrapeCatalog(void 0, `the capability page answered HTTP ${response.status}`);
      } else {
        const body = await readBoundedBytes(response, MAX_CATALOG_BYTES);
        value = scrapeCatalog(body);
      }
    } catch (error) {
      value = scrapeCatalog(void 0, `the capability page could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (value.problem !== void 0) {
      this.config.log?.(family.ns + ": " + value.problem + "; models will be offered without capability claims");
    }
    this.capabilityCache.set(url, { at: Date.now(), value });
    return value;
  }
  /**
   * The subscription tier this account is on, read from the family's own
   * subscription endpoint and cached.
   *
   * Needed because an endpoints listing is NOT plan-filtered: the live Command
   * Code listing advertised 82 models, but an account on `individual-goat` got
   * HTTP 403 MODEL_NOT_IN_PLAN for every Pro- and Max-tier one. Offering those
   * would put models in the menu whose every call fails.
   *
   * Any failure yields undefined, which the caller reads as "tier unknown" and
   * therefore "do not filter": hiding models on a network blip would be a worse
   * failure than showing one the account cannot use.
   * @param family - the family whose account surface to read.
   * @param group - the group whose credential authorizes the read.
   * @returns the tier name, lower case, or undefined when it could not be read.
   */
  async accountTier(family, group2) {
    const path = family.planIdPath;
    if (path === void 0) return void 0;
    const cached = this.tierCache.get(family.ns);
    if (cached !== void 0 && Date.now() - cached.at < PLAN_TTL_MS) return cached.value;
    let value;
    try {
      const { baseURL } = this.config.options();
      const apiKey = await this.config.resolveApiKey(group2);
      const response = await fetch(new URL(path, new URL(baseURL).origin).toString(), {
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        redirect: "error"
      });
      if (response.ok) {
        const body = JSON.parse(await readBoundedBytes(response, MAX_PLAN_BYTES));
        const planId = body.data?.planId ?? body.planId;
        value = tierFromPlanId(typeof planId === "string" ? planId : void 0);
      }
    } catch {
      value = void 0;
    }
    this.tierCache.set(family.ns, { at: Date.now(), value });
    return value;
  }
  /**
   * The catalog offered for one route, projected by the same function the
   * settings panel reads (model-registry's `groupCatalog`), so the models a
   * user configures for a group are exactly the models that group's menu
   * offers. Membership is that route's own listing — the credential scopes
   * what the route serves — plus the registry entries tagged for this group,
   * minus the ids the endpoint refuses on its chat route. The picker renders
   * this order verbatim and the harness calls it "adapter-preferred", so the
   * deployment's recommendation decides the head of the list.
   */
  async listModels(provider) {
    const group2 = this.groupFor(provider);
    const { hiddenModels, recommendedModels, visionModels } = this.config.options();
    let listing;
    try {
      listing = await this.upstreamModels(group2);
    } catch {
      listing = void 0;
    }
    if (this.family().listingIsMembership === false) listing = void 0;
    return groupCatalog(group2.key, listing, {
      hidden: hiddenModels,
      recommended: recommendedModels,
      vision: visionModels,
      family: this.family()
    }).flatMap((model) => this.modelEntries(provider, group2, model));
  }
  /**
   * Whether a capability source stated that this model cannot reason at all.
   * @param group - the group whose listing is consulted.
   * @param upstreamId - the upstream model id.
   * @returns true only for a definite negative verdict; false when unstated.
   */
  async modelCannotReason(group2, upstreamId) {
    try {
      const upstream = await this.upstreamModels(group2);
      return upstream.find((model) => model.id === upstreamId)?.reasoning === false;
    } catch {
      return false;
    }
  }
  /** Endpoint-disclosed reasoning vocabulary for one model, when the listing says any. */
  async disclosedReasoning(group2, upstreamId) {
    try {
      const upstream = await this.upstreamModels(group2);
      const row = upstream.find((model) => model.id === upstreamId);
      if (row?.reasoningEfforts === void 0 || row.reasoningEfforts.length === 0) return void 0;
      return {
        efforts: row.reasoningEfforts,
        defaultEffort: row.reasoningEfforts.includes("high") ? "high" : row.reasoningEfforts[0]
      };
    } catch {
      return void 0;
    }
  }
  async modelInfoFor(group2, provider, model) {
    const { upstreamId, contextWindow: variant } = decodeVariantId(model);
    const family = this.family();
    const entry = matchRegistry(upstreamId, family.registry);
    const contextWindow = variant ?? entry?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
    let displayName = entry?.displayName;
    if (displayName === void 0) {
      try {
        const upstream = await this.upstreamModels(group2);
        const row = upstream.find((candidate) => candidate.id === upstreamId);
        displayName = row?.displayName !== void 0 && row.displayName !== upstreamId ? row.displayName : upstreamId;
      } catch {
        displayName = upstreamId;
      }
    }
    const cannotReason = await this.modelCannotReason(group2, upstreamId);
    const reasoning = cannotReason ? void 0 : entry?.reasoning ?? await this.disclosedReasoning(group2, upstreamId) ?? family.reasoningFor?.(upstreamId) ?? family.defaults[group2.key]?.reasoning;
    return {
      provider,
      id: model,
      name: displayNameWithContext(displayName, contextWindow),
      inputModalities: this.inputModalitiesFor(upstreamId),
      context: { contextWindow },
      ...reasoning === void 0 ? {} : { reasoning: reasoningInfo(reasoning) }
    };
  }
  resolveModel(provider, model, _signal) {
    return this.modelInfoFor(this.groupFor(provider), provider, model);
  }
  async prepareCall(provider, model, _signal) {
    const group2 = this.groupFor(provider);
    return {
      model: await this.modelInfoFor(group2, provider, model),
      stream: (options) => this.streamWithGroup(options, group2)
    };
  }
  stream(options) {
    return this.streamWithGroup(options, this.groupFor(options.provider));
  }
  async *streamWithGroup(options, group2) {
    const { baseURL, streamIdleTimeoutMs } = this.config.options();
    const family = this.family();
    const sessionId = options.sessionId === void 0 ? void 0 : String(options.sessionId);
    const apiKey = await this.config.resolveApiKey(group2, sessionId);
    const headers = family.sessionHeader === void 0 ? void 0 : (() => {
      const session = options.sessionId === void 0 ? this.fallbackSession : wireSessionValue(String(options.sessionId));
      return { [family.sessionHeader]: session, "x-deepseek-harness-session-id": session };
    })();
    const connection = {
      baseURL,
      apiKey,
      label: family.label,
      // The clamp and the declared policy are the same number, so a provider's
      // own Retry-After is honoured up to the configured ceiling and can never
      // exceed the policy that compares against it.
      retryAfterCeilingMs: this.config.options().retryMaxDelayMs,
      ...headers === void 0 ? {} : { headers }
    };
    const model = stripVariantId(options.model);
    const consumer = new AbortController();
    const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
    const watchdog = idleWatchdog(upstream, streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE);
    const callOptions = { ...options, signal: watchdog.signal };
    let iterator;
    let exhausted = false;
    try {
      const pending = this.protocolCall(connection, callOptions, group2, model);
      const started = await watchdog.next(oneShot(pending, watchdog.signal));
      if (started.done === true) {
        throw new LlmError7("Protocom adapter produced no stream", "TRANSPORT");
      }
      iterator = started.value[Symbol.asyncIterator]();
      for (; ; ) {
        const result = await watchdog.next(iterator);
        if (result.done) {
          exhausted = true;
          return;
        }
        yield result.value;
      }
    } catch (error) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== void 0) {
        throw new LlmError7(`${family.label} stream idle for ${streamIdleTimeoutMs}ms`, "TIMEOUT", { cause: error });
      }
      if (options.signal?.aborted) {
        throw new LlmError7(`${family.label} request aborted by caller`, "ABORTED", { cause: error });
      }
      const code = error.code;
      if (code === "AUTH" || code === "RATE_LIMIT") {
        this.config.reportKeyFailure?.(group2, sessionId);
      }
      throw error;
    } finally {
      consumer.abort(`${family.label} stream consumer stopped`);
      watchdog[Symbol.dispose]();
      if (!exhausted && iterator !== void 0 && iterator.return !== void 0) {
        const pendingReturn = iterator.return();
        try {
          await Promise.race([pendingReturn, teardownGrace()]);
        } catch {
        }
      }
    }
  }
  /**
   * The wire call for this request's protocol, with this request's image
   * budget applied first. Both protocols carry images: an image resolves to an
   * inline data URL either way, so a group's protocol can no longer decide
   * whether a multimodal model is reachable with one.
   */
  async protocolCall(connection, options, group2, model) {
    const { images, messages } = await this.resolveRequestImages(options, model);
    const projected = messages === options.messages ? options : { ...options, messages: [...messages] };
    const family = this.family();
    const entry = matchRegistry(model, family.registry);
    const protocol = entry?.protocol ?? protocolForEndpoints(this.declaredEndpoints(group2, model)) ?? group2.protocol;
    if (protocol === "messages") {
      return streamMessages(connection, projected, model, images);
    }
    return protocol === "responses" ? streamResponses(connection, projected, model, images) : streamChatCompletions(connection, projected, model, images, {
      replayReasoning: group2.replayReasoning,
      assistantTextReplay: group2.assistantTextReplay,
      thinking: family.chatThinking,
      inlineReasoning: entry?.inlineReasoning
    });
  }
  /**
   * Resolve every image this request carries into the inline data URL the
   * endpoint accepts, applying the whole-request budget first. The harness
   * already projects images away from a text-only route before dispatch, so a
   * retained image here means the route declared the `image` modality; the
   * guard still covers direct adapter use.
   * @param options - the assembled request.
   * @param options - the assembled request.
   * @param model - the upstream model id, variant suffix already stripped.
   * @returns provider-ready data URLs (absent when the request has none) and the
   * message projection the caller must serialize.
   */
  async resolveRequestImages(options, model) {
    const family = this.family();
    const projected = projectOffloadedImages(options.messages, (ref) => offloadedImageText(ref));
    const refs = /* @__PURE__ */ new Map();
    for (const message of projected) collectImageRefs(message.content, refs);
    if (refs.size === 0) return { images: void 0, messages: projected };
    if (!acceptsImages(model, this.config.options().visionModels)) {
      throw new LlmError7(`${family.label} model "${model}" does not accept image input.`, "UNSUPPORTED_CONTENT");
    }
    const attachments = this.config.resolveAttachments?.();
    if (attachments === void 0) {
      throw new LlmError7(
        `${family.label} image input requires the durable attachment service.`,
        "UNSUPPORTED_CONTENT"
      );
    }
    const ordered = [...refs.values()];
    const resolved = await Promise.all(ordered.map(
      (ref) => attachments.readImageRequest(ref, requestImageTargetFor(ref), options.signal)
    ));
    const rawBytes = /* @__PURE__ */ new Map();
    ordered.forEach((ref, index) => {
      rawBytes.set(String(ref.attachmentId), resolved[index].data.byteLength);
    });
    const offloadImages = requiredImageOffload(projected, {
      representation: "base64",
      maxBytes: REQUEST_IMAGE_TOTAL_BYTES,
      maxImages: REQUEST_IMAGE_MAX_COUNT
    }, (block) => rawBytes.get(String(block.attachment.attachmentId)) ?? 0);
    if (offloadImages > 0) {
      throw new LlmError7(
        `${family.label} request images exceed the route budget; ${offloadImages} more oldest occurrence(s) must be offloaded.`,
        IMAGE_OFFLOAD_REQUIRED_CODE,
        { offloadImages }
      );
    }
    const images = /* @__PURE__ */ new Map();
    ordered.forEach((ref, index) => {
      images.set(String(ref.attachmentId), toDataUrl(resolved[index]));
    });
    return { images: images.size === 0 ? void 0 : images, messages: projected };
  }
};

// src/engines/protocom/balance.ts
import { attributionHeaders as attributionHeaders3, LlmError as LlmError8 } from "@deepseek-ai/dsh-llm";

// src/engines/protocom/balance-view.ts
function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function stringField(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function normalizeUsage(body) {
  const report = body;
  const today = report.usage?.today;
  const balance = {};
  const mode = stringField(report.mode);
  if (mode !== void 0) balance.mode = mode;
  const status = stringField(report.status);
  if (status !== void 0) balance.status = status;
  const unit = stringField(report.unit);
  if (unit !== void 0) balance.unit = unit;
  const limit = numberField(report.quota?.limit);
  if (limit !== void 0) balance.limit = limit;
  const used = numberField(report.quota?.used);
  if (used !== void 0) balance.used = used;
  const remaining = numberField(report.quota?.remaining ?? report.remaining);
  if (remaining !== void 0) balance.remaining = remaining;
  const balanceField = numberField(report.balance);
  if (balanceField !== void 0) balance.balance = balanceField;
  const planName = stringField(report.planName);
  if (planName !== void 0) balance.planName = planName;
  const dailyUsageUsd = numberField(report.subscription?.daily_usage_usd);
  if (dailyUsageUsd !== void 0) balance.dailyUsageUsd = dailyUsageUsd;
  const dailyLimitUsd = numberField(report.subscription?.daily_limit_usd);
  if (dailyLimitUsd !== void 0) balance.dailyLimitUsd = dailyLimitUsd;
  const expiresAt = stringField(report.subscription?.expires_at);
  if (expiresAt !== void 0) balance.expiresAt = expiresAt;
  const todayRequests = numberField(today?.requests);
  if (todayRequests !== void 0) balance.todayRequests = todayRequests;
  const todayCost = numberField(today?.cost);
  if (todayCost !== void 0) balance.todayCost = todayCost;
  const rpm = numberField(report.usage?.rpm);
  if (rpm !== void 0) balance.rpm = rpm;
  const tpm = numberField(report.usage?.tpm);
  if (tpm !== void 0) balance.tpm = tpm;
  return balance;
}
function parseBalanceView(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return void 0;
  return normalizeUsage(body);
}
function parseRateMultiplier(body) {
  const parsed = {};
  if (body === null || typeof body !== "object" || Array.isArray(body)) return parsed;
  const report = body;
  const rateMultiplier = numberField(report.resolved_rate_multiplier);
  if (rateMultiplier !== void 0) parsed.rateMultiplier = rateMultiplier;
  const groupRateMultiplier = numberField(report.group_rate_multiplier);
  if (groupRateMultiplier !== void 0) parsed.groupRateMultiplier = groupRateMultiplier;
  return parsed;
}

// src/engines/protocom/balance.ts
var RATE_MULTIPLIER_PATH = "/v1/sub2api/billing";
var BALANCE_FAILURE_BACKOFF_MS = 5e3;
function parseUsage(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new LlmError8("the usage endpoint did not answer with an object", "BALANCE_FAILED");
  }
  return normalizeUsage(body);
}
function cacheKey(key, includeRates) {
  return `${key}|${includeRates ? "rates" : "plain"}`;
}
var BalanceService = class _BalanceService {
  constructor(hooks) {
    this.hooks = hooks;
  }
  /** Cache lifetime for one group's balance. */
  static TTL_MS = 6e4;
  cache = /* @__PURE__ */ new Map();
  failedAt = /* @__PURE__ */ new Map();
  /** Forget every cached balance (a configuration change may alter any group). */
  invalidate() {
    this.cache.clear();
    this.failedAt.clear();
  }
  /**
   * One group's balance, served from cache while fresh.
   * @param key - the group to query.
   * @param includeRates - whether to also read the optional billing-rate endpoint.
   */
  balance(key, includeRates = false) {
    const options = this.hooks.options();
    const group2 = options.groups.get(key);
    if (group2 === void 0 || !group2.enabled) {
      return Promise.reject(new LlmError8(`protocom-api: group "${key}" is not enabled`, "BALANCE_FAILED"));
    }
    const entryKey = cacheKey(key, includeRates);
    const hit = this.cache.get(entryKey);
    if (hit !== void 0 && Date.now() - hit.at < _BalanceService.TTL_MS) return hit.value;
    const failedAt = this.failedAt.get(key);
    if (failedAt !== void 0 && Date.now() - failedAt < BALANCE_FAILURE_BACKOFF_MS) {
      return Promise.reject(new LlmError8(`protocom-api: group "${key}" balance is backing off after a failure`, "BALANCE_FAILED"));
    }
    const value = this.fetchBalance(options.baseURL, group2, includeRates);
    value.then(
      () => {
        this.failedAt.delete(key);
      },
      () => {
        this.failedAt.set(key, Date.now());
        if (this.cache.get(entryKey)?.value === value) this.cache.delete(entryKey);
      }
    );
    this.cache.set(entryKey, { at: Date.now(), value });
    return value;
  }
  async fetchBalance(baseURL, group2, includeRates) {
    const apiKey = await this.hooks.resolveApiKey(group2);
    const headers = {
      "accept": "application/json",
      "authorization": `Bearer ${apiKey}`,
      ...attributionHeaders3()
    };
    const usageUrl = `${baseURL}/v1/usage`;
    let response;
    try {
      response = await fetch(usageUrl, { method: "GET", headers });
    } catch (error) {
      throw new LlmError8(`could not reach ${usageUrl}`, "BALANCE_FAILED", { cause: error });
    }
    if (!response.ok) {
      throw new LlmError8(
        `${usageUrl} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`,
        "BALANCE_FAILED",
        { status: response.status }
      );
    }
    const balance = parseUsage(await response.json());
    if (!includeRates) return balance;
    try {
      const rates = await fetch(`${baseURL}${RATE_MULTIPLIER_PATH}`, { method: "GET", headers });
      if (rates.ok) return { ...balance, ...parseRateMultiplier(await rates.json()) };
    } catch {
    }
    return balance;
  }
};
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS } });
}
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function balanceFetchHandler(service, hooks) {
  return async (request) => {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { ...JSON_HEADERS, allow: "GET" } });
    }
    const url = new URL(request.url);
    const groupParam = url.searchParams.get("group");
    const options = hooks.options();
    if (groupParam !== null) {
      const group2 = options.groups.get(groupParam);
      if (group2 === void 0 || !group2.enabled || !group2.showBalance) {
        return json(404, { error: "no enabled balance-reporting group" });
      }
      try {
        return json(200, await service.balance(group2.key, true));
      } catch (error) {
        hooks.log?.(`protocom-api: balance query for group "${group2.key}" failed: ${describeError(error)}`);
        return json(502, { error: "the balance query failed" });
      }
    }
    const groups = {};
    await Promise.all([...options.groups.values()].filter((group2) => group2.enabled && group2.showBalance).map(async (group2) => {
      try {
        groups[group2.key] = await service.balance(group2.key);
      } catch (error) {
        hooks.log?.(`protocom-api: balance query for group "${group2.key}" failed: ${describeError(error)}`);
        groups[group2.key] = { error: "the balance query failed" };
      }
    }));
    return json(200, { groups });
  };
}

// src/engines/protocom/go-usage.ts
import { attributionHeaders as attributionHeaders4, LlmError as LlmError9 } from "@deepseek-ai/dsh-llm";

// src/engines/protocom/usage-view.ts
function numberField2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function stringField2(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function normalizeWindow(value) {
  if (value === null || typeof value !== "object") return void 0;
  const window = {};
  const percent = numberField2(value.percent);
  if (percent !== void 0) window.percent = percent;
  const status = stringField2(value.status);
  if (status !== void 0) window.status = status;
  const resetsAt = stringField2(value.resetsAt);
  if (resetsAt !== void 0) window.resetsAt = resetsAt;
  return window;
}
function parseGoUsage(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return void 0;
  const wrapped = body.usage;
  const usage = wrapped ?? body;
  if (usage === null || typeof usage !== "object") return void 0;
  const view = {};
  const rolling = normalizeWindow(usage.rolling);
  if (rolling !== void 0) view.rolling = rolling;
  const weekly = normalizeWindow(usage.weekly);
  if (weekly !== void 0) view.weekly = weekly;
  const monthly = normalizeWindow(usage.monthly);
  if (monthly !== void 0) view.monthly = monthly;
  return view;
}

// src/engines/protocom/go-usage.ts
var GO_USAGE_FAILURE_BACKOFF_MS = 5e3;
var GoUsageService = class _GoUsageService {
  constructor(hooks) {
    this.hooks = hooks;
  }
  /** Cache lifetime for one quota reply. */
  static TTL_MS = 6e4;
  cached;
  failedAt;
  /** Forget the cached reply (a configuration change may alter the group). */
  invalidate() {
    this.cached = void 0;
    this.failedAt = void 0;
  }
  /** The whole account's quota windows. */
  usage() {
    const options = this.hooks.options();
    const group2 = options.groups.get("go");
    if (group2 === void 0 || !group2.enabled) {
      return Promise.reject(new LlmError9('opencode-go: group "go" is not enabled', "USAGE_FAILED"));
    }
    if (this.cached !== void 0 && Date.now() - this.cached.at < _GoUsageService.TTL_MS) {
      return this.cached.value;
    }
    if (this.failedAt !== void 0 && Date.now() - this.failedAt < GO_USAGE_FAILURE_BACKOFF_MS) {
      return Promise.reject(new LlmError9("opencode-go: the usage query is backing off after a failure", "USAGE_FAILED"));
    }
    const value = this.fetchUsage(options.baseURL, group2);
    value.then(
      () => {
        this.failedAt = void 0;
      },
      () => {
        this.failedAt = Date.now();
        if (this.cached?.value === value) this.cached = void 0;
      }
    );
    this.cached = { at: Date.now(), value };
    return value;
  }
  async fetchUsage(baseURL, group2) {
    const apiKey = await this.hooks.resolveApiKey(group2);
    const url = `${baseURL}/v1/usage`;
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "accept": "application/json",
          "authorization": `Bearer ${apiKey}`,
          ...attributionHeaders4()
        }
      });
    } catch (error) {
      throw new LlmError9(`could not reach ${url}`, "USAGE_FAILED", { cause: error });
    }
    if (!response.ok) {
      throw new LlmError9(
        `${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`,
        "USAGE_FAILED",
        { status: response.status }
      );
    }
    const parsed = parseGoUsage(await response.json());
    if (parsed === void 0) {
      throw new LlmError9("the usage endpoint did not answer with a usage object", "USAGE_FAILED");
    }
    return parsed;
  }
};
var JSON_HEADERS2 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function json2(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS2 } });
}
function describeError2(error) {
  return error instanceof Error ? error.message : String(error);
}
function goUsageFetchHandler(service, hooks) {
  return async (request) => {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { ...JSON_HEADERS2, allow: "GET" } });
    }
    const group2 = hooks.options().groups.get("go");
    if (group2 === void 0 || !group2.enabled) {
      return json2(404, { error: "the OpenCode Go group is not enabled" });
    }
    try {
      return json2(200, await service.usage());
    } catch (error) {
      hooks.log?.(`opencode-go: usage query failed: ${describeError2(error)}`);
      return json2(502, { error: "the usage query failed" });
    }
  };
}

// src/engines/protocom/commandcode-account.ts
import { attributionHeaders as attributionHeaders5, LlmError as LlmError10 } from "@deepseek-ai/dsh-llm";

// src/engines/protocom/commandcode-view.ts
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function rec(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function parseCommandCodeWindow(raw) {
  const source = rec(raw);
  if (source === void 0) return void 0;
  const used = num(source["used"]);
  const cap = num(source["cap"]);
  if (used === void 0 || cap === void 0) return void 0;
  const resetAt = num(source["resetAt"]);
  return {
    used,
    cap,
    remaining: Math.max(cap - used, 0),
    percent: cap > 0 ? Math.min(Math.max(Math.round(used / cap * 100), 0), 100) : 0,
    exceeded: source["exceeded"] === true,
    ...resetAt === void 0 ? {} : { resetAt }
  };
}
function parseCommandCodeCredits(body) {
  const credits = rec(rec(body)?.["credits"]);
  const limits = rec(rec(body)?.["windowLimits"]);
  if (credits === void 0 && limits === void 0) return void 0;
  const monthlyCredits = num(credits?.["monthlyCredits"]);
  const purchasedCredits = num(credits?.["purchasedCredits"]);
  const freeCredits = num(credits?.["freeCredits"]);
  const fiveHour = parseCommandCodeWindow(limits?.["fiveHour"]);
  const weekly = parseCommandCodeWindow(limits?.["weekly"]);
  const result = {
    ...monthlyCredits === void 0 ? {} : { monthlyCredits },
    ...purchasedCredits === void 0 ? {} : { purchasedCredits },
    ...freeCredits === void 0 ? {} : { freeCredits },
    ...fiveHour === void 0 ? {} : { fiveHour },
    ...weekly === void 0 ? {} : { weekly }
  };
  return Object.keys(result).length === 0 ? void 0 : result;
}
function parseCommandCodeUsage(body) {
  const source = rec(body);
  if (source === void 0) return void 0;
  const rawRate = num(source["successRate"]);
  const successRatePercent = rawRate === void 0 ? void 0 : rawRate > 1 && rawRate <= 100 ? rawRate : rawRate >= 0 && rawRate <= 1 ? rawRate * 100 : void 0;
  const requests = num(source["totalCount"]);
  const completed = num(source["completedCount"]);
  const failed = num(source["failedCount"]);
  const cost = num(source["totalCost"]);
  const averageCost = num(source["averageCost"]);
  const tokensIn = num(source["totalTokensIn"]);
  const tokensOut = num(source["totalTokensOut"]);
  const tokens = num(source["totalTokens"]);
  const periodBasis = typeof source["periodBasis"] === "string" && source["periodBasis"].length > 0 ? source["periodBasis"] : void 0;
  const result = {
    ...requests === void 0 ? {} : { requests },
    ...completed === void 0 ? {} : { completed },
    ...failed === void 0 ? {} : { failed },
    ...cost === void 0 ? {} : { cost },
    ...averageCost === void 0 ? {} : { averageCost },
    ...successRatePercent === void 0 ? {} : { successRatePercent },
    ...tokensIn === void 0 ? {} : { tokensIn },
    ...tokensOut === void 0 ? {} : { tokensOut },
    ...tokens === void 0 ? {} : { tokens },
    ...periodBasis === void 0 ? {} : { periodBasis }
  };
  return Object.keys(result).length === 0 ? void 0 : result;
}
function parseCommandCodeAccount(creditsBody, usageBody) {
  const credits = creditsBody === void 0 ? void 0 : parseCommandCodeCredits(creditsBody);
  const usage = usageBody === void 0 ? void 0 : parseCommandCodeUsage(usageBody);
  if (credits === void 0 && usage === void 0) return void 0;
  return {
    ...credits === void 0 ? {} : { credits },
    ...usage === void 0 ? {} : { usage }
  };
}

// src/engines/protocom/commandcode-account.ts
var CACHE_TTL_MS = 6e4;
var FAILURE_BACKOFF_MS = 5e3;
var MAX_RESPONSE_BYTES2 = 1024 * 1024;
async function readJson(baseURL, path, apiKey, log, signal) {
  const url = baseURL.replace(/\/+$/, "") + path;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}`, ...attributionHeaders5() },
      ...signal === void 0 ? {} : { signal }
    });
  } catch (error) {
    log(`${COMMANDCODE.ns}: account read of ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
    return { error: `could not reach ${path}` };
  }
  if (!response.ok) return { status: response.status, error: `${path} answered ${response.status}` };
  try {
    return { body: JSON.parse(await readBoundedBytes(response, MAX_RESPONSE_BYTES2)) };
  } catch (error) {
    log(`${COMMANDCODE.ns}: account read of ${path} was unusable: ${error instanceof Error ? error.message : String(error)}`);
    return { error: `${path} did not answer usable JSON` };
  }
}
var CommandCodeAccountService = class {
  constructor(hooks) {
    this.hooks = hooks;
  }
  cache = /* @__PURE__ */ new Map();
  failedAt = /* @__PURE__ */ new Map();
  /** Forget cached reads; called when the family's settings change. */
  invalidate() {
    this.cache.clear();
    this.failedAt.delete(COMMANDCODE.ns);
  }
  /**
   * Read the account surface for one group.
   * @param group - the group whose credential authorizes the read.
   * @param signal - caller cancellation.
   * @returns the normalized account state with a per-half outcome.
   */
  async read(group2, signal) {
    const { baseURL } = this.hooks.options();
    const apiKey = await this.hooks.resolveApiKey(group2);
    const root = new URL(baseURL).origin;
    let credits;
    let usage;
    try {
      ;
      [credits, usage] = await Promise.all([
        COMMANDCODE.creditsPath === void 0 ? Promise.resolve({ error: "no credits endpoint configured" }) : readJson(root, COMMANDCODE.creditsPath, apiKey, this.hooks.log, signal),
        COMMANDCODE.usagePath === void 0 ? Promise.resolve({ error: "no usage endpoint configured" }) : readJson(root, COMMANDCODE.usagePath, apiKey, this.hooks.log, signal)
      ]);
    } catch (error) {
      if (signal?.aborted) throw new LlmError10("Command Code account read aborted by caller", "ABORTED", { cause: error });
      throw error;
    }
    const view = buildView(credits, usage);
    if (credits.status === 401 || credits.status === 403 || usage.status === 401 || usage.status === 403) {
      view.credentialRejected = true;
    }
    for (const half of [credits, usage]) {
      if (half.error !== void 0) this.hooks.log(`${COMMANDCODE.ns}: ${half.error}`);
    }
    return view;
  }
  /**
   * Read with the standard cache and failure backoff.
   * @param group - the group whose credential authorizes the read.
   * @param signal - caller cancellation.
   * @returns the cached or freshly read account state.
   */
  async readCached(group2, signal) {
    const key = group2.key;
    const hit = this.cache.get(key);
    if (hit !== void 0 && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const failed = this.failedAt.get(key);
    if (failed !== void 0 && Date.now() - failed < FAILURE_BACKOFF_MS) {
      return hit?.value ?? { credits: { reachable: false }, usage: { reachable: false } };
    }
    try {
      const value = await this.read(group2, signal);
      this.failedAt.delete(key);
      this.cache.set(key, { at: Date.now(), value });
      return value;
    } catch (error) {
      this.failedAt.set(key, Date.now());
      this.cache.delete(key);
      throw error;
    }
  }
};
function buildView(credits, usage) {
  const normalized = parseCommandCodeAccount(credits.body, usage.body);
  return {
    ...normalized === void 0 ? {} : { account: normalized },
    credits: {
      reachable: credits.error === void 0,
      ...credits.error === void 0 ? {} : { error: credits.error }
    },
    usage: {
      reachable: usage.error === void 0,
      ...usage.error === void 0 ? {} : { error: usage.error }
    }
  };
}
var JSON_HEADERS3 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function commandCodeAccountFetchHandler(service, hooks) {
  return async (request) => {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { ...JSON_HEADERS3, allow: "GET" } });
    }
    const url = new URL(request.url);
    const only = url.searchParams.get("group");
    const groups = [...hooks.options().groups.values()].filter((group2) => group2.enabled);
    const selected = only === null ? groups : groups.filter((group2) => group2.key === only);
    if (selected.length === 0) {
      return new Response(JSON.stringify({ account: null, credits: { reachable: false }, usage: { reachable: false } }), {
        status: 200,
        headers: JSON_HEADERS3
      });
    }
    try {
      const view = await service.readCached(selected[0], request.signal);
      return new Response(JSON.stringify(view), { status: 200, headers: JSON_HEADERS3 });
    } catch (error) {
      hooks.log(`${COMMANDCODE.ns}: account read failed: ${error instanceof Error ? error.message : String(error)}`);
      return new Response(JSON.stringify({
        account: null,
        credits: { reachable: false, error: "account read failed" },
        usage: { reachable: false, error: "account read failed" }
      }), { status: 502, headers: JSON_HEADERS3 });
    }
  };
}

// src/engines/protocom/fusion-host.ts
import { ReasoningEffortId as ReasoningEffortId2 } from "@deepseek-ai/dsh-llm";

// src/engines/protocom/fusion.ts
var FUSION_NS = "model-fusion";
function resolveEffort(name2, raw) {
  if (raw === void 0) return void 0;
  if (raw.length === 0 || raw.trim() !== raw) {
    throw new Error(`${FUSION_NS}: the ${name2} seat reasoningEffort must be a non-empty effort id`);
  }
  return raw;
}
function resolveFusionSeat(name2, seat) {
  const provider = seat?.provider ?? "";
  const model = seat?.model ?? "";
  const effort = resolveEffort(name2, seat?.reasoningEffort);
  if (provider === "" && model === "" && effort === void 0) return void 0;
  if (provider === "" || model === "") {
    throw new Error(`${FUSION_NS}: the ${name2} seat needs both a provider and a model`);
  }
  return { provider, model, ...effort === void 0 ? {} : { reasoningEffort: effort } };
}
function resolveFusion(config) {
  const enabled = config.enabled ?? false;
  const leader = resolveFusionSeat("leader", config.leader);
  const coder = resolveFusionSeat("coder", config.coder);
  if (enabled && leader === void 0) throw new Error(`${FUSION_NS}: enabled Fusion requires a leader seat`);
  if (enabled && coder === void 0) throw new Error(`${FUSION_NS}: enabled Fusion requires a coder seat`);
  return {
    enabled,
    ...leader === void 0 ? {} : { leader },
    ...coder === void 0 ? {} : { coder },
    includeForks: config.includeForks ?? true,
    applyLeader: config.applyLeader ?? true
  };
}
function sameFusionSeat(left, right) {
  if (left === void 0 || right === void 0) return left === right;
  return left.provider === right.provider && left.model === right.model && (left.reasoningEffort ?? void 0) === (right.reasoningEffort ?? void 0);
}

// src/engines/protocom/fusion-host.ts
function subagentFacts(session) {
  return { origin: session?.header?.origin, isSeeded: session?.header?.isSeeded ?? false };
}
function fuseCallConfig(resolved, fusion, facts) {
  if (!fusion.enabled) return resolved;
  if (facts.origin !== "subagent") return resolved;
  if (facts.isSeeded && !fusion.includeForks) return resolved;
  const coder = fusion.coder;
  if (coder === void 0) return resolved;
  const effort = coder.reasoningEffort === void 0 ? void 0 : ReasoningEffortId2(coder.reasoningEffort);
  if (resolved.provider === coder.provider && resolved.model === coder.model && resolved.reasoningEffort === effort) return resolved;
  const { reasoningEffort: _inherited, ...rest } = resolved;
  return {
    ...rest,
    provider: coder.provider,
    model: coder.model,
    ...effort === void 0 ? {} : { reasoningEffort: effort }
  };
}
function mountFusion(ctx, read2) {
  const source = () => read2();
  let lastRaw;
  let lastGood;
  const current = () => {
    const raw = source();
    if (raw === lastRaw && lastGood !== void 0) return lastGood;
    try {
      const next = resolveFusion(raw);
      lastRaw = raw;
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === void 0) throw error;
      lastRaw = raw;
      ctx.logger.error(`${FUSION_NS}: keeping the last good configuration after an invalid settings section`);
      ctx.logger.error(error);
      return lastGood;
    }
  };
  current();
  ctx.on("agent/request", async ({ agent }, next) => {
    const resolved = await next();
    return fuseCallConfig(resolved, current(), subagentFacts(agent.session));
  }, { global: true, prepend: true });
  ctx.on("loader/volatile-update", () => {
    try {
      resolveFusion(source());
    } catch (error) {
      ctx.logger.error(`${FUSION_NS}: the fusion section is not usable`);
      ctx.logger.error(error);
    }
  });
  return { current, raw: () => source() };
}

// src/engines/protocom/index.ts
var name = "protocom-api";
var inject = ["llm"];
function mountFamily(ctx, family, sectionKey, section, telemetry) {
  const ns = family.ns;
  const current = () => section();
  let lastRaw;
  let lastGood;
  const options = () => {
    const raw = current();
    if (raw === lastRaw && lastGood !== void 0) return lastGood;
    try {
      const next = resolveAdapterOptions(raw, family);
      lastRaw = raw;
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === void 0) throw error;
      lastRaw = raw;
      ctx.logger.error(`${ns}: keeping the last good configuration after an invalid settings section`);
      ctx.logger.error(error);
      return lastGood;
    }
  };
  options();
  const resolveRef = async (ref, provider) => {
    if (!family.credentialRef.test(ref)) {
      throw new LlmError11(`${ns}: credential reference "${describeRejectedRef(ref)}" is outside this family's credential namespace`, "MISSING_CREDENTIAL");
    }
    const usable = (value) => {
      const shape = describePathShapedSecret(value);
      if (shape !== void 0) {
        throw new LlmError11(
          `${ns}: the value stored for ${ref} is ${shape}, not an API key. Paste the key itself -- the text you copy from the provider -- rather than the file it was saved in.`,
          "INVALID_CREDENTIAL"
        );
      }
      return assertUsableApiKey(value, "dsh-protocom-api", ref);
    };
    const credentials = ctx.get("credentials");
    if (credentials !== void 0) {
      const hit = await credentials.resolve(ref);
      if (hit?.value !== void 0) return usable(hit.value);
    }
    const ambient = process.env[ref];
    if (ambient !== void 0 && ambient.length > 0) {
      return usable(ambient);
    }
    throw new LlmError11(
      `${ns}: no API key for provider route "${provider}"; store ${ref} through the credentials service, or export ${ref} in the launching environment`,
      "MISSING_CREDENTIAL"
    );
  };
  const pools = /* @__PURE__ */ new Map();
  const ordinal = { count: 0 };
  const poolFor = (group2) => {
    const refs = group2.apiKeyRefs;
    const signature = `${group2.keyPolicy}\0${refs.join("\0")}`;
    let entry = pools.get(group2.key);
    if (entry === void 0) {
      entry = { pool: new KeyPool(refs.length, group2.keyPolicy), signature };
      pools.set(group2.key, entry);
    } else if (entry.signature !== signature) {
      entry.pool.reconfigure(refs.length, group2.keyPolicy);
      entry.signature = signature;
    }
    return entry.pool;
  };
  const resolveApiKey = async (group2, sessionId) => {
    const refs = group2.apiKeyRefs;
    if (refs.length === 0) {
      throw new LlmError11(
        `${ns}: no API key configured for provider route "${group2.provider}"; set groups.${group2.key}.apiKey in the "${ns}" settings section to a credential reference`,
        "MISSING_CREDENTIAL"
      );
    }
    const ref = refs.length === 1 ? refs[0] : (() => {
      ordinal.count += 1;
      const index = poolFor(group2).select({ ...sessionId === void 0 ? {} : { sessionId }, ordinal: ordinal.count });
      return refs[index ?? 0];
    })();
    return await resolveRef(ref, group2.provider);
  };
  const reportKeyFailure = (group2, sessionId) => {
    if (group2.apiKeyRefs.length < 2) return;
    const pool = poolFor(group2);
    const failing = pool.lastIndexFor(sessionId);
    if (failing !== void 0) pool.markFailed(failing);
  };
  const adapter = new ProtocomAdapter({
    options,
    resolveApiKey,
    reportKeyFailure,
    log: (message) => {
      ctx.logger.warn(message);
    },
    // Optional seam, like credentials: a deployment without the attachment
    // service still runs, it just refuses image input instead of dropping it.
    resolveAttachments: () => ctx.get("attachments")
  });
  const quota = telemetry({ options, resolveApiKey, log: (message) => {
    ctx.logger.warn(message);
  } });
  let syncRoutes = () => {
  };
  ctx.effect(() => {
    const directory = ctx.llm.registerConfigurableProviders(family.keys.map((key) => ({
      provider: family.providerOf(key),
      displayName: family.defaults[key]?.displayName ?? key,
      // 1.7 addresses settings by Loader entry id, so every family in this
      // plugin names the SAME namespace and distinguishes itself by the path
      // prefix into the shared Config.
      settingsNs: PROTOCOM_NS,
      settingsPath: [sectionKey, "groups", key]
    })));
    const discovery = ctx.llm.registerModelDiscovery(ns, (request, signal) => family.listingIsMembership === false ? Promise.resolve(registryDiscovery(family)) : discoverModels(request, signal, {
      baseURL: () => options().baseURL,
      resolveApiKey: async (provider) => {
        const group2 = [...options().groups.values()].find((candidate) => candidate.provider === provider);
        if (group2 === void 0) return void 0;
        if (!group2.enabled) {
          throw new Error(
            `${ns}: group "${group2.key}" is disabled; toggle it on in the "${ns}" settings section before discovering models`
          );
        }
        return await resolveApiKey(group2);
      }
    }));
    let registration;
    const sync = () => {
      const routes = [...options().groups.values()].filter((group2) => group2.enabled).map((group2) => group2.provider);
      if (registration === void 0) {
        if (routes.length === 0) return;
        registration = ctx.llm.registerAdapter(routes, adapter);
      } else {
        registration.replace(routes);
      }
    };
    syncRoutes = sync;
    sync();
    return () => {
      syncRoutes = () => {
      };
      registration?.();
      directory();
      discovery();
    };
  });
  ctx.on("loader/volatile-update", () => {
    syncRoutes();
    adapter.invalidateListings();
    quota.invalidate();
  });
  quota.mount(ctx);
}
function protocomTelemetry(hooks) {
  const balance = new BalanceService({ options: hooks.options, resolveApiKey: hooks.resolveApiKey });
  return {
    invalidate: () => {
      balance.invalidate();
    },
    mount: (ctx) => {
      ctx.inject(["connection"], (connectionCtx) => {
        const connection = Reflect.get(connectionCtx, "connection");
        if (connection === void 0) return;
        const path = PROTOCOM.telemetryPath;
        if (path === void 0) return;
        connectionCtx.effect(() => connection.fetch.register({
          path,
          methods: ["GET"],
          requestBody: "buffered",
          fetch: balanceFetchHandler(balance, {
            options: hooks.options,
            resolveApiKey: hooks.resolveApiKey,
            log: hooks.log
          })
        }));
      });
    }
  };
}
function goTelemetry(hooks) {
  const usage = new GoUsageService({ options: hooks.options, resolveApiKey: hooks.resolveApiKey });
  return {
    invalidate: () => {
      usage.invalidate();
    },
    mount: (ctx) => {
      ctx.inject(["connection"], (connectionCtx) => {
        const connection = Reflect.get(connectionCtx, "connection");
        if (connection === void 0) return;
        const path = OPENCODE_GO.telemetryPath;
        if (path === void 0) return;
        connectionCtx.effect(() => connection.fetch.register({
          path,
          methods: ["GET"],
          requestBody: "buffered",
          fetch: goUsageFetchHandler(usage, {
            options: hooks.options,
            resolveApiKey: hooks.resolveApiKey,
            log: hooks.log
          })
        }));
      });
    }
  };
}
function commandCodeTelemetry(hooks) {
  const account = new CommandCodeAccountService({
    options: hooks.options,
    resolveApiKey: (group2) => hooks.resolveApiKey(group2),
    log: hooks.log
  });
  return {
    invalidate: () => {
      account.invalidate();
    },
    mount: (ctx) => {
      ctx.inject(["connection"], (connectionCtx) => {
        const connection = Reflect.get(connectionCtx, "connection");
        if (connection === void 0) return;
        const path = COMMANDCODE.telemetryPath;
        if (path === void 0) return;
        connectionCtx.effect(() => connection.fetch.register({
          path,
          methods: ["GET"],
          requestBody: "buffered",
          fetch: commandCodeAccountFetchHandler(account, {
            options: hooks.options,
            resolveApiKey: (group2) => hooks.resolveApiKey(group2),
            log: hooks.log
          })
        }));
      });
    }
  };
}
function registryDiscovery(family) {
  const refused = new Set(family.refused);
  return family.registry.filter((entry) => family.keys.some((key) => entry.groups?.includes(key) === true)).filter((entry) => !refused.has(entry.id)).map((entry) => ({
    id: entry.id,
    name: entry.displayName,
    contextWindow: entry.contextWindow
  }));
}
function noTelemetry() {
  return { invalidate: () => {
  }, mount: () => {
  } };
}
var PROTOCOM_NS = PROTOCOM.ns;
function apply(ctx, config) {
  mountFamily(ctx, PROTOCOM, "protocom", () => config.protocom.get(), protocomTelemetry);
  mountFamily(ctx, OPENCODE_GO, "opencodeGo", () => config.opencodeGo.get(), goTelemetry);
  mountFamily(ctx, COMMANDCODE, "commandcode", () => config.commandcode.get(), commandCodeTelemetry);
  mountFamily(ctx, CLINEPASS, "clinepass", () => config.clinepass.get(), noTelemetry);
  mountFusion(ctx, () => config.fusion.get());
}
export {
  ANTHROPIC_VERSION,
  BalanceService,
  CONTEXT_100K,
  CONTEXT_LADDER,
  Config,
  DEFAULT_BASE_URL,
  DEFAULT_BASE_URL_ORIGIN,
  DEFAULT_MAX_TOKENS,
  DEFAULT_RECOMMENDED,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  FALLBACK_CONTEXT_WINDOW,
  FAMILIES,
  FUSION_NS,
  FusionSection,
  GO_CREDENTIAL_REF,
  GO_DEFAULT_BASE_URL,
  GO_DEFAULT_BASE_URL_ORIGIN,
  GO_DEFAULT_RECOMMENDED,
  GO_REFUSED_MODEL_IDS,
  GO_REGISTRY,
  GROUP_DEFAULTS,
  GROUP_KEYS,
  GoSection,
  GoUsageService,
  MAX_RETRY_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  OPENCODE_GO,
  PROTOCOM,
  PROTOCOM_CREDENTIAL_REF,
  PROTOCOM_NS,
  ProtocomAdapter,
  ProtocomSection,
  REFUSED_CHAT_MODEL_IDS,
  REGISTRY,
  RETRYABLE_FAILURE_CODES,
  RETRY_INITIAL_DELAY_MS,
  RETRY_JITTER_RATIO,
  ThinkTagExtractor,
  acceptsImages,
  apply,
  balanceFetchHandler,
  catalogEntry,
  contextChoicesFor,
  contextLabel,
  contextStepsFor,
  contextVariantsFor,
  decodeVariantId,
  discoverModels,
  displayNameWithContext,
  encodeVariantId,
  endpointOrigin,
  fetchUpstreamModels,
  fuseCallConfig,
  goUsageFetchHandler,
  groupCatalog,
  groupOf,
  identityKey,
  inject,
  mapMessageUsage,
  mapStopReason,
  matchRegistry,
  messagesConnection,
  modelIdentities,
  mountFusion,
  name,
  normalizeUsage,
  parseBalanceView,
  parseGoUsage,
  parseModelsListing,
  parseRateMultiplier,
  parseUsage,
  providerOf,
  resolveAdapterOptions,
  resolveBaseURL,
  resolveFusion,
  resolveFusionSeat,
  resolveMessagesThinking,
  retryBudgetSpanMs,
  retryPolicyFor,
  sameFusionSeat,
  serializeMessagesRequest,
  servesChat,
  servesGroup,
  streamMessages,
  stripVariantId,
  subagentFacts,
  translateMessages,
  variantLengths
};
