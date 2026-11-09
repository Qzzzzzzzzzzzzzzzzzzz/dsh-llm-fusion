window.__ModuleLoader__.load({ id: "dsh-llm-fusion", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply3,
  inject: () => inject3
});
module.exports = __toCommonJS(index_exports);

// src/engines/opencode-go/contracts.ts
var PROVIDER_ID = "dsh-opencode-go";
var FREE_PROVIDER_ID = "dsh-opencode-free";
function modelSettingsKey(model) {
  return model.source === "free" ? `${FREE_PROVIDER_ID}/${model.id}` : model.id;
}
function assertProxyURL(raw) {
  const value = raw?.trim() ?? "";
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OpenCode Go: proxy address must be a valid URL");
  }
  if (!["http:", "https:", "socks5:"].includes(url.protocol)) {
    throw new Error("OpenCode Go: proxy address must use http://, https:// or socks5://");
  }
  if (!url.hostname || url.port === "0" || url.pathname !== "" && url.pathname !== "/" || url.search || url.hash) {
    throw new Error("OpenCode Go: proxy address must contain a host and optional port, without a path, query or fragment");
  }
  try {
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    throw new Error("OpenCode Go: proxy credentials contain invalid URL encoding");
  }
  return url.href;
}
var USAGE_DISPLAY_MODES = ["auto", "always", "off"];
var DEFAULT_USAGE_DISPLAY = "auto";
var USAGE_PILL_STYLES = ["badge", "plain"];
var DEFAULT_USAGE_PILL_STYLE = "badge";
var MAX_ACCOUNTS = 20;
var DEFAULT_ACCOUNT_REF = "OPENCODE_API_KEY";
var ACCOUNT_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
function accountRefOf(settings) {
  return settings.apiKeyEnv || DEFAULT_ACCOUNT_REF;
}
function moveAccountFirst(accounts, ref) {
  const index = accounts.findIndex((account) => account.apiKeyEnv === ref);
  return index <= 0 ? accounts : [accounts[index], ...accounts.slice(0, index), ...accounts.slice(index + 1)];
}
function accountsOf(settings) {
  const ref = accountRefOf(settings);
  if (settings.accounts?.length === 0) return [];
  const accounts = settings.accounts ?? [];
  return accounts.some((account) => account.apiKeyEnv === ref) ? moveAccountFirst(accounts, ref) : [
    { id: `legacy:${ref}`, name: "", apiKeyEnv: ref },
    ...accounts
  ];
}
var PROFILE_ENTRY_ID = "opencode-go";
var INPUT_MODALITIES = ["text", "image", "audio", "video", "pdf"];
function normalizeInputModalities(value) {
  if (!Array.isArray(value)) return void 0;
  const declared = new Set(value.filter((item) => typeof item === "string").map((item) => item.trim().toLowerCase().split(";")[0]).map((item) => item.startsWith("image/") ? "image" : item.startsWith("audio/") ? "audio" : item.startsWith("video/") ? "video" : item === "application/pdf" ? "pdf" : item.startsWith("text/") ? "text" : item));
  const ordered = INPUT_MODALITIES.filter((modality) => declared.has(modality));
  return ordered.length === 0 ? void 0 : ordered;
}
function isModelEnabled(model, modelVisibility) {
  if (model.configurationMissing) return false;
  const key = modelSettingsKey(model);
  const enabled = modelVisibility && Object.hasOwn(modelVisibility, key) ? modelVisibility[key] : void 0;
  return typeof enabled === "boolean" ? enabled : !model.deprecated;
}
function validReleaseDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function isNewModel(model, now = Date.now()) {
  if (model.deprecated || !validReleaseDate(model.releaseDate)) return false;
  const days = Math.floor(now / 864e5) - Date.parse(model.releaseDate) / 864e5;
  return days >= 0 && days < 7;
}
function sortModels(models, now = Date.now()) {
  const rank = (model) => model.deprecated ? 2 : isNewModel(model, now) ? 0 : 1;
  return [...models].sort((a, b) => rank(a) - rank(b) || (isNewModel(a, now) && isNewModel(b, now) ? b.releaseDate.localeCompare(a.releaseDate) : 0));
}
function parseGoModels(value) {
  if (!Array.isArray(value)) throw new Error("Invalid OpenCode Go model list");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid OpenCode Go model");
    const row = entry;
    if (typeof row.id !== "string" || !row.id) throw new Error("Missing OpenCode Go model id");
    const model = { id: row.id };
    if (row.source !== void 0) {
      if (row.source !== "go" && row.source !== "free") throw new Error("Invalid OpenCode model source");
      model.source = row.source;
    }
    if (typeof row.name === "string") model.name = row.name;
    for (const key of ["contextWindow", "maxTokens"]) {
      if (typeof row[key] === "number" && Number.isSafeInteger(row[key]) && row[key] > 0) model[key] = row[key];
    }
    if (row.reasoningBudget !== null && typeof row.reasoningBudget === "object") {
      const { min, max } = row.reasoningBudget;
      if (typeof min === "number" && Number.isSafeInteger(min) && min > 0 && typeof max === "number" && Number.isSafeInteger(max) && max >= min) model.reasoningBudget = { min, max };
    }
    if (typeof row.deprecated === "boolean") model.deprecated = row.deprecated;
    if (typeof row.configurationMissing === "boolean") model.configurationMissing = row.configurationMissing;
    if (validReleaseDate(row.releaseDate)) model.releaseDate = row.releaseDate;
    const modalities = normalizeInputModalities(row.inputModalities);
    if (modalities !== void 0) model.inputModalities = modalities;
    return model;
  });
}
function parseGoModelCatalog(value) {
  if (!value || typeof value !== "object") throw new Error("Invalid OpenCode Go model catalog");
  const catalog = value;
  if (typeof catalog.stale !== "boolean" || catalog.error !== void 0 && typeof catalog.error !== "string") {
    throw new Error("Invalid OpenCode Go model catalog status");
  }
  return {
    models: parseGoModels(catalog.models),
    stale: catalog.stale,
    ...catalog.error === void 0 ? {} : { error: catalog.error },
    ...catalog.sources === void 0 ? {} : { sources: parseSources(catalog.sources) }
  };
}
function parseSources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid OpenCode Go catalog sources");
  const sources = value;
  const parse = (value2) => {
    if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) throw new Error("Invalid OpenCode Go catalog source status");
    const source = value2;
    if (source.updatedAt !== void 0 && (typeof source.updatedAt !== "number" || !Number.isSafeInteger(source.updatedAt) || source.updatedAt < 0 || source.updatedAt > 864e13)) {
      throw new Error("Invalid OpenCode Go catalog source timestamp");
    }
    if (source.error !== void 0 && typeof source.error !== "string") throw new Error("Invalid OpenCode Go catalog source error");
    if (source.warning !== void 0 && typeof source.warning !== "string") throw new Error("Invalid OpenCode Go catalog source warning");
    return {
      ...source.updatedAt === void 0 ? {} : { updatedAt: source.updatedAt },
      ...source.error === void 0 ? {} : { error: source.error },
      ...source.warning === void 0 ? {} : { warning: source.warning }
    };
  };
  return { go: parse(sources.go), free: parse(sources.free) };
}
var codec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#GoModelCatalog",
  schema: { parse: parseGoModelCatalog },
  create: () => ({ parse: parseGoModelCatalog })
};
var modelsRemote = {
  package: "dsh-opencode-go",
  descriptors: [{
    id: "dsh-opencode-go#opencodeGoModels/read",
    service: "opencodeGoModels",
    namespace: "opencodeGoModels",
    method: "read",
    invocation: { kind: "direct" },
    parameters: [],
    result: codec
  }]
};
function parseAccountSwitch(value) {
  const notice = value;
  if (!notice || typeof notice.fromRef !== "string" || typeof notice.toRef !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(notice.fromRef) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(notice.toRef) || notice.reason !== "quota" && notice.reason !== "credential" || typeof notice.at !== "number" || !Number.isSafeInteger(notice.at) || notice.at < 0 || notice.at > 864e13) throw new Error("Invalid account switch notice");
  return { fromRef: notice.fromRef, toRef: notice.toRef, reason: notice.reason, at: notice.at };
}
function parseGoUsage(value) {
  if (!value || typeof value !== "object") throw new Error("Invalid OpenCode Go usage response");
  const source = value;
  const result = {};
  if (source.source !== void 0) {
    if (typeof source.source !== "string" || source.source.length === 0 || source.source.length > 128) {
      throw new Error("Invalid OpenCode Go usage source");
    }
    result.source = source.source;
  }
  if (source.lastSwitch !== void 0) {
    result.lastSwitch = parseAccountSwitch(source.lastSwitch);
  }
  for (const key of ["rolling", "weekly", "monthly"]) {
    const row = source[key];
    if (!row || row.status !== "ok" && row.status !== "rate-limited" || typeof row.percent !== "number" || !Number.isFinite(row.percent) || row.percent < 0 || row.percent > 100 || typeof row.resetsAt !== "string" || !Number.isFinite(Date.parse(row.resetsAt))) {
      throw new Error("Invalid OpenCode Go usage response");
    }
    result[key] = { status: row.status, percent: row.percent, resetsAt: row.resetsAt };
  }
  return result;
}
var usageCodec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#GoUsage",
  schema: { parse: parseGoUsage },
  create: () => ({ parse: parseGoUsage })
};
var parseRef = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("Invalid account reference");
  return value;
};
var refCodec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#AccountRef",
  schema: { parse: parseRef },
  create: () => ({ parse: parseRef })
};
var usageRemote = {
  package: "dsh-opencode-go",
  descriptors: [{
    id: "dsh-opencode-go#opencodeGoUsage/read",
    service: "opencodeGoUsage",
    namespace: "opencodeGoUsage",
    method: "read",
    invocation: { kind: "direct" },
    parameters: [],
    result: usageCodec
  }, {
    id: "dsh-opencode-go#opencodeGoUsage/readAccount",
    service: "opencodeGoUsage",
    namespace: "opencodeGoUsage",
    method: "readAccount",
    invocation: { kind: "direct" },
    parameters: [{ name: "ref", wire: "ref", source: "json", codec: refCodec }],
    result: usageCodec
  }]
};
function parseAccountCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid account command");
  const row = value;
  const fields = {
    add: ["kind", "id", "name", "key"],
    remove: ["kind", "ref"],
    select: ["kind", "ref"],
    rename: ["kind", "ref", "name"],
    "replace-key": ["kind", "ref", "key"],
    move: ["kind", "ref", "toIndex"],
    "auto-switch": ["kind", "value"]
  };
  if (typeof row.kind !== "string" || !Object.hasOwn(fields, row.kind) || Object.keys(row).some((key) => !fields[row.kind].includes(key)) || fields[row.kind].some((key) => !Object.hasOwn(row, key))) throw new Error("Invalid account command");
  if ("ref" in row && (typeof row.ref !== "string" || !ACCOUNT_REF_PATTERN.test(row.ref))) throw new Error("Invalid account reference");
  if ("name" in row && (typeof row.name !== "string" || !row.name.trim() || row.name.trim().length > 80)) throw new Error("Invalid account name");
  if ("key" in row && (typeof row.key !== "string" || !row.key.trim())) throw new Error("Missing account credential");
  if (row.kind === "add" && (typeof row.id !== "string" || !/^[a-f0-9]{32}$/.test(row.id))) throw new Error("Invalid account operation ID");
  if (row.kind === "move" && (!Number.isInteger(row.toIndex) || row.toIndex < 0)) throw new Error("Invalid account position");
  if (row.kind === "auto-switch" && typeof row.value !== "boolean") throw new Error("Invalid account switch");
  return { ...row };
}
function parseResult(value) {
  if (value !== "applied" && value !== "rejected" && value !== "unknown") throw new Error("Invalid account command result");
  return value;
}
var commandCodec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#AccountCommand",
  schema: { parse: parseAccountCommand },
  create: () => ({ parse: parseAccountCommand })
};
var resultCodec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#AccountCommandResult",
  schema: { parse: parseResult },
  create: () => ({ parse: parseResult })
};
var accountsRemote = {
  package: "dsh-opencode-go",
  descriptors: [{
    id: "dsh-opencode-go#opencodeGoAccounts/execute",
    service: "opencodeGoAccounts",
    namespace: "opencodeGoAccounts",
    method: "execute",
    invocation: { kind: "direct" },
    parameters: [{ name: "command", wire: "command", source: "json", codec: commandCodec }],
    result: resultCodec
  }]
};
var ANALYTICS_RANGES = ["today", "7d", "30d", "90d"];
var ANALYTICS_TOTAL_FIELDS = [
  "requests",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWrite5mTokens",
  "cacheWrite1hTokens",
  "cacheWriteTokens",
  "tokens",
  "costMicroCents"
];
function object(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid analytics " + field);
  return value;
}
function integer(value, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 864e13) {
    throw new Error("Invalid analytics " + field);
  }
  return value;
}
function text(value, field, max = 128) {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid analytics " + field);
  }
  return value;
}
function parseAnalyticsQuery(value) {
  const row = object(value, "query");
  const accountRef = parseRef(row.accountRef);
  if (!ANALYTICS_RANGES.includes(row.range)) throw new Error("Invalid analytics range");
  if (row.refresh !== void 0 && typeof row.refresh !== "boolean") throw new Error("Invalid analytics refresh");
  return { accountRef, range: row.range, ...row.refresh === void 0 ? {} : { refresh: row.refresh } };
}
function analyticsTotals(value) {
  const row = object(value, "totals");
  const totals = {};
  for (const field of ANALYTICS_TOTAL_FIELDS) {
    if (typeof row[field] !== "string" || !/^(?:0|[1-9]\d*)$/.test(row[field])) {
      throw new Error("Invalid analytics " + field);
    }
    totals[field] = row[field];
  }
  return totals;
}
function parseAnalyticsReport(value) {
  const row = object(value, "report");
  const range = object(row.range, "range");
  const from = integer(range.from, "range.from"), to = integer(range.to, "range.to");
  if (from > to || row.timeZone !== "UTC" || !ANALYTICS_RANGES.includes(row.period) || !Array.isArray(row.byModel) || !Array.isArray(row.byDay)) {
    throw new Error("Invalid analytics report");
  }
  return {
    accountRef: parseRef(row.accountRef),
    source: text(row.source, "source"),
    generatedAt: integer(row.generatedAt, "generatedAt"),
    period: row.period,
    range: { from, to },
    timeZone: "UTC",
    totals: analyticsTotals(row.totals),
    byModel: row.byModel.map((value2) => {
      const model = object(value2, "model");
      return { provider: text(model.provider, "provider", 1024), model: text(model.model, "model", 1024), ...analyticsTotals(model) };
    }),
    byDay: row.byDay.map((value2) => {
      const day = object(value2, "day");
      if (!validReleaseDate(day.day)) throw new Error("Invalid analytics day");
      return { day: day.day, ...analyticsTotals(day) };
    })
  };
}
function parseAnalyticsExport(value) {
  const row = object(value, "export");
  const filename = text(row.filename, "filename", 256);
  if (!/^[A-Za-z0-9_.-]+\.csv$/.test(filename) || typeof row.csv !== "string") throw new Error("Invalid analytics export");
  return { filename, csv: row.csv };
}
var queryCodec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#AnalyticsQuery",
  schema: { parse: parseAnalyticsQuery },
  create: () => ({ parse: parseAnalyticsQuery })
};
var reportCodec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#AnalyticsReport",
  schema: { parse: parseAnalyticsReport },
  create: () => ({ parse: parseAnalyticsReport })
};
var exportCodec = {
  mode: "strict",
  typeSymbol: "dsh-opencode-go#AnalyticsExport",
  schema: { parse: parseAnalyticsExport },
  create: () => ({ parse: parseAnalyticsExport })
};
var analyticsRemote = {
  package: "dsh-opencode-go",
  descriptors: [{
    id: "dsh-opencode-go#opencodeGoAnalytics/read",
    service: "opencodeGoAnalytics",
    namespace: "opencodeGoAnalytics",
    method: "read",
    invocation: { kind: "direct" },
    parameters: [{ name: "query", wire: "query", source: "json", codec: queryCodec }],
    cancellation: { parameter: "signal" },
    result: reportCodec
  }, {
    id: "dsh-opencode-go#opencodeGoAnalytics/exportCsv",
    service: "opencodeGoAnalytics",
    namespace: "opencodeGoAnalytics",
    method: "exportCsv",
    invocation: { kind: "direct" },
    parameters: [{ name: "query", wire: "query", source: "json", codec: queryCodec }],
    cancellation: { parameter: "signal" },
    result: exportCodec
  }]
};
var goRemote = {
  package: "dsh-opencode-go",
  descriptors: [...usageRemote.descriptors, ...modelsRemote.descriptors, ...accountsRemote.descriptors, ...analyticsRemote.descriptors]
};
var DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
var DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
var DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;

// plugin-css:src/engines/opencode-go/client/Section.module.css
var id = "dsh-llm-fusion/Section.module.css";
if (!document.querySelector("style[data-plugin-css=" + JSON.stringify(id) + "]")) {
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-llm-fusion";
  style.dataset.pluginCss = id;
  style.textContent = '._2hXyvq_accounts{gap:10px;margin:8px 0;padding:6px 0;display:grid}._2hXyvq_accountRow{border:1px solid var(--go-border);background:var(--go-surface);border-radius:10px;position:relative}._2hXyvq_accountRow[data-dragging=true]{opacity:.55}._2hXyvq_accountMain{grid-template-columns:16px minmax(90px,1fr) 84px minmax(48px,1fr) 38px 100px 14px;align-items:center;gap:10px;padding:14px 12px;display:grid}._2hXyvq_accountHandle{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);cursor:grab;-webkit-user-drag:element;background:0 0;border:0;place-items:center;padding:0;display:grid}._2hXyvq_accountHandle:disabled{cursor:default;opacity:.5}._2hXyvq_accountHandle:focus-visible,._2hXyvq_accountToggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}._2hXyvq_accountName{white-space:nowrap;text-overflow:ellipsis;min-width:0;color:var(--go-text);font-size:13px;font-weight:500;overflow:hidden}._2hXyvq_accountState{min-width:0;color:var(--dsw-alias-label-tertiary);align-items:center;gap:5px;font-size:11.5px;display:inline-flex;overflow:hidden}._2hXyvq_accountDot{background:var(--go-success);border-radius:50%;flex:none;width:6px;height:6px}._2hXyvq_accountDot[data-off=true]{background:var(--go-warning)}._2hXyvq_accountPercent{text-align:right;font-family:var(--go-number-font);font-variant-numeric:tabular-nums;color:var(--go-text);font-size:12px;font-weight:500}._2hXyvq_accountBar{background:var(--go-surface-2);border-radius:99px;height:6px;position:relative;overflow:hidden}._2hXyvq_accountBarFill{background:var(--go-accent);border-radius:99px;position:absolute;inset:0 auto 0 0}._2hXyvq_accountBar[data-level=high] ._2hXyvq_accountBarFill{background:var(--go-warning)}._2hXyvq_accountBar[data-level=limited] ._2hXyvq_accountBarFill{background:var(--go-danger)}._2hXyvq_accountBarTick{background:var(--go-surface);width:1px;position:absolute;top:0;bottom:0}._2hXyvq_accountReset{text-align:right;color:var(--dsw-alias-label-tertiary);font-size:11.5px}._2hXyvq_accountIdle{text-align:right;color:var(--dsw-alias-label-tertiary);grid-column:4/7;font-size:11.5px;line-height:1.5}._2hXyvq_accountToggle{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;place-items:center;padding:0;display:grid}._2hXyvq_accountProblems{align-items:baseline;gap:8px;padding:0 11px 9px 36px;display:flex}._2hXyvq_accountRetry{font:inherit;color:var(--dsw-alias-brand-primary);cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-size:11.5px;line-height:1.5}._2hXyvq_accountRetry:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}._2hXyvq_accountHandle:active{cursor:grabbing}._2hXyvq_accountDetail{border-top:1px solid var(--go-border);flex-direction:column;gap:10px;padding:16px 12px 16px 38px;display:flex}._2hXyvq_accountRow:after{content:"";background:var(--dsw-alias-brand-primary);opacity:0;pointer-events:none;border-radius:2px;height:2px;position:absolute;left:0;right:0}._2hXyvq_accountRow[data-drop=before]:after{opacity:1;top:-6px}._2hXyvq_accountRow[data-drop=after]:after{opacity:1;bottom:-6px}._2hXyvq_accountUsage{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;font-size:12px;display:grid}._2hXyvq_accountUsage progress{appearance:none;background:var(--go-surface-2);--go-progress:var(--go-accent);width:100%;height:5px;accent-color:var(--go-progress);border:0;border-radius:99px;margin:8px 0;display:block;overflow:hidden}._2hXyvq_accountUsage progress::-webkit-progress-bar{background:var(--go-surface-2)}._2hXyvq_accountUsage progress::-webkit-progress-value{background:var(--go-progress);border-radius:99px}._2hXyvq_accountUsage progress::-moz-progress-bar{background:var(--go-progress);border-radius:99px}._2hXyvq_accountUsage progress[data-level=high]{--go-progress:var(--go-warning)}._2hXyvq_accountUsage progress[data-level=limited]{--go-progress:var(--go-danger)}._2hXyvq_accountUsage ._2hXyvq_hint{overflow-wrap:anywhere;display:block}._2hXyvq_accountActions{flex-wrap:wrap;gap:8px;margin-top:10px;display:flex}._2hXyvq_addAccount{align-self:flex-start;min-height:32px}._2hXyvq_accountEditor{border:.5px solid var(--dsw-alias-border-l2);background:var(--go-surface-2);border-radius:10px;flex-direction:column;gap:8px;margin:0 11px 10px 36px;padding:10px 12px;display:flex}._2hXyvq_accountEditorHead{align-items:baseline;gap:6px;min-width:0;display:flex}._2hXyvq_accountEditorTitle{color:var(--dsw-alias-label-primary);flex:none;font-size:12.5px;font-weight:600;line-height:1.5}._2hXyvq_accountEditorFor{min-width:0;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;font-size:11.5px;line-height:1.5}._2hXyvq_accountField{color:var(--dsw-alias-label-tertiary);flex-direction:column;gap:5px;font-size:11.5px;line-height:1.5;display:flex}._2hXyvq_accountEditorActions{align-items:center;gap:8px;margin-top:2px;display:flex}@media (width<=480px){._2hXyvq_accountUsage{grid-template-columns:1fr}}._2hXyvq_page{--dsw-alias-label-primary:var(--go-text);--dsw-alias-label-secondary:var(--go-muted);--dsw-alias-label-tertiary:var(--go-muted);--dsw-alias-label-primary-foreground:var(--go-on-accent);--dsw-alias-label-error:var(--go-danger);--dsw-alias-label-warning:var(--go-warning);--dsw-alias-label-success:var(--go-success);--dsw-alias-brand-primary:var(--go-accent);--dsw-alias-state-business-primary:var(--go-accent);--dsw-alias-state-success-primary:var(--go-success);--dsw-alias-state-warn-primary:var(--go-warning);--dsw-alias-state-error-primary:var(--go-danger);--dsw-alias-border-l2:var(--go-border);--dsw-alias-border-l3:var(--go-border);--dsw-alias-border-l4:var(--go-border);--dsw-alias-bg-layer-3:var(--go-surface);--dsw-alias-bg-module-platform:var(--go-surface-2);--dsw-alias-button-primary-fill:var(--go-accent);--dsw-alias-button-primary-hover:color-mix(in srgb, var(--go-accent) 92%, var(--go-text));--dsw-alias-interactive-bg-hover:var(--go-surface-2);--dsw-alias-interactive-bg-active:var(--go-accent-soft);--dsw-alias-switch-thumb:var(--go-surface);--dsw-focus-ring-color:var(--go-accent);--dsw-focus-ring-width:2px;--dsw-radius-sm:7px;--dsw-radius-md:8px;box-sizing:border-box;background:var(--go-bg);min-width:0;height:100%;min-height:0;color:var(--go-text);font-family:var(--go-font);border-radius:12px;flex-direction:column;padding:22px 24px 0;font-size:13px;line-height:1.6;display:flex;container-type:size}._2hXyvq_page button,._2hXyvq_page input,._2hXyvq_page select{font-family:var(--go-font)}._2hXyvq_pageBody{scrollbar-gutter:stable;flex-direction:column;flex:1;min-height:0;padding:0 4px 16px 0;display:flex;overflow-y:auto}._2hXyvq_pageBody,._2hXyvq_modelList,._2hXyvq_modelDetails{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l3) transparent}._2hXyvq_pageBody::-webkit-scrollbar,._2hXyvq_modelList::-webkit-scrollbar,._2hXyvq_modelDetails::-webkit-scrollbar{width:8px;height:8px}._2hXyvq_pageBody::-webkit-scrollbar-track,._2hXyvq_modelList::-webkit-scrollbar-track,._2hXyvq_modelDetails::-webkit-scrollbar-track{background:0 0}._2hXyvq_pageBody::-webkit-scrollbar-thumb,._2hXyvq_modelList::-webkit-scrollbar-thumb,._2hXyvq_modelDetails::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l3);background-clip:content-box;border:2px solid #0000;border-radius:999px}._2hXyvq_pageBody:hover::-webkit-scrollbar-thumb,._2hXyvq_modelList:hover::-webkit-scrollbar-thumb,._2hXyvq_modelDetails:hover::-webkit-scrollbar-thumb{background:var(--dsw-alias-label-tertiary);background-clip:content-box}._2hXyvq_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}._2hXyvq_field+._2hXyvq_field{border-top:.5px solid var(--dsw-alias-border-l2)}._2hXyvq_head{align-items:center;gap:8px;display:flex}._2hXyvq_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}._2hXyvq_trailing{flex:none;align-items:center;gap:8px;display:inline-flex}._2hXyvq_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}._2hXyvq_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}._2hXyvq_reset:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}._2hXyvq_reset:focus-visible,._2hXyvq_cardTrigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}._2hXyvq_input{border:1px solid var(--go-border);background:var(--dsw-alias-bg-layer-3);height:36px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}._2hXyvq_input:focus-visible{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px var(--go-accent-soft);outline:none}._2hXyvq_inputInvalid:focus-visible{border-color:var(--dsw-alias-label-error);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-label-error) 28%, transparent)}._2hXyvq_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}._2hXyvq_inputInvalid{border-color:var(--dsw-alias-label-error);}._2hXyvq_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}._2hXyvq_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}._2hXyvq_rows{flex-direction:column;display:flex}._2hXyvq_row{grid-template-columns:minmax(0,1fr) 300px;align-items:center;gap:6px 14px;padding:10px 0;display:grid}._2hXyvq_rowLabel{align-items:center;gap:7px;min-width:0;display:flex}._2hXyvq_rowTitle{overflow-wrap:anywhere;-webkit-line-clamp:2;min-width:0;color:var(--dsw-alias-label-primary);-webkit-box-orient:vertical;font-size:13px;line-height:1.5;display:-webkit-box;overflow:hidden}._2hXyvq_rowControl{align-items:center;min-width:0;display:flex}._2hXyvq_rowControl>._2hXyvq_input{box-sizing:border-box;width:100%}._2hXyvq_advancedHead{flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:6px 12px;display:flex}._2hXyvq_advancedHead ._2hXyvq_hint{flex:auto;min-width:0}._2hXyvq_advancedHead ._2hXyvq_reset{flex:none}._2hXyvq_rowHint,._2hXyvq_rowInvalid{grid-column:1/-1;margin:0;font-size:12px;line-height:1.5}._2hXyvq_rowHint{color:var(--dsw-alias-label-tertiary)}._2hXyvq_rowInvalid{color:var(--dsw-alias-label-error)}._2hXyvq_groupHead{letter-spacing:.04em;color:var(--dsw-alias-label-tertiary);align-items:center;gap:8px;margin:14px 0 0;font-size:11.5px;line-height:1.5;display:flex}._2hXyvq_groupHead:first-child{margin-top:4px}._2hXyvq_groupHead:after{content:"";background:var(--dsw-alias-border-l2);flex:1;height:.5px}._2hXyvq_appearanceGroup{min-width:0;margin-top:10px}._2hXyvq_appearanceHead:after{order:1}._2hXyvq_appearanceHead ._2hXyvq_reset{letter-spacing:normal;flex:none;order:2}._2hXyvq_appearanceTitle{font:inherit;margin:0}._2hXyvq_appearanceToggle{justify-content:space-between;align-items:center;gap:16px;padding:12px 0 16px;display:flex}._2hXyvq_appearanceCopy{min-width:0}._2hXyvq_appearanceHint{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:1.6}._2hXyvq_appearanceStyles{border:0;min-width:0;margin:0;padding:0 0 4px}._2hXyvq_appearanceLegend{align-items:center;gap:7px;padding:0;display:flex}._2hXyvq_appearanceChoices{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px;display:grid}._2hXyvq_appearanceChoice{border:1px solid var(--dsw-alias-border-l2);cursor:pointer;border-radius:9px;flex-direction:column;gap:10px;min-width:0;padding:10px 12px;display:flex}._2hXyvq_appearanceChoice:hover:not([data-disabled=true]){border-color:var(--dsw-alias-border-l4);background:color-mix(in srgb, var(--dsw-alias-bg-layer-3) 40%, transparent)}._2hXyvq_appearanceChoice[data-selected=true]{border-color:var(--go-accent);background:var(--go-accent-soft)}._2hXyvq_appearanceChoice:has(:focus-visible){outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}._2hXyvq_appearanceChoice[data-disabled=true]{opacity:.5;cursor:default}._2hXyvq_appearanceChoiceHead{color:var(--dsw-alias-label-primary);justify-content:space-between;align-items:center;gap:8px;font-size:12px;line-height:1.5;display:flex}._2hXyvq_appearanceRadio{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);cursor:inherit;flex:none;margin:0}._2hXyvq_appearancePreview{background:var(--go-bg);min-width:0;min-height:42px;color:var(--go-text);border-radius:6px;justify-content:center;align-items:center;display:flex}._2hXyvq_appearanceSample{box-sizing:border-box;pointer-events:none;max-width:100%;overflow:hidden}._2hXyvq_info{width:16px;height:16px;font:inherit;color:var(--dsw-alias-label-tertiary);cursor:help;background:0 0;border:0;flex:none;justify-content:center;align-items:center;padding:0;font-size:12px;line-height:1;display:inline-flex}._2hXyvq_info:hover,._2hXyvq_info:focus-visible{color:var(--dsw-alias-label-primary)}._2hXyvq_info:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:3px}._2hXyvq_info svg{width:13px;height:13px}._2hXyvq_label ._2hXyvq_info,._2hXyvq_cardTitle ._2hXyvq_info{vertical-align:middle;margin-left:6px}._2hXyvq_seg{box-sizing:border-box;border:1px solid var(--go-border);background:var(--go-surface);border-radius:8px;flex:1;min-width:0;padding:3px;display:flex;position:relative}._2hXyvq_segThumb{background:var(--go-surface-2);border-radius:5px;width:calc(50% - 3px);transition:transform .16s cubic-bezier(.2,0,0,1);position:absolute;top:3px;bottom:3px;left:3px}._2hXyvq_seg[data-count="3"] ._2hXyvq_segThumb{width:calc(33.3333% - 2px)}._2hXyvq_seg[data-index="1"] ._2hXyvq_segThumb{transform:translate(100%)}._2hXyvq_seg[data-index="2"] ._2hXyvq_segThumb{transform:translate(200%)}._2hXyvq_segOption{min-width:0;font:inherit;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;cursor:pointer;background:0 0;border:0;border-radius:6px;flex:1 1 0;padding:4px 8px;font-size:12.5px;line-height:1.5;transition:color .16s;position:relative;overflow:hidden}._2hXyvq_segOption:hover:not(:disabled){color:var(--dsw-alias-label-primary)}._2hXyvq_segOption[aria-checked=true]{color:var(--go-text);font-weight:500}._2hXyvq_segOption:disabled{opacity:.55;cursor:default}._2hXyvq_segOption:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}._2hXyvq_pageTop{flex-direction:column;gap:7px;padding:0 0 24px;display:flex}._2hXyvq_title{font-family:var(--go-display-font);letter-spacing:-.035em;color:var(--dsw-alias-label-primary);margin:0;font-size:29px;font-weight:400;line-height:1.25}._2hXyvq_intro{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.5}._2hXyvq_card,._2hXyvq_cardModels{border:0;border-top:1px solid var(--go-border);background:0 0;border-radius:0;padding:16px 0}._2hXyvq_card{flex:none}._2hXyvq_card+._2hXyvq_card,._2hXyvq_card+._2hXyvq_cardModels,._2hXyvq_cardModels+._2hXyvq_card{margin-top:2px}._2hXyvq_cardModels{flex-direction:column;flex:1 0 auto;display:flex}._2hXyvq_cardFolded{flex:none}._2hXyvq_cardHead{align-items:center;gap:8px;min-height:24px;padding:0;display:flex}._2hXyvq_cardTitle{min-width:0;font-family:var(--go-display-font);color:var(--dsw-alias-label-primary);flex:1;font-size:17px;font-weight:500;line-height:1.5}._2hXyvq_cardSub{text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:50%;color:var(--dsw-alias-label-tertiary);flex:0 auto;font-size:11.5px;line-height:1.5;overflow:hidden}._2hXyvq_cardStamp{white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:none;font-size:11.5px;line-height:1.5}._2hXyvq_cardBody{flex-direction:column;gap:10px;padding:14px 0 0;display:flex}._2hXyvq_cardBody>._2hXyvq_input{box-sizing:border-box;width:100%}._2hXyvq_cardModels>._2hXyvq_cardBody{flex:1 0 auto}._2hXyvq_cardNotes{flex-direction:column;gap:8px;padding:10px 0 0;display:flex}._2hXyvq_cardNotes:empty{display:none}._2hXyvq_cardDivider{border-top:.5px solid var(--dsw-alias-border-l2);margin:16px 0}._2hXyvq_cardTrigger{width:100%;min-height:24px;font:inherit;text-align:left;color:inherit;cursor:pointer;background:0 0;border:none;align-items:center;gap:8px;margin:0;padding:0;display:flex}._2hXyvq_cardTrigger:hover ._2hXyvq_cardTitle{color:var(--dsw-alias-brand-primary)}._2hXyvq_cardHead>._2hXyvq_cardTrigger{padding:0}._2hXyvq_limitsEditor{flex-direction:column;flex:1 0 auto;gap:10px;padding-top:2px;display:flex}._2hXyvq_modelSearchRow{flex-wrap:wrap;align-items:center;gap:8px 12px;display:flex}._2hXyvq_modelSearchRow>._2hXyvq_input{flex:180px;width:0;min-width:140px}._2hXyvq_modelSearchRow>._2hXyvq_filters{flex:0 auto}._2hXyvq_modelHelp{color:var(--dsw-alias-label-tertiary);margin:-2px 0 0;font-size:11.5px;line-height:1.5}._2hXyvq_limitsFoot{border-top:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;margin:4px 0 0;padding:14px 0 0;display:flex}._2hXyvq_limitsSummary{min-width:0;color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:1;font-size:12px;line-height:1.5}._2hXyvq_modelMeta{align-items:baseline;gap:10px;display:flex}._2hXyvq_modelMeta ._2hXyvq_limitsModelId{flex:1;min-width:0}._2hXyvq_releaseDate{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;font-size:11px;line-height:1.4}._2hXyvq_limitsModelId{text-overflow:ellipsis;white-space:nowrap;font-family:var(--go-number-font);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.4;display:block;overflow:hidden}._2hXyvq_visuallyHidden{clip:rect(0, 0, 0, 0);white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}._2hXyvq_actions{border-top:1px solid var(--go-border);flex-wrap:wrap;flex:none;align-items:center;gap:8px;padding:16px 0;display:flex}._2hXyvq_starLink{max-width:100%;color:var(--dsw-alias-label-secondary);border-radius:4px;align-items:center;gap:7px;margin-left:auto;padding:6px 0;font-size:12px;line-height:1.5;text-decoration:none;display:inline-flex}._2hXyvq_starLink svg{flex:none}._2hXyvq_starLink:hover{color:var(--dsw-alias-brand-primary)}._2hXyvq_starLink:hover span{text-underline-offset:3px;text-decoration:underline}._2hXyvq_starLink:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}._2hXyvq_failedNote{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}._2hXyvq_slot{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}._2hXyvq_slot svg{width:15px;height:15px}._2hXyvq_chevron,._2hXyvq_chevronOpen{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .15s}._2hXyvq_chevron{transform:rotate(-90deg)}._2hXyvq_filters{flex-wrap:wrap;align-items:center;gap:2px;display:flex}._2hXyvq_filter{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:6px;padding:6px 9px;font-size:12px}._2hXyvq_filter[aria-pressed=true]{color:var(--go-accent);background:var(--go-accent-soft)}._2hXyvq_filter span{color:var(--dsw-alias-label-tertiary);margin-left:4px}._2hXyvq_modelLayout{border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;flex:auto;grid-template-columns:minmax(0,45fr) minmax(0,55fr);min-height:260px;max-height:560px;display:grid;overflow:hidden}._2hXyvq_modelList{border-right:.5px solid var(--dsw-alias-border-l2);min-height:0;padding:4px 6px;overflow-y:auto}._2hXyvq_modelPanel{flex-direction:column;gap:8px;width:100%;min-width:0;display:flex}._2hXyvq_modelRow{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding-right:6px;display:grid}._2hXyvq_modelRow+._2hXyvq_modelRow{border-top:.5px solid var(--dsw-alias-border-l2)}._2hXyvq_modelRowSelected{background:var(--go-accent-soft);border-top-color:#0000;border-radius:6px}._2hXyvq_modelRow>[role=switch]{flex:0 0 36px;width:36px;min-width:36px}._2hXyvq_modelChoice{box-sizing:border-box;text-align:left;width:100%;min-width:0;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:baseline;padding:9px 3px 9px 6px;display:flex;overflow:hidden}._2hXyvq_modelRow:hover:not(._2hXyvq_modelRowSelected){background:color-mix(in srgb, var(--dsw-alias-bg-layer-3) 92%, var(--dsw-alias-label-primary));border-top-color:#0000;border-radius:6px}._2hXyvq_modelName{overflow-wrap:normal;word-break:normal;flex-wrap:wrap;flex:0 auto;align-items:center;gap:5px;min-width:0;font-size:13px;display:flex;overflow:hidden}._2hXyvq_overrideDot{background:var(--dsw-alias-brand-primary);border-radius:50%;flex:none;width:6px;height:6px}._2hXyvq_modelDetails{background:var(--go-surface);flex-direction:column;gap:12px;min-height:0;padding:16px;display:flex;overflow-y:auto}._2hXyvq_modelDetails h3{font-family:var(--go-display-font);overflow-wrap:anywhere;margin:0;font-size:17px;font-weight:500}._2hXyvq_modelHeading{flex-wrap:wrap;align-items:center;gap:6px;display:flex}._2hXyvq_stats{flex-direction:column;gap:10px;display:flex}._2hXyvq_stat{flex-direction:column;gap:4px;display:flex}._2hXyvq_statLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}._2hXyvq_budgetEditor{margin-top:12px;font-size:12px}._2hXyvq_budgetEditor summary{cursor:pointer}._2hXyvq_budgetInput{align-items:center;gap:8px;margin-top:4px;display:flex}._2hXyvq_budgetPresets{flex-wrap:wrap;gap:6px;margin-top:8px;display:flex}._2hXyvq_modelDetails ._2hXyvq_input{box-sizing:border-box;width:100%;min-width:0;height:30px;padding:0 9px;font-size:12px}._2hXyvq_modalities{flex-wrap:wrap;gap:4px;display:flex}._2hXyvq_modality,._2hXyvq_modalityOff{border-radius:6px;padding:2px 7px;font-size:11px;line-height:1.5}._2hXyvq_modality{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}._2hXyvq_modalityOff{border:.5px dashed var(--dsw-alias-border-l4);color:var(--dsw-alias-label-tertiary)}._2hXyvq_modelDetails ._2hXyvq_reset{align-self:flex-start}._2hXyvq_paneFoot{color:var(--dsw-alias-label-tertiary);margin:auto 0 0;font-size:11px;line-height:1.5}._2hXyvq_newBadge{color:var(--go-accent);background:var(--go-accent-soft);border-radius:4px;padding:1px 5px;font-size:11px}._2hXyvq_modelChoice:focus-visible,._2hXyvq_filter:focus-visible,._2hXyvq_cardTrigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}@container (width<=620px){._2hXyvq_accountMain{grid-template-columns:16px minmax(0,1fr) auto 16px;gap:8px}._2hXyvq_accountHandle{grid-area:1/1/span 3;align-self:start;margin-top:3px}._2hXyvq_accountName{grid-area:1/2/auto/span 2}._2hXyvq_accountState{grid-area:2/2}._2hXyvq_accountReset{grid-area:2/3;font-size:11px}._2hXyvq_accountBar{grid-area:3/2}._2hXyvq_accountPercent{grid-area:3/3}._2hXyvq_accountToggle{grid-area:1/4/span 3;align-self:start;margin-top:3px}._2hXyvq_accountIdle{text-align:left;grid-area:3/2/auto/span 2}._2hXyvq_accountDetail{padding-left:12px}._2hXyvq_accountEditor{margin-left:12px}._2hXyvq_cardHead{flex-wrap:wrap}._2hXyvq_cardHead>._2hXyvq_cardTrigger{flex:180px;min-width:0}._2hXyvq_cardTrigger{flex-wrap:wrap}._2hXyvq_cardSub{white-space:normal;overflow-wrap:anywhere;flex:100%;order:2;max-width:none}._2hXyvq_cardHead>._2hXyvq_trailing{margin-left:auto}}@container (width<=440px){._2hXyvq_row{grid-template-columns:minmax(0,1fr);gap:6px}._2hXyvq_appearanceChoices{grid-template-columns:minmax(0,1fr)}._2hXyvq_modelLayout{flex:none;grid-template-columns:minmax(0,1fr);max-height:none}._2hXyvq_modelList{border-right:0;border-bottom:.5px solid var(--dsw-alias-border-l2);max-height:240px}._2hXyvq_modelDetails{max-height:460px}._2hXyvq_modelSearchRow>._2hXyvq_input{flex-basis:100%}._2hXyvq_modelToolbar ._2hXyvq_modelTools{justify-content:space-between;width:100%;margin-left:0}._2hXyvq_cardStamp{display:none}._2hXyvq_accountUsage{grid-template-columns:minmax(0,1fr)}._2hXyvq_accountUsage>div{grid-template-columns:80px minmax(0,1fr);align-items:center;gap:2px 10px;display:grid}._2hXyvq_accountUsage progress{margin:0}._2hXyvq_accountUsage ._2hXyvq_hint{grid-column:1/-1}}@media (width<=520px){._2hXyvq_page{padding:18px 14px 0}._2hXyvq_title{font-size:26px}._2hXyvq_intro{font-size:12px}}@media (prefers-reduced-motion:reduce){._2hXyvq_chevron,._2hXyvq_chevronOpen,._2hXyvq_segThumb,._2hXyvq_segOption{transition:none}}._2hXyvq_modelToolbar{border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px;margin-bottom:2px;padding:4px 0 12px;display:flex}._2hXyvq_modelTabs{flex:none;align-items:center;gap:16px;padding:0;display:inline-flex}._2hXyvq_modelTab{min-height:34px;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;white-space:nowrap;background:0 0;border:0;border-bottom:2px solid #0000;border-radius:0;justify-content:center;align-items:center;gap:7px;padding:5px 0;font-size:12px;font-weight:500;line-height:20px;display:inline-flex}._2hXyvq_modelTab[aria-selected=true]{border-bottom-color:var(--go-accent);color:var(--go-accent);font-weight:500}._2hXyvq_modelTab:hover{color:var(--dsw-alias-label-primary)}._2hXyvq_modelTabCount{font-variant-numeric:tabular-nums;color:var(--go-muted);font-size:11px;font-weight:400;line-height:18px}._2hXyvq_modelTabWarning{background:var(--go-warning);border-radius:50%;width:5px;height:5px}._2hXyvq_modelTools{flex-wrap:wrap;flex:none;align-items:center;gap:10px;margin-left:auto;display:flex}._2hXyvq_modelSync{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:5px;font-size:11px;line-height:18px;display:inline-flex}._2hXyvq_modelSync time{font-variant-numeric:tabular-nums;margin-left:2px}._2hXyvq_modelSyncDot{opacity:.6;background:currentColor;border-radius:50%;flex:none;width:5px;height:5px}._2hXyvq_modelSync[data-state=ready] ._2hXyvq_modelSyncDot{background:var(--go-success);opacity:1}._2hXyvq_modelSync[data-state=failed]{color:var(--go-warning)}._2hXyvq_modelSync[data-state=loading] ._2hXyvq_modelSyncDot{background:var(--dsw-alias-brand-primary);opacity:1}._2hXyvq_modelTab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}';
  document.head.appendChild(style);
}
var Section_default = { "accountActions": "_2hXyvq_accountActions", "accountBar": "_2hXyvq_accountBar", "accountBarFill": "_2hXyvq_accountBarFill", "accountBarTick": "_2hXyvq_accountBarTick", "accountDetail": "_2hXyvq_accountDetail", "accountDot": "_2hXyvq_accountDot", "accountEditor": "_2hXyvq_accountEditor", "accountEditorActions": "_2hXyvq_accountEditorActions", "accountEditorFor": "_2hXyvq_accountEditorFor", "accountEditorHead": "_2hXyvq_accountEditorHead", "accountEditorTitle": "_2hXyvq_accountEditorTitle", "accountField": "_2hXyvq_accountField", "accountHandle": "_2hXyvq_accountHandle", "accountIdle": "_2hXyvq_accountIdle", "accountMain": "_2hXyvq_accountMain", "accountName": "_2hXyvq_accountName", "accountPercent": "_2hXyvq_accountPercent", "accountProblems": "_2hXyvq_accountProblems", "accountReset": "_2hXyvq_accountReset", "accountRetry": "_2hXyvq_accountRetry", "accountRow": "_2hXyvq_accountRow", "accountState": "_2hXyvq_accountState", "accountToggle": "_2hXyvq_accountToggle", "accountUsage": "_2hXyvq_accountUsage", "accounts": "_2hXyvq_accounts", "actions": "_2hXyvq_actions", "addAccount": "_2hXyvq_addAccount", "advancedHead": "_2hXyvq_advancedHead", "appearanceChoice": "_2hXyvq_appearanceChoice", "appearanceChoiceHead": "_2hXyvq_appearanceChoiceHead", "appearanceChoices": "_2hXyvq_appearanceChoices", "appearanceCopy": "_2hXyvq_appearanceCopy", "appearanceGroup": "_2hXyvq_appearanceGroup", "appearanceHead": "_2hXyvq_appearanceHead", "appearanceHint": "_2hXyvq_appearanceHint", "appearanceLegend": "_2hXyvq_appearanceLegend", "appearancePreview": "_2hXyvq_appearancePreview", "appearanceRadio": "_2hXyvq_appearanceRadio", "appearanceSample": "_2hXyvq_appearanceSample", "appearanceStyles": "_2hXyvq_appearanceStyles", "appearanceTitle": "_2hXyvq_appearanceTitle", "appearanceToggle": "_2hXyvq_appearanceToggle", "budgetEditor": "_2hXyvq_budgetEditor", "budgetInput": "_2hXyvq_budgetInput", "budgetPresets": "_2hXyvq_budgetPresets", "card": "_2hXyvq_card", "cardBody": "_2hXyvq_cardBody", "cardDivider": "_2hXyvq_cardDivider", "cardFolded": "_2hXyvq_cardFolded", "cardHead": "_2hXyvq_cardHead", "cardModels": "_2hXyvq_cardModels", "cardNotes": "_2hXyvq_cardNotes", "cardStamp": "_2hXyvq_cardStamp", "cardSub": "_2hXyvq_cardSub", "cardTitle": "_2hXyvq_cardTitle", "cardTrigger": "_2hXyvq_cardTrigger", "chevron": "_2hXyvq_chevron", "chevronOpen": "_2hXyvq_chevronOpen", "failedNote": "_2hXyvq_failedNote", "field": "_2hXyvq_field", "filter": "_2hXyvq_filter", "filters": "_2hXyvq_filters", "groupHead": "_2hXyvq_groupHead", "head": "_2hXyvq_head", "hint": "_2hXyvq_hint", "info": "_2hXyvq_info", "input": "_2hXyvq_input", "inputInvalid": "_2hXyvq_inputInvalid _2hXyvq_input", "intro": "_2hXyvq_intro", "invalid": "_2hXyvq_invalid", "label": "_2hXyvq_label", "limitsEditor": "_2hXyvq_limitsEditor", "limitsFoot": "_2hXyvq_limitsFoot", "limitsModelId": "_2hXyvq_limitsModelId", "limitsSummary": "_2hXyvq_limitsSummary", "modalities": "_2hXyvq_modalities", "modality": "_2hXyvq_modality", "modalityOff": "_2hXyvq_modalityOff", "modelChoice": "_2hXyvq_modelChoice", "modelDetails": "_2hXyvq_modelDetails", "modelHeading": "_2hXyvq_modelHeading", "modelHelp": "_2hXyvq_modelHelp", "modelLayout": "_2hXyvq_modelLayout", "modelList": "_2hXyvq_modelList", "modelMeta": "_2hXyvq_modelMeta", "modelName": "_2hXyvq_modelName", "modelPanel": "_2hXyvq_modelPanel", "modelRow": "_2hXyvq_modelRow", "modelRowSelected": "_2hXyvq_modelRowSelected", "modelSearchRow": "_2hXyvq_modelSearchRow", "modelSync": "_2hXyvq_modelSync", "modelSyncDot": "_2hXyvq_modelSyncDot", "modelTab": "_2hXyvq_modelTab", "modelTabCount": "_2hXyvq_modelTabCount", "modelTabWarning": "_2hXyvq_modelTabWarning", "modelTabs": "_2hXyvq_modelTabs", "modelToolbar": "_2hXyvq_modelToolbar", "modelTools": "_2hXyvq_modelTools", "newBadge": "_2hXyvq_newBadge", "overrideDot": "_2hXyvq_overrideDot", "page": "_2hXyvq_page", "pageBody": "_2hXyvq_pageBody", "pageTop": "_2hXyvq_pageTop", "paneFoot": "_2hXyvq_paneFoot", "releaseDate": "_2hXyvq_releaseDate", "reset": "_2hXyvq_reset", "row": "_2hXyvq_row", "rowControl": "_2hXyvq_rowControl", "rowHint": "_2hXyvq_rowHint", "rowInvalid": "_2hXyvq_rowInvalid", "rowLabel": "_2hXyvq_rowLabel", "rowTitle": "_2hXyvq_rowTitle", "rows": "_2hXyvq_rows", "seg": "_2hXyvq_seg", "segOption": "_2hXyvq_segOption", "segThumb": "_2hXyvq_segThumb", "slot": "_2hXyvq_slot", "starLink": "_2hXyvq_starLink", "stat": "_2hXyvq_stat", "statLabel": "_2hXyvq_statLabel", "stats": "_2hXyvq_stats", "title": "_2hXyvq_title", "trailing": "_2hXyvq_trailing", "visuallyHidden": "_2hXyvq_visuallyHidden" };

// plugin-css:src/engines/opencode-go/client/UsagePill.module.css
var id2 = "dsh-llm-fusion/UsagePill.module.css";
if (!document.querySelector("style[data-plugin-css=" + JSON.stringify(id2) + "]")) {
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-llm-fusion";
  style.dataset.pluginCss = id2;
  style.textContent = '.G4m7AG_root{min-width:0;font-family:var(--go-font);color:var(--go-text,var(--dsw-alias-label-primary,CanvasText));display:inline-flex;position:relative}.G4m7AG_trigger{box-sizing:border-box;border:1px solid var(--go-border);background:var(--go-surface);min-width:0;max-width:100%;color:var(--go-text);font:inherit;white-space:nowrap;cursor:pointer;border-radius:99px;align-items:center;gap:7px;padding:6px 10px;font-size:11.5px;line-height:1.5;display:inline-flex}.G4m7AG_trigger:hover,.G4m7AG_trigger:focus-visible{border-color:color-mix(in srgb, var(--go-accent) 65%, var(--go-border));background:var(--go-surface-2)}.G4m7AG_trigger.G4m7AG_plain{color:inherit;background:0 0;border-color:#0000;padding:4px 6px}.G4m7AG_trigger.G4m7AG_plain:hover,.G4m7AG_trigger.G4m7AG_plain:focus-visible{background:color-mix(in srgb, var(--go-accent) 7%, transparent)}.G4m7AG_trigger:focus-visible{outline:2px solid var(--go-accent);outline-offset:2px}.G4m7AG_pillStatus{background:var(--go-success);border-radius:50%;flex:none;width:5px;height:5px}.G4m7AG_pillStatus[data-warning]{background:var(--go-warning)}.G4m7AG_reading{text-overflow:ellipsis;min-width:0;font-family:var(--go-number-font);font-variant-numeric:tabular-nums;letter-spacing:-.025em;flex:none;overflow:hidden}.G4m7AG_unit{color:var(--go-muted)}.G4m7AG_stale,.G4m7AG_fallback{color:var(--go-warning);font-size:11px}.G4m7AG_account{text-overflow:ellipsis;min-width:0;color:var(--go-muted);flex:0 100 auto;overflow:hidden}@container (width<=460px){.G4m7AG_stale,.G4m7AG_fallback{display:none}.G4m7AG_reading[data-stale]:after{content:"*"}.G4m7AG_trigger[data-fallback]:after{content:" \u21B3";color:var(--go-warning)}}@container (width<=360px){.G4m7AG_unit{display:none}}.G4m7AG_panel{z-index:100;box-sizing:border-box;border:1px solid var(--go-border);width:352px;max-width:calc(100vw - 48px);max-height:72vh;color:var(--go-text);box-shadow:0 18px 48px var(--go-shadow);isolation:isolate;border-radius:12px;flex-direction:column;font-size:12px;display:flex;position:absolute;bottom:calc(100% + 9px);right:0}.G4m7AG_material{z-index:-1;border-radius:inherit;background:var(--go-surface);pointer-events:none;position:absolute;inset:0}.G4m7AG_body{box-sizing:border-box;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--go-border) transparent;flex-direction:column;flex:1;gap:0;min-height:0;padding:7px 16px 12px;display:flex;overflow-y:auto}.G4m7AG_panelTitle,.G4m7AG_panelHead{border-bottom:1px solid var(--go-border);min-height:46px;color:var(--go-text);font-family:var(--go-display-font);letter-spacing:-.025em;flex:none;align-items:center;padding:0;font-size:17px;font-weight:400;display:flex}.G4m7AG_panelHead{gap:8px}.G4m7AG_panelHead strong{letter-spacing:0;color:var(--go-text);font-size:17px;font-weight:400}.G4m7AG_back{width:24px;height:26px;color:var(--go-muted);cursor:pointer;background:0 0;border:0;border-radius:4px;place-items:center;margin-left:-5px;padding:0;display:grid}.G4m7AG_back:hover{color:var(--go-text);background:var(--go-surface-2)}.G4m7AG_icon{flex:none;width:14px;height:14px}.G4m7AG_tick{width:15px;height:15px;color:var(--go-accent);flex:none}.G4m7AG_tile{flex:none;overflow:hidden}.G4m7AG_divider{background:var(--go-border);height:1px}.G4m7AG_accHead{align-items:center;gap:7px;min-height:48px;display:flex}.G4m7AG_dot{background:var(--go-success);border-radius:50%;flex:none;width:5px;height:5px}.G4m7AG_accName{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:13px;font-weight:500;overflow:hidden}.G4m7AG_tag{background:var(--go-accent-soft);color:var(--go-accent);border-radius:4px;flex:none;padding:1px 6px;font-size:11px;line-height:1.6}.G4m7AG_switch{color:var(--go-accent);font:inherit;cursor:pointer;background:0 0;border:0;border-radius:4px;flex:none;align-items:center;gap:3px;padding:4px 5px;font-size:11.5px;display:inline-flex}.G4m7AG_switch:hover:not(:disabled){background:var(--go-surface-2)}.G4m7AG_switch:disabled{opacity:.5;cursor:default}.G4m7AG_option{width:100%;min-height:44px;color:var(--go-text);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:10px;padding:0 9px;display:flex}.G4m7AG_option:hover:not(:disabled),.G4m7AG_option[data-selected]{background:color-mix(in srgb, var(--go-accent) 7%, transparent)}.G4m7AG_option:disabled{opacity:.5;cursor:default}.G4m7AG_optionName{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:12px;overflow:hidden}.G4m7AG_option[data-selected] .G4m7AG_optionName{font-weight:500}.G4m7AG_hint{color:var(--go-muted);margin:10px 0 2px;font-size:11.5px;line-height:1.7}.G4m7AG_warning{border-left:2px solid var(--go-warning);background:color-mix(in srgb, var(--go-warning) 7%, transparent);color:var(--go-text);overflow-wrap:anywhere;border-radius:0 4px 4px 0;margin:8px 0;padding:8px 10px;font-size:11.5px;line-height:1.6}.G4m7AG_warning p{margin:4px 0 0}.G4m7AG_retry{border:1px solid var(--go-border);color:var(--go-accent);font:inherit;cursor:pointer;background:0 0;border-radius:4px;align-self:flex-start;margin-bottom:8px;padding:4px 8px;font-size:11.5px}.G4m7AG_retry:disabled{opacity:.5;cursor:default}.G4m7AG_back:focus-visible,.G4m7AG_switch:focus-visible,.G4m7AG_option:focus-visible,.G4m7AG_retry:focus-visible{outline:2px solid var(--go-accent);outline-offset:-2px}.G4m7AG_window{padding:15px 0}.G4m7AG_windowRow{align-items:center;gap:12px;display:flex}.G4m7AG_windowLabel{width:48px;color:var(--go-muted);flex:none;font-size:12px}.G4m7AG_windowPercent{text-align:right;width:43px;font-family:var(--go-number-font);font-variant-numeric:tabular-nums;flex:none;font-size:12px;font-weight:500}.G4m7AG_window progress,.G4m7AG_sidebarWindow progress{appearance:none;background:var(--go-surface-2);border:0;border-radius:99px;flex:1;width:100%;min-width:0;height:5px;display:block}.G4m7AG_window progress::-webkit-progress-bar,.G4m7AG_sidebarWindow progress::-webkit-progress-bar{background:0 0;border-radius:99px}.G4m7AG_window progress::-webkit-progress-value,.G4m7AG_sidebarWindow progress::-webkit-progress-value{background:var(--go-progress,var(--go-accent));border-radius:99px}.G4m7AG_window progress::-moz-progress-bar,.G4m7AG_sidebarWindow progress::-moz-progress-bar{background:var(--go-progress,var(--go-accent));border-radius:99px}.G4m7AG_window progress{min-width:50px}.G4m7AG_windowReset{color:var(--go-muted);margin-top:7px;padding-left:60px;font-size:11px;line-height:1.6}.G4m7AG_progressRolling,.G4m7AG_progressWeekly,.G4m7AG_progressMonthly{--go-progress:var(--go-accent)}.G4m7AG_window progress.G4m7AG_high,.G4m7AG_sidebarWindow progress.G4m7AG_high{--go-progress:var(--go-warning)}.G4m7AG_window progress.G4m7AG_limited,.G4m7AG_sidebarWindow progress.G4m7AG_limited{--go-progress:var(--go-danger)}.G4m7AG_limitedText{color:var(--go-danger);margin-top:5px;font-size:11px}.G4m7AG_foot{color:var(--go-muted);justify-content:space-between;align-items:center;gap:7px;padding-top:10px;font-size:11px;line-height:1.6;display:flex}.G4m7AG_foot>span{min-width:0}.G4m7AG_analyticsEntry{border:0;border-top:1px solid var(--go-border);width:100%;min-height:42px;color:var(--go-text);font:inherit;text-align:left;cursor:pointer;background:0 0;flex:none;align-items:center;gap:8px;margin-top:3px;padding:0;font-size:11.5px;display:flex}.G4m7AG_analyticsEntry span{flex:1;min-width:0}.G4m7AG_analyticsEntry>.G4m7AG_icon:first-child{color:var(--go-accent)}.G4m7AG_analyticsEntry>.G4m7AG_icon:last-child{color:var(--go-muted)}.G4m7AG_analyticsEntry:hover{color:var(--go-accent)}.G4m7AG_analyticsEntry:focus-visible{outline:2px solid var(--go-accent);outline-offset:2px;border-radius:2px}.G4m7AG_sidebarRoot{width:100%;min-width:0;display:flex}.G4m7AG_sidebarRoot[data-wide=false]{flex:none;width:36px;min-width:36px}.G4m7AG_sidebarCard,.G4m7AG_sidebarIcon{box-sizing:border-box;border:1px solid var(--go-border);background:var(--go-surface);color:var(--go-text);font:inherit}.G4m7AG_sidebarCard{text-align:left;border-radius:10px;flex-direction:column;align-items:stretch;gap:11px;width:100%;min-width:0;padding:14px 12px 6px;display:flex}.G4m7AG_sidebarHead{align-items:center;gap:6px;min-width:0;margin-bottom:1px;display:flex}.G4m7AG_sidebarHead>strong{font-family:var(--go-display-font);white-space:nowrap;letter-spacing:-.03em;flex:none;font-size:15px;font-weight:400}.G4m7AG_sidebarBadge{border:1px solid var(--go-border);min-width:0;color:var(--go-muted);text-overflow:ellipsis;white-space:nowrap;background:0 0;border-radius:3px;margin-left:auto;padding:1px 5px;font-size:11px;line-height:1.7;overflow:hidden}.G4m7AG_sidebarAccountButton{cursor:pointer;font-family:inherit}.G4m7AG_sidebarAccountButton:hover{color:var(--go-accent);border-color:var(--go-accent)}.G4m7AG_sidebarAccountButton:focus-visible{outline:2px solid var(--go-accent);outline-offset:2px}.G4m7AG_sidebarWindow{grid-template-columns:44px minmax(0,1fr) 36px;align-items:center;gap:7px;font-size:11px;line-height:1.5;display:grid}.G4m7AG_sidebarWindow>span{color:var(--go-muted);white-space:nowrap}.G4m7AG_sidebarWindow>strong{text-align:right;font-family:var(--go-number-font);font-variant-numeric:tabular-nums;font-size:11px;font-weight:400}.G4m7AG_sidebarStatus{color:var(--go-warning);font-size:11px}.G4m7AG_sidebarHistory{border:0;border-top:1px solid var(--go-border);width:100%;min-height:33px;color:var(--go-muted);font:inherit;text-align:left;cursor:pointer;background:0 0;align-items:center;gap:7px;margin-top:2px;padding:0;font-size:11.5px;display:flex}.G4m7AG_sidebarHistory span{flex:1}.G4m7AG_sidebarHistory>.G4m7AG_icon:first-child{color:var(--go-accent)}.G4m7AG_sidebarHistory:hover{color:var(--go-text)}.G4m7AG_sidebarHistory:focus-visible{outline:2px solid var(--go-accent);outline-offset:1px;border-radius:2px}.G4m7AG_sidebarIcon{width:36px;min-width:36px;height:36px;color:var(--go-accent);border-radius:7px;place-items:center;padding:0;display:grid}button.G4m7AG_sidebarIcon{cursor:pointer}button.G4m7AG_sidebarIcon:hover{background:var(--go-surface-2);border-color:var(--go-accent)}button.G4m7AG_sidebarIcon:focus-visible{outline:2px solid var(--go-accent);outline-offset:2px}.G4m7AG_sidebarIcon .G4m7AG_icon{width:17px;height:17px}[class*=_footArea] [class*=_footerActions]:has(.G4m7AG_sidebarRoot){flex-direction:column}@media (width<=360px){.G4m7AG_windowRow{gap:8px}.G4m7AG_windowReset{padding-left:56px}.G4m7AG_foot{align-items:flex-start}}';
  document.head.appendChild(style);
}
var UsagePill_default = { "accHead": "G4m7AG_accHead", "accName": "G4m7AG_accName", "account": "G4m7AG_account", "analyticsEntry": "G4m7AG_analyticsEntry", "back": "G4m7AG_back", "body": "G4m7AG_body", "divider": "G4m7AG_divider", "dot": "G4m7AG_dot", "fallback": "G4m7AG_fallback", "foot": "G4m7AG_foot", "high": "G4m7AG_high", "hint": "G4m7AG_hint", "icon": "G4m7AG_icon", "limited": "G4m7AG_limited", "limitedText": "G4m7AG_limitedText", "material": "G4m7AG_material", "option": "G4m7AG_option", "optionName": "G4m7AG_optionName", "panel": "G4m7AG_panel", "panelHead": "G4m7AG_panelHead", "panelTitle": "G4m7AG_panelTitle", "pillStatus": "G4m7AG_pillStatus", "plain": "G4m7AG_plain", "progressMonthly": "G4m7AG_progressMonthly", "progressRolling": "G4m7AG_progressRolling", "progressWeekly": "G4m7AG_progressWeekly", "reading": "G4m7AG_reading", "retry": "G4m7AG_retry", "root": "G4m7AG_root", "sidebarAccountButton": "G4m7AG_sidebarAccountButton", "sidebarBadge": "G4m7AG_sidebarBadge", "sidebarCard": "G4m7AG_sidebarCard", "sidebarHead": "G4m7AG_sidebarHead", "sidebarHistory": "G4m7AG_sidebarHistory", "sidebarIcon": "G4m7AG_sidebarIcon", "sidebarRoot": "G4m7AG_sidebarRoot", "sidebarStatus": "G4m7AG_sidebarStatus", "sidebarWindow": "G4m7AG_sidebarWindow", "stale": "G4m7AG_stale", "switch": "G4m7AG_switch", "tag": "G4m7AG_tag", "tick": "G4m7AG_tick", "tile": "G4m7AG_tile", "trigger": "G4m7AG_trigger", "unit": "G4m7AG_unit", "warning": "G4m7AG_warning", "window": "G4m7AG_window", "windowLabel": "G4m7AG_windowLabel", "windowPercent": "G4m7AG_windowPercent", "windowReset": "G4m7AG_windowReset", "windowRow": "G4m7AG_windowRow" };

// src/engines/opencode-go/client/Section.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/engines/opencode-go/client/presentation.ts
var import_react = require("react");
var en = {
  accountsTitle: "Accounts",
  accountsRefresh: "Refresh accounts",
  accountsBlocked: "Wait for the current settings change to finish before changing accounts.",
  accountsEmpty: "Add an account to use OpenCode Go.",
  accountsWriteFailed: "Could not apply the account change. Your input is kept; please retry.",
  accountsReadFailed: "Could not read account status. Please refresh.",
  accountsCleanupFailed: "The account entry was removed, but its stored key could not be deleted. Remove the unused reference through the host credential service.",
  accountsRemoveKeyFailed: "The stored key could not be deleted, so the account was kept. Please retry.",
  accountsStatusUnknown: "Status unknown",
  accountDefault: "Default account",
  accountAdd: "Add account",
  accountRename: "Rename",
  accountReplaceKey: "Replace key",
  accountRemove: "Remove account",
  accountRemoveHint: "Remove \u201C{name}\u201D? If it is the current account, the next account takes over. Keys added here are deleted from the credential service; existing external references are kept.",
  accountName: "Account name",
  accountKeyHint: "The key is saved through the host credential service and is never returned to this page.",
  accountConfirm: "Confirm",
  accountCancel: "Cancel",
  accountAutoSwitch: "Automatic fallback",
  accountAutoSwitchHint: "When a quota runs out or a key is unusable, the other accounts are tried in order; the account that starts producing output moves to the first position and becomes current.",
  accountPreferredTag: "Current",
  accountSwitchAction: "Switch",
  accountSwitchTitle: "Switch account",
  accountSwitchBack: "Back to usage",
  accountSwitchHint: "This account moves to the first position and serves later requests in this profile. The other accounts keep their relative order.",
  accountSwitchFailed: "Could not switch account. Please retry.",
  sidebarNextAccount: "View the next account\u2019s quota",
  sidebarAnalytics: "Open usage history",
  accountFallbackQuota: "The current account reached its quota; switched to",
  accountFallbackCredential: "The current key was unavailable or rejected; switched to",
  accountsSummary: "{count} accounts \xB7 Current {name}",
  accountsSummaryEmpty: "No accounts yet",
  accountsAvailability: "{ready}/{total} configured",
  accountsAvailabilityFailed: "{ready}/{total} configured \xB7 {failed} unreadable",
  accountsDetails: "Details for {name}",
  accountsDetailsHide: "Hide details for {name}",
  accountDragHandle: "Reorder {name}",
  accountConfigureHint: "Add a key to read usage",
  usageResetMinutes: "resets in {minutes} min",
  usageResetHours: "resets in {hours} h",
  usageResetDays: "resets in {days} d",
  usageResetDue: "resets now",
  usageResetUnknown: "reset time unknown",
  usageTitle: "OpenCode Go quota",
  usageRollingShort: "5h",
  usageWeekShort: "week",
  usage_rolling: "5 hours",
  usage_weekly: "Weekly",
  usage_monthly: "Monthly",
  usageResets: "Resets",
  usageLimited: "Limit reached",
  usageLoading: "Loading usage\u2026",
  usageUnavailable: "Unavailable",
  usageStaleShort: "Last data",
  usageFallbackShort: "fallback",
  usageStaleHint: "Showing the last successful usage reading. Current usage may have changed.",
  usageRefreshFailed: "Refresh failed",
  usageLastUpdated: "Last updated",
  usageRetry: "Retry now",
  usageRefresh: "Refresh quota",
  usageRefreshing: "Refreshing\u2026",
  analyticsOpen: "Usage history",
  analyticsTitle: "Usage history",
  analyticsSubtitle: "Official OpenCode Console usage for the selected account.",
  analyticsClose: "Close usage history",
  analyticsRange: "Date range",
  analyticsRangeToday: "Today",
  analyticsRange7d: "7 days",
  analyticsRange30d: "30 days",
  analyticsRange90d: "90 days",
  analyticsRefresh: "Refresh",
  analyticsRetry: "Retry",
  analyticsLoading: "Loading usage history\u2026",
  analyticsEmpty: "No usage for this account in the selected range.",
  analyticsFailed: "Could not read usage history.",
  analyticsRequests: "Requests",
  analyticsTokens: "Tokens",
  analyticsSpend: "Cost",
  analyticsByModel: "By model",
  analyticsByDay: "By day",
  analyticsInput: "in",
  analyticsOutput: "out",
  analyticsCacheRead: "cache",
  analyticsQuota: "Quota",
  analyticsQuotaHint: "Official account limits",
  analyticsQuotaFailed: "Quota is temporarily unavailable; usage statistics are still shown.",
  analyticsChartSpend: "Cost",
  analyticsChartTokens: "Tokens",
  analyticsKicker: "OpenCode Console",
  analyticsModel: "Model",
  analyticsCost: "Cost",
  analyticsShare: "Share",
  analyticsCacheHit: "cache hit",
  analyticsDailyAverage: "Daily avg",
  analyticsPeak: "Peak",
  analyticsTotal: "Total",
  nav: "OpenCode Go",
  title: "OpenCode Go",
  titleLabel: "OpenCode Go",
  intro: "Choose the OpenCode Go and platform free models shown in conversations and adjust their capacities.",
  starProject: "Enjoying the plugin? Star it on GitHub",
  starProjectTitle: "Open the GitHub project in a new tab",
  enabledLabel: "Enable OpenCode Go and Free",
  enabledHint: "Enables the Free route; Go also requires a usable API key. Turning this off withdraws both routes immediately.",
  enabledOff: "OpenCode Go and Free are off: their models are withdrawn from every picker.",
  enabledUnavailable: "This deployment pins the switch on in its composition, so it cannot be changed here.",
  keyLabel: "API key",
  keyHint: "From your OpenCode Go subscription (opencode.ai). Leaving this blank keeps the key already saved, and a saved key applies to the next request without a restart.",
  keyConfigured: "Key saved",
  keyMissing: "No key yet",
  keyNotWritable: "This key is supplied from outside the settings document (an environment variable, for example), so it cannot be changed here.",
  modelsLabel: "Available models",
  modelSourcesLabel: "Model source",
  modelsGoTab: "OpenCode Go",
  modelsFreeTab: "Free models",
  modelsGoSource: "Go model source",
  modelsFreeSource: "Free model source",
  modelsRefresh: "Refresh",
  modelsLoading: "Reading the gateway model list\u2026",
  modelsFailed: "Could not read the gateway model list.",
  modelsStale: "Some model data could not be refreshed. Available cached data is still in use, including in conversation pickers.",
  modelsSourceFailed: "Refresh failed",
  modelsSourceCurrent: "Up to date",
  modelsSourceNeverFetched: "No successful fetch yet",
  modelsSourceUpdated: "Last successful check: {time}",
  modelsRefreshing: "Refreshing\u2026 Keeping the last fetched models visible.",
  modelsRefreshingShort: "Updating\u2026",
  modelsEmpty: "The gateway currently serves no model this adapter can route.",
  limitsLabel: "Model capacities",
  limitsHint: "Capacities come from the online configuration; blank keeps the default and Save applies your overrides.",
  limitsFilterLabel: "Find a model",
  limitsFilterPlaceholder: "Search by model name or id\u2026",
  limitsSummary: "{count} customized",
  limitsModel: "Model",
  limitsContext: "Context window",
  limitsOutput: "Max output",
  thinkingBudgets: "Thinking budgets",
  thinkingBudgetsHint: "Add token budgets to the conversation picker, then Save. Range: {min}\u2013{max} tokens. Existing reasoning choices stay available; Default uses the service settings. The SDK may reduce a budget to leave room for the answer.",
  thinkingBudgetAddLabel: "New thinking budget for {name}",
  thinkingBudgetAdd: "Add",
  thinkingBudgetRemove: "Remove {value} token budget",
  capacityDefault: "Default: {value} tokens",
  capacityDefaultCapped: "Default: {value} tokens (catalog max: {max} tokens)",
  capacityMissing: "API did not provide a value",
  modalityLabel: "Input modalities",
  modalityText: "Text",
  modalityImage: "Image",
  modalityAudio: "Audio",
  modalityVideo: "Video",
  modalityPdf: "PDF",
  modalityUnknown: "Not declared",
  modalitiesSource: "Input modalities come from the online /models configuration.",
  modalitiesForwarding: "This plugin converts and forwards image attachments only.",
  visibilityHint: "Model switches apply immediately. Save to apply capacity changes.",
  modelVisibleLabel: "Show {name} in conversations",
  configurationMissing: "Configuration missing",
  configurationMissingHint: "The gateway lists this model, but no usable OpenCode Go configuration is available. Once the upstream configuration is supplied or corrected, refresh the list to enable it.",
  configurationUnavailable: "Configuration unavailable",
  pickerFailed: "Could not update model visibility. Please retry.",
  deprecatedBadge: "Deprecated",
  deprecatedHint: "Marked deprecated by /models, but still provided by this gateway.",
  newHint: "Released within the last seven UTC calendar days, according to /models.",
  newBadge: "NEW",
  releaseSource: "Release date: {date} \xB7 /models",
  modelDetails: "Model configuration",
  filterLabel: "Filter models",
  filterAll: "All",
  filterNew: "New in 7 days",
  filterCustom: "Customized",
  filterDeprecated: "Deprecated",
  limitsResetModel: "Use catalog",
  limitsResetAll: "Clear all overrides",
  limitsNoMatches: "No models match \u201C{query}\u201D. Try a different name or id.",
  limitsEmpty: "Read the model list first; capacities are edited per model the gateway serves.",
  limitsContextLabel: "Context window for {name}",
  limitsOutputLabel: "Max output for {name}",
  advancedResetAll: "Reset parameter defaults",
  advancedLabel: "Advanced settings",
  groupUsage: "Usage settings",
  usageAppearanceLabel: "Quota appearance",
  usageAppearanceReset: "Reset appearance",
  showSidebarQuotaLabel: "Show quota in the sidebar",
  showSidebarQuotaSummary: "View account quotas in the sidebar, independently of the input indicator.",
  showSidebarQuotaHint: "Shows a quota card in the expanded sidebar and an icon when collapsed. Click the account name to cycle through account quotas without changing request order; the viewed account is remembered on this device. Refreshes every minute, independently of the input indicator.",
  usagePillStyleLabel: "Input quota style",
  usagePillStyleHint: "Choose a bordered badge or a plain, transparent quota indicator in the conversation input.",
  usagePillStylePreviewHint: "Sample usage is shown below. Save to apply your chosen style.",
  usagePillStyle_badge: "Badge (default)",
  usagePillStyle_plain: "Plain",
  groupConnection: "Connection",
  groupCacheTimeouts: "Cache and timeouts",
  groupImages: "Image handling",
  advancedHint: "The inherited values work as they are; below are only the settings you may need to change.",
  usageDisplayLabel: "Usage display",
  usageDisplayHint: "Auto shows the input indicator only for DSH OpenCode Go models; Always keeps it visible with any model; Off hides it and stops its polling. While visible it refreshes every minute. The sidebar has its own switch.",
  usageDisplay_auto: "Auto (default)",
  usageDisplay_always: "Always",
  usageDisplay_off: "Off",
  freeBaseURLLabel: "Free gateway URL",
  freeBaseURLHint: "Discovers platform chat models with explicitly zero text, cache and tier prices. Without a saved key, requests use public access.",
  baseURLLabel: "Go gateway URL",
  baseURLHint: "The official Go gateway selects each model\u2019s protocol endpoint automatically. Custom gateways use the configured prefix.",
  proxyURLLabel: "Proxy address",
  proxyURLHint: "The HTTP(S) or SOCKS5 proxy for conversations, catalog refreshes and usage queries; leave empty for the default network.",
  proxyURLInvalid: "Enter an http://, https:// or socks5:// proxy address without a path, query or fragment.",
  refreshMinutesLabel: "Catalog refresh (minutes)",
  refreshMinutesHint: "How long the model catalog is cached; opening this page or refreshing re-checks it immediately.",
  streamIdleTimeoutMsLabel: "Stream idle timeout (ms)",
  streamIdleTimeoutMsHint: "The longest silence between stream events; a longer gap fails the request.",
  maxImagesLabel: "Request image count cap (maxImages)",
  maxImagesHint: "Leave empty to inherit the base configuration (uncapped only when the base sets none); above the cap the oldest images become text placeholders.",
  maxRequestImageBytesLabel: "Request image payload cap (bytes)",
  maxRequestImageBytesHint: "The cap on the accumulated base64 image payload in one request.",
  requestImagePixelBudgetLabel: "Image pixel budget",
  requestImagePixelBudgetHint: "The total pixel budget of one image after conversion.",
  requestImageMaxBytesLabel: "Image byte target (bytes)",
  requestImageMaxBytesHint: "The original byte target of one image before base64 expansion.",
  overridden: "Customized",
  reset: "Reset to default",
  invalidValue: "Not a valid value",
  save: "Save",
  discard: "Discard",
  saving: "Saving\u2026",
  savedFailed: "The last save did not land as staged; correct the values or discard.",
  readOnly: "The settings document is read-only in this deployment.",
  unavailable: "The OpenCode Go settings are not served in this deployment."
};
var zh = {
  accountsTitle: "\u8D26\u53F7",
  accountsRefresh: "\u5237\u65B0\u989D\u5EA6",
  accountsBlocked: "\u8BF7\u7B49\u5F85\u5F53\u524D\u8BBE\u7F6E\u4FDD\u5B58\u5B8C\u6210\uFF0C\u518D\u5207\u6362\u6216\u4FEE\u6539\u8D26\u53F7\u3002",
  accountsEmpty: "\u6DFB\u52A0\u8D26\u53F7\u540E\u5373\u53EF\u4F7F\u7528 OpenCode Go\u3002",
  accountsWriteFailed: "\u8D26\u53F7\u4FEE\u6539\u672A\u751F\u6548\uFF0C\u8F93\u5165\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  accountsReadFailed: "\u672A\u80FD\u8BFB\u53D6\u8D26\u53F7\u72B6\u6001\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002",
  accountsCleanupFailed: "\u8D26\u53F7\u6761\u76EE\u5DF2\u79FB\u9664\uFF0C\u4F46\u4FDD\u5B58\u7684 Key \u672A\u80FD\u5220\u9664\u3002\u8BF7\u901A\u8FC7\u5BBF\u4E3B\u51ED\u636E\u670D\u52A1\u5220\u9664\u672A\u4F7F\u7528\u7684\u5F15\u7528\u3002",
  accountsRemoveKeyFailed: "\u672A\u80FD\u5220\u9664\u5DF2\u4FDD\u5B58\u7684 Key\uFF0C\u8D26\u53F7\u6682\u65F6\u4FDD\u7559\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  accountsStatusUnknown: "\u72B6\u6001\u672A\u77E5",
  accountDefault: "\u9ED8\u8BA4\u8D26\u53F7",
  accountAdd: "\u6DFB\u52A0\u8D26\u53F7",
  accountRename: "\u91CD\u547D\u540D",
  accountReplaceKey: "\u66FF\u6362 Key",
  accountRemove: "\u5220\u9664\u8D26\u53F7",
  accountRemoveHint: "\u5220\u9664\u201C{name}\u201D\uFF1F\u82E5\u5B83\u662F\u5F53\u524D\u8D26\u53F7\uFF0C\u5C06\u4F7F\u7528\u4E0B\u4E00\u4E2A\u8D26\u53F7\u3002\u5728\u8FD9\u91CC\u6DFB\u52A0\u7684 Key \u4F1A\u4ECE\u51ED\u636E\u670D\u52A1\u5220\u9664\uFF1B\u5DF2\u6709\u5916\u90E8\u5F15\u7528\u4F1A\u4FDD\u7559\u3002",
  accountName: "\u8D26\u53F7\u540D\u79F0",
  accountKeyHint: "Key \u901A\u8FC7\u5BBF\u4E3B\u51ED\u636E\u670D\u52A1\u4FDD\u5B58\uFF0C\u9875\u9762\u4E0D\u4F1A\u56DE\u663E\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5\u3002",
  accountConfirm: "\u786E\u8BA4",
  accountCancel: "\u53D6\u6D88",
  accountAutoSwitch: "\u81EA\u52A8\u4F7F\u7528\u5907\u7528\u8D26\u53F7",
  accountAutoSwitchHint: "\u989D\u5EA6\u8017\u5C3D\u6216 Key \u4E0D\u53EF\u7528\u65F6\uFF0C\u6309\u987A\u5E8F\u5C1D\u8BD5\u5176\u4ED6\u8D26\u53F7\uFF1B\u5F00\u59CB\u6B63\u5E38\u8F93\u51FA\u7684\u8D26\u53F7\u4F1A\u79FB\u81F3\u9996\u4F4D\u5E76\u6210\u4E3A\u5F53\u524D\u8D26\u53F7\u3002",
  accountPreferredTag: "\u5F53\u524D\u8D26\u53F7",
  accountSwitchAction: "\u5207\u6362",
  accountSwitchTitle: "\u5207\u6362\u8D26\u53F7",
  accountSwitchBack: "\u8FD4\u56DE\u989D\u5EA6",
  accountSwitchHint: "\u5207\u6362\u540E\uFF0C\u8BE5\u8D26\u53F7\u79FB\u81F3\u9996\u4F4D\uFF0C\u4F9B\u672C profile \u7684\u540E\u7EED\u8BF7\u6C42\u4F7F\u7528\uFF1B\u5176\u4ED6\u8D26\u53F7\u7684\u76F8\u5BF9\u987A\u5E8F\u4FDD\u6301\u4E0D\u53D8\u3002",
  accountSwitchFailed: "\u8D26\u53F7\u5207\u6362\u672A\u751F\u6548\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  sidebarNextAccount: "\u67E5\u770B\u4E0B\u4E00\u4E2A\u8D26\u53F7\u7684\u989D\u5EA6",
  sidebarAnalytics: "\u6253\u5F00\u7528\u91CF\u5386\u53F2",
  accountFallbackQuota: "\u5F53\u524D\u8D26\u53F7\u989D\u5EA6\u8017\u5C3D\uFF0C\u5DF2\u81EA\u52A8\u5207\u6362\u4E3A\uFF1A",
  accountFallbackCredential: "\u5F53\u524D Key \u4E0D\u53EF\u7528\u6216\u88AB\u62D2\u7EDD\uFF0C\u5DF2\u81EA\u52A8\u5207\u6362\u4E3A\uFF1A",
  accountsSummary: "{count} \u4E2A \xB7 \u5F53\u524D {name}",
  accountsSummaryEmpty: "\u5C1A\u672A\u6DFB\u52A0\u8D26\u53F7",
  accountsAvailability: "{ready}/{total} \u5DF2\u914D\u7F6E",
  accountsAvailabilityFailed: "{ready}/{total} \u5DF2\u914D\u7F6E \xB7 {failed} \u4E2A\u8BFB\u53D6\u5931\u8D25",
  accountsDetails: "{name} \u7684\u8BE6\u60C5",
  accountsDetailsHide: "\u6536\u8D77 {name} \u7684\u8BE6\u60C5",
  accountDragHandle: "\u62D6\u52A8 {name} \u8C03\u6574\u987A\u5E8F",
  accountConfigureHint: "\u914D\u7F6E Key \u540E\u663E\u793A\u989D\u5EA6",
  usageResetMinutes: "{minutes} \u5206\u949F\u540E\u91CD\u7F6E",
  usageResetHours: "{hours} \u5C0F\u65F6\u540E\u91CD\u7F6E",
  usageResetDays: "{days} \u5929\u540E\u91CD\u7F6E",
  usageResetDue: "\u5373\u5C06\u91CD\u7F6E",
  usageResetUnknown: "\u91CD\u7F6E\u65F6\u95F4\u672A\u77E5",
  usageTitle: "OpenCode Go \u989D\u5EA6",
  usageRollingShort: "5\u5C0F\u65F6",
  usageWeekShort: "\u5468",
  usage_rolling: "5 \u5C0F\u65F6",
  usage_weekly: "\u6BCF\u5468",
  usage_monthly: "\u6BCF\u6708",
  usageResets: "\u91CD\u7F6E\u4E8E",
  usageLimited: "\u5DF2\u8FBE\u9650\u989D",
  usageLoading: "\u6B63\u5728\u8BFB\u53D6\u7528\u91CF\u2026",
  usageUnavailable: "\u6682\u4E0D\u53EF\u7528",
  usageStaleShort: "\u4E0A\u6B21\u6570\u636E",
  usageFallbackShort: "\u5DF2\u56DE\u9000",
  usageStaleHint: "\u5F53\u524D\u663E\u793A\u4E0A\u6B21\u6210\u529F\u8BFB\u53D6\u7684\u7528\u91CF\uFF0C\u5B9E\u9645\u7528\u91CF\u53EF\u80FD\u5DF2\u53D8\u5316\u3002",
  usageRefreshFailed: "\u5237\u65B0\u5931\u8D25",
  usageLastUpdated: "\u66F4\u65B0\u4E8E",
  usageRetry: "\u7ACB\u5373\u91CD\u8BD5",
  usageRefresh: "\u5237\u65B0\u989D\u5EA6",
  usageRefreshing: "\u6B63\u5728\u5237\u65B0\u2026",
  analyticsOpen: "\u7528\u91CF\u5386\u53F2",
  analyticsTitle: "\u7528\u91CF\u5386\u53F2",
  analyticsSubtitle: "\u6240\u9009\u8D26\u53F7\u7684 OpenCode Console \u5B98\u65B9\u7528\u91CF\u3002",
  analyticsClose: "\u5173\u95ED\u7528\u91CF\u5386\u53F2",
  analyticsRange: "\u65F6\u95F4\u8303\u56F4",
  analyticsRangeToday: "\u4ECA\u5929",
  analyticsRange7d: "7 \u5929",
  analyticsRange30d: "30 \u5929",
  analyticsRange90d: "90 \u5929",
  analyticsRefresh: "\u5237\u65B0",
  analyticsRetry: "\u91CD\u8BD5",
  analyticsLoading: "\u6B63\u5728\u8BFB\u53D6\u7528\u91CF\u5386\u53F2\u2026",
  analyticsEmpty: "\u8BE5\u8D26\u53F7\u5728\u6240\u9009\u533A\u95F4\u5185\u6CA1\u6709\u7528\u91CF\u3002",
  analyticsFailed: "\u672A\u80FD\u8BFB\u53D6\u7528\u91CF\u5386\u53F2\u3002",
  analyticsRequests: "\u8BF7\u6C42",
  analyticsTokens: "Token",
  analyticsSpend: "\u82B1\u8D39",
  analyticsByModel: "\u6309\u6A21\u578B",
  analyticsByDay: "\u6309\u5929",
  analyticsInput: "\u8F93\u5165",
  analyticsOutput: "\u8F93\u51FA",
  analyticsCacheRead: "\u7F13\u5B58",
  analyticsQuota: "\u989D\u5EA6",
  analyticsQuotaHint: "\u5B98\u65B9\u8D26\u53F7\u9650\u989D",
  analyticsQuotaFailed: "\u989D\u5EA6\u6682\u4E0D\u53EF\u7528\uFF0C\u7EDF\u8BA1\u7ED3\u679C\u4ECD\u4F1A\u663E\u793A\u3002",
  analyticsChartSpend: "\u91D1\u989D",
  analyticsChartTokens: "Token",
  analyticsKicker: "OpenCode Console",
  analyticsModel: "\u6A21\u578B",
  analyticsCost: "\u82B1\u8D39",
  analyticsShare: "\u5360\u6BD4",
  analyticsCacheHit: "\u7F13\u5B58\u547D\u4E2D",
  analyticsDailyAverage: "\u65E5\u5747",
  analyticsPeak: "\u5CF0\u503C",
  analyticsTotal: "\u5408\u8BA1",
  nav: "OpenCode Go",
  title: "OpenCode Go",
  titleLabel: "OpenCode Go",
  intro: "\u5206\u522B\u9009\u62E9\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684 OpenCode Go \u4E0E\u5E73\u53F0\u514D\u8D39\u6A21\u578B\uFF0C\u5E76\u8C03\u6574\u5176\u5BB9\u91CF\u3002",
  starProject: "\u559C\u6B22\u8FD9\u4E2A\u63D2\u4EF6\uFF1F\u53BB GitHub \u70B9\u4E2A Star",
  starProjectTitle: "\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00 GitHub \u9879\u76EE",
  enabledLabel: "\u542F\u7528 OpenCode Go \u4E0E Free",
  enabledHint: "\u5F00\u542F\u540E\u542F\u7528 Free \u8DEF\u7531\uFF1BGo \u8DEF\u7531\u8FD8\u9700\u8981\u53EF\u7528\u7684 API Key\u3002\u5173\u95ED\u540E\u7ACB\u5373\u64A4\u4E0B\u4E24\u4E2A\u8DEF\u7531\u3002",
  enabledOff: "OpenCode Go \u4E0E Free \u5DF2\u5173\u95ED\uFF1A\u4E24\u4E2A\u8DEF\u7531\u7684\u6A21\u578B\u5747\u5DF2\u4ECE\u9009\u62E9\u5668\u64A4\u4E0B\u3002",
  enabledUnavailable: "\u6B64\u90E8\u7F72\u5728\u7EC4\u5408\u5C42\u56FA\u5B9A\u5F00\u542F\u4E86\u8BE5\u5F00\u5173\uFF0C\u65E0\u6CD5\u5728\u6B64\u4FEE\u6539\u3002",
  keyLabel: "API key",
  keyHint: "\u6765\u81EA\u4F60\u7684 OpenCode Go \u8BA2\u9605\uFF08opencode.ai\uFF09\u3002\u7559\u7A7A\u8868\u793A\u4FDD\u6301\u5DF2\u4FDD\u5B58\u7684 key\uFF1B\u4FDD\u5B58\u540E\u4E0B\u4E00\u6B21\u8BF7\u6C42\u5373\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u3002",
  keyConfigured: "\u5DF2\u914D\u7F6E key",
  keyMissing: "\u5C1A\u672A\u914D\u7F6E",
  keyNotWritable: "\u8BE5 key \u7531\u8BBE\u7F6E\u6587\u6863\u4E4B\u5916\u7684\u6765\u6E90\u63D0\u4F9B\uFF08\u4F8B\u5982\u73AF\u5883\u53D8\u91CF\uFF09\uFF0C\u65E0\u6CD5\u5728\u6B64\u4FEE\u6539\u3002",
  modelsLabel: "\u53EF\u7528\u6A21\u578B",
  modelSourcesLabel: "\u6A21\u578B\u6765\u6E90",
  modelsGoTab: "OpenCode Go",
  modelsFreeTab: "\u514D\u8D39\u6A21\u578B",
  modelsGoSource: "Go \u6A21\u578B\u6E90",
  modelsFreeSource: "Free \u6A21\u578B\u6E90",
  modelsRefresh: "\u5237\u65B0",
  modelsLoading: "\u6B63\u5728\u8BFB\u53D6\u7F51\u5173\u6A21\u578B\u5217\u8868\u2026",
  modelsFailed: "\u672A\u80FD\u8BFB\u53D6\u7F51\u5173\u6A21\u578B\u5217\u8868\u3002",
  modelsStale: "\u90E8\u5206\u6A21\u578B\u6570\u636E\u5237\u65B0\u5931\u8D25\uFF0C\u6B63\u5728\u7EE7\u7EED\u4F7F\u7528\u53EF\u7528\u7684\u7F13\u5B58\u914D\u7F6E\uFF1B\u4F1A\u8BDD\u9009\u62E9\u5668\u4E5F\u4F7F\u7528\u8FD9\u4EFD\u6570\u636E\u3002",
  modelsSourceFailed: "\u5237\u65B0\u5931\u8D25",
  modelsSourceCurrent: "\u5DF2\u66F4\u65B0",
  modelsSourceNeverFetched: "\u5C1A\u672A\u6210\u529F\u83B7\u53D6",
  modelsSourceUpdated: "\u4E0A\u6B21\u6210\u529F\u68C0\u67E5\uFF1A{time}",
  modelsRefreshing: "\u6B63\u5728\u5237\u65B0\uFF0C\u6682\u65F6\u4FDD\u7559\u4E0A\u6B21\u83B7\u53D6\u7684\u6A21\u578B\u3002",
  modelsRefreshingShort: "\u66F4\u65B0\u4E2D\u2026",
  modelsEmpty: "\u7F51\u5173\u5F53\u524D\u6CA1\u6709\u672C\u9002\u914D\u5668\u53EF\u8DEF\u7531\u7684\u6A21\u578B\u3002",
  limitsLabel: "\u6A21\u578B\u5BB9\u91CF",
  limitsHint: "\u5BB9\u91CF\u6765\u81EA\u5728\u7EBF\u6A21\u578B\u914D\u7F6E\uFF1B\u7559\u7A7A\u7528\u9ED8\u8BA4\u503C\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002",
  limitsFilterLabel: "\u67E5\u627E\u6A21\u578B",
  limitsFilterPlaceholder: "\u6309\u6A21\u578B\u540D\u79F0\u6216 ID \u641C\u7D22\u2026",
  limitsSummary: "{count} \u4E2A\u5DF2\u81EA\u5B9A\u4E49",
  limitsModel: "\u6A21\u578B",
  limitsContext: "\u4E0A\u4E0B\u6587\u7A97\u53E3",
  limitsOutput: "\u6700\u5927\u8F93\u51FA",
  thinkingBudgets: "\u601D\u8003\u9884\u7B97",
  thinkingBudgetsHint: "\u6DFB\u52A0 token \u9884\u7B97\u5E76\u4FDD\u5B58\uFF0C\u5373\u53EF\u5728\u4F1A\u8BDD\u4E2D\u9009\u62E9\u3002\u8303\u56F4\uFF1A{min}\u2013{max} tokens\u3002\u4FDD\u7559\u539F\u6709\u601D\u8003\u9009\u9879\uFF1B\u201C\u9ED8\u8BA4\u201D\u4F7F\u7528\u670D\u52A1\u5546\u8BBE\u7F6E\u3002SDK \u4F1A\u6309\u5269\u4F59\u8F93\u51FA\u7A7A\u95F4\u7F29\u5C0F\u9884\u7B97\uFF0C\u4E3A\u56DE\u7B54\u7559\u51FA\u7A7A\u95F4\u3002",
  thinkingBudgetAddLabel: "\u4E3A {name} \u6DFB\u52A0\u601D\u8003\u9884\u7B97",
  thinkingBudgetAdd: "\u6DFB\u52A0",
  thinkingBudgetRemove: "\u79FB\u9664 {value} token \u9884\u7B97",
  capacityDefault: "\u9ED8\u8BA4\uFF1A{value} tokens",
  capacityDefaultCapped: "\u9ED8\u8BA4\uFF1A{value} tokens\uFF08\u6A21\u578B\u4E0A\u9650\uFF1A{max} tokens\uFF09",
  capacityMissing: "API \u672A\u63D0\u4F9B",
  modalityLabel: "\u8F93\u5165\u6A21\u6001",
  modalityText: "\u6587\u672C",
  modalityImage: "\u56FE\u50CF",
  modalityAudio: "\u97F3\u9891",
  modalityVideo: "\u89C6\u9891",
  modalityPdf: "PDF",
  modalityUnknown: "\u672A\u58F0\u660E",
  modalitiesSource: "\u8F93\u5165\u6A21\u6001\u6765\u81EA /models \u7684\u5728\u7EBF\u914D\u7F6E\u3002",
  modalitiesForwarding: "\u672C\u63D2\u4EF6\u76EE\u524D\u4EC5\u8F6C\u6362\u5E76\u8F6C\u53D1\u56FE\u50CF\u9644\u4EF6\u3002",
  visibilityHint: "\u6A21\u578B\u5F00\u5173\u7ACB\u5373\u751F\u6548\uFF0C\u5BB9\u91CF\u8C03\u6574\u540E\u4FDD\u5B58\u3002",
  modelVisibleLabel: "\u5728\u4F1A\u8BDD\u4E2D\u663E\u793A {name}",
  configurationMissing: "\u914D\u7F6E\u7F3A\u5931",
  configurationMissingHint: "\u7F51\u5173\u5DF2\u5217\u51FA\u6B64\u6A21\u578B\uFF0C\u4F46\u6682\u672A\u83B7\u5F97\u53EF\u7528\u7684 OpenCode Go \u914D\u7F6E\u3002\u4E0A\u6E38\u8865\u9F50\u6216\u4FEE\u6B63\u914D\u7F6E\u540E\uFF0C\u5237\u65B0\u5217\u8868\u5373\u53EF\u5F00\u542F\u3002",
  configurationUnavailable: "\u914D\u7F6E\u6682\u4E0D\u53EF\u7528",
  pickerFailed: "\u6A21\u578B\u663E\u793A\u8BBE\u7F6E\u672A\u66F4\u65B0\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  deprecatedBadge: "\u5DF2\u5F03\u7528",
  deprecatedHint: "/models \u6807\u8BB0\u4E3A\u5DF2\u5F03\u7528\uFF0C\u5F53\u524D\u7F51\u5173\u4ECD\u63D0\u4F9B\u6B64\u6A21\u578B\u3002",
  newHint: "\u4F9D\u636E /models \u53D1\u5E03\u65E5\u671F\uFF0C\u8FD1\u4E03\u4E2A UTC \u65E5\u5386\u65E5\u5185\u53D1\u5E03\u3002",
  newBadge: "\u65B0",
  releaseSource: "\u53D1\u5E03\u65E5\u671F\uFF1A{date} \xB7 /models",
  modelDetails: "\u6A21\u578B\u914D\u7F6E",
  filterLabel: "\u7B5B\u9009\u6A21\u578B",
  filterAll: "\u5168\u90E8",
  filterNew: "\u8FD1 7 \u5929\u53D1\u5E03",
  filterCustom: "\u5DF2\u81EA\u5B9A\u4E49",
  filterDeprecated: "\u8FC7\u65F6\u6A21\u578B",
  limitsResetModel: "\u4F7F\u7528\u76EE\u5F55\u503C",
  limitsResetAll: "\u6E05\u9664\u5168\u90E8\u8986\u76D6",
  limitsNoMatches: "\u6CA1\u6709\u5339\u914D\u201C{query}\u201D\u7684\u6A21\u578B\u3002\u8BF7\u5C1D\u8BD5\u5176\u4ED6\u540D\u79F0\u6216 ID\u3002",
  limitsEmpty: "\u8BF7\u5148\u8BFB\u53D6\u6A21\u578B\u5217\u8868\uFF1B\u5BB9\u91CF\u6309\u7F51\u5173\u63D0\u4F9B\u7684\u6A21\u578B\u9010\u4E2A\u7F16\u8F91\u3002",
  limitsContextLabel: "{name} \u7684\u4E0A\u4E0B\u6587\u7A97\u53E3",
  limitsOutputLabel: "{name} \u7684\u6700\u5927\u8F93\u51FA",
  advancedResetAll: "\u6062\u590D\u53C2\u6570\u9ED8\u8BA4\u503C",
  advancedLabel: "\u9AD8\u7EA7\u8BBE\u7F6E",
  groupUsage: "\u7528\u91CF\u8BBE\u7F6E",
  usageAppearanceLabel: "\u989D\u5EA6\u5916\u89C2",
  usageAppearanceReset: "\u6062\u590D\u9ED8\u8BA4\u5916\u89C2",
  showSidebarQuotaLabel: "\u5728\u4FA7\u8FB9\u680F\u663E\u793A\u989D\u5EA6",
  showSidebarQuotaSummary: "\u5728\u4FA7\u8FB9\u680F\u67E5\u770B\u5404\u8D26\u53F7\u989D\u5EA6\uFF0C\u72EC\u7ACB\u4E8E\u8F93\u5165\u680F\u663E\u793A\u3002",
  showSidebarQuotaHint: "\u4FA7\u8FB9\u680F\u5C55\u5F00\u65F6\u663E\u793A\u989D\u5EA6\u5361\u7247\uFF0C\u6536\u8D77\u65F6\u663E\u793A\u56FE\u6807\u3002\u70B9\u51FB\u8D26\u53F7\u540D\u5FAA\u73AF\u67E5\u770B\u5404\u8D26\u53F7\u989D\u5EA6\uFF0C\u4E0D\u6539\u53D8\u8BF7\u6C42\u987A\u5E8F\uFF0C\u5E76\u5728\u672C\u673A\u8BB0\u4F4F\u67E5\u770B\u5BF9\u8C61\u3002\u5F00\u542F\u540E\u6BCF\u5206\u949F\u5237\u65B0\uFF0C\u72EC\u7ACB\u4E8E\u8F93\u5165\u680F\u989D\u5EA6\u663E\u793A\u3002",
  usagePillStyleLabel: "\u8F93\u5165\u680F\u989D\u5EA6\u6837\u5F0F",
  usagePillStyleHint: "\u9009\u62E9\u5E26\u8FB9\u6846\u7684\u5FBD\u7AE0\uFF0C\u6216\u65E0\u8FB9\u6846\u900F\u660E\u7684\u7CBE\u7B80\u989D\u5EA6\u6837\u5F0F\u3002",
  usagePillStylePreviewHint: "\u4E0B\u65B9\u4E3A\u793A\u4F8B\u989D\u5EA6\uFF0C\u4FDD\u5B58\u540E\u5E94\u7528\u6240\u9009\u6837\u5F0F\u3002",
  usagePillStyle_badge: "\u5FBD\u7AE0\uFF08\u9ED8\u8BA4\uFF09",
  usagePillStyle_plain: "\u7CBE\u7B80",
  groupConnection: "\u8FDE\u63A5",
  groupCacheTimeouts: "\u7F13\u5B58\u4E0E\u8D85\u65F6",
  groupImages: "\u56FE\u7247\u5904\u7406",
  advancedHint: "\u7EE7\u627F\u6765\u7684\u53D6\u503C\u5373\u53EF\u6B63\u5E38\u4F7F\u7528\uFF1B\u4E0B\u9762\u53EA\u5217\u9700\u8981\u6539\u7684\u9879\u3002",
  usageDisplayLabel: "\u989D\u5EA6\u663E\u793A",
  usageDisplayHint: "\u81EA\u52A8\uFF1A\u4EC5\u9009\u4E2D DSH OpenCode Go \u6A21\u578B\u65F6\u663E\u793A\u8F93\u5165\u680F\u989D\u5EA6\uFF1B\u5E38\u9A7B\uFF1A\u4EFB\u610F\u6A21\u578B\u90FD\u663E\u793A\uFF1B\u5173\u95ED\uFF1A\u9690\u85CF\u8F93\u5165\u680F\u989D\u5EA6\u5E76\u505C\u6B62\u5176\u5237\u65B0\u3002\u663E\u793A\u65F6\u6BCF\u5206\u949F\u5237\u65B0\u3002\u4FA7\u8FB9\u680F\u989D\u5EA6\u4F7F\u7528\u72EC\u7ACB\u5F00\u5173\u3002",
  usageDisplay_auto: "\u81EA\u52A8\uFF08\u9ED8\u8BA4\uFF09",
  usageDisplay_always: "\u5E38\u9A7B",
  usageDisplay_off: "\u5173\u95ED",
  freeBaseURLLabel: "\u514D\u8D39\u7F51\u5173\u5730\u5740",
  freeBaseURLHint: "\u53D1\u73B0\u5DF2\u660E\u786E\u58F0\u660E\u6587\u672C\u3001\u7F13\u5B58\u53CA\u9636\u68AF\u4EF7\u683C\u5168\u4E3A\u96F6\u7684\u5E73\u53F0\u804A\u5929\u6A21\u578B\u3002\u672A\u914D\u7F6E\u53EF\u7528 Key \u65F6\u4F7F\u7528\u516C\u5171\u8BBF\u95EE\u3002",
  baseURLLabel: "Go \u7F51\u5173\u5730\u5740",
  baseURLHint: "\u5B98\u65B9 Go \u7F51\u5173\u81EA\u52A8\u9009\u62E9\u6A21\u578B\u5BF9\u5E94\u7684\u534F\u8BAE\u7AEF\u70B9\uFF1B\u81EA\u5B9A\u4E49\u7F51\u5173\u4F7F\u7528\u586B\u5199\u7684\u8BF7\u6C42\u524D\u7F00\u3002",
  proxyURLLabel: "\u4EE3\u7406\u5730\u5740",
  proxyURLHint: "\u5BF9\u8BDD\u3001\u76EE\u5F55\u5237\u65B0\u4E0E\u7528\u91CF\u67E5\u8BE2\u4F7F\u7528\u7684 HTTP(S)/SOCKS5 \u4EE3\u7406\uFF1B\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u7F51\u7EDC\u3002",
  proxyURLInvalid: "\u8BF7\u8F93\u5165 http://\u3001https:// \u6216 socks5:// \u4EE3\u7406\u5730\u5740\uFF0C\u4E0D\u5305\u542B\u8DEF\u5F84\u3001\u67E5\u8BE2\u53C2\u6570\u6216\u7247\u6BB5\u3002",
  refreshMinutesLabel: "\u76EE\u5F55\u5237\u65B0\uFF08\u5206\u949F\uFF09",
  refreshMinutesHint: "\u6A21\u578B\u76EE\u5F55\u7684\u7F13\u5B58\u65F6\u957F\uFF1B\u6253\u5F00\u672C\u9875\u6216\u70B9\u51FB\u5237\u65B0\u4F1A\u7ACB\u5373\u91CD\u65B0\u6838\u5BF9\u3002",
  streamIdleTimeoutMsLabel: "\u6D41\u7A7A\u95F2\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
  streamIdleTimeoutMsHint: "\u6D41\u4E8B\u4EF6\u4E4B\u95F4\u7684\u6700\u5927\u9759\u9ED8\u95F4\u9694\uFF0C\u8D85\u51FA\u5219\u8BF7\u6C42\u5931\u8D25\u3002",
  maxImagesLabel: "\u8BF7\u6C42\u56FE\u7247\u6570\u91CF\u4E0A\u9650\uFF08maxImages\uFF09",
  maxImagesHint: "\u7559\u7A7A\u7EE7\u627F\u57FA\u7840\u914D\u7F6E\uFF08\u57FA\u7840\u672A\u8BBE\u4E0A\u9650\u65F6\u624D\u4E0D\u9650\u5236\u5F20\u6570\uFF09\uFF1B\u8D85\u9650\u65F6\u6700\u65E7\u7684\u56FE\u7247\u4F1A\u88AB\u66FF\u6362\u4E3A\u6587\u5B57\u5360\u4F4D\u3002",
  maxRequestImageBytesLabel: "\u8BF7\u6C42\u56FE\u7247\u8F7D\u8377\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
  maxRequestImageBytesHint: "\u5355\u4E2A\u8BF7\u6C42\u7D2F\u8BA1 base64 \u56FE\u7247\u8F7D\u8377\u7684\u4E0A\u9650\u3002",
  requestImagePixelBudgetLabel: "\u56FE\u7247\u50CF\u7D20\u9884\u7B97",
  requestImagePixelBudgetHint: "\u5355\u5F20\u56FE\u7247\u8F6C\u6362\u540E\u7684\u603B\u50CF\u7D20\u9884\u7B97\u3002",
  requestImageMaxBytesLabel: "\u56FE\u7247\u5B57\u8282\u76EE\u6807\uFF08\u5B57\u8282\uFF09",
  requestImageMaxBytesHint: "\u5355\u5F20\u56FE\u7247 base64 \u6269\u5C55\u524D\u7684\u539F\u59CB\u7F16\u7801\u5B57\u8282\u76EE\u6807\u3002",
  overridden: "\u5DF2\u81EA\u5B9A\u4E49",
  reset: "\u6062\u590D\u9ED8\u8BA4",
  invalidValue: "\u4E0D\u662F\u6709\u6548\u503C",
  save: "\u4FDD\u5B58",
  discard: "\u653E\u5F03",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  savedFailed: "\u4E0A\u6B21\u4FDD\u5B58\u672A\u6309\u8349\u7A3F\u751F\u6548\uFF1B\u8BF7\u4FEE\u6B63\u6570\u503C\u6216\u653E\u5F03\u4FEE\u6539\u3002",
  readOnly: "\u6B64\u90E8\u7F72\u4E2D\u8BBE\u7F6E\u6587\u6863\u4E3A\u53EA\u8BFB\u3002",
  unavailable: "\u6B64\u90E8\u7F72\u672A\u63D0\u4F9B OpenCode Go \u8BBE\u7F6E\u3002"
};
var GO_THEME_TOKENS = {
  dark: {
    bg: "#242422",
    surface: "#2d2c29",
    surface2: "#353430",
    border: "#49473f",
    text: "#eceae3",
    muted: "#b7b4a8",
    accent: "#e7a18a",
    accent2: "#b09a87",
    accentSoft: "#49342b",
    onAccent: "#382017",
    cacheRead: "#8f8678",
    cacheWrite: "#a5aa8c",
    shadow: "#00000040",
    success: "#9bc6a7",
    warning: "#d6b274",
    danger: "#e6a09c"
  },
  light: {
    bg: "#faf9f5",
    surface: "#fffefb",
    surface2: "#f0eee7",
    border: "#dedbd2",
    text: "#30312e",
    muted: "#6b6a61",
    accent: "#a94e35",
    accent2: "#9f8b78",
    accentSoft: "#f5e7df",
    onAccent: "#ffffff",
    cacheRead: "#b1a394",
    cacheWrite: "#858c6b",
    shadow: "#28261b18",
    success: "#38654c",
    warning: "#8c6526",
    danger: "#a83e42"
  }
};
function useHostScheme() {
  const [scheme, setScheme] = (0, import_react.useState)(() => typeof document === "undefined" || document.body?.hasAttribute("data-ds-dark-theme") ? "dark" : "light");
  (0, import_react.useEffect)(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (body === null) return;
    const update = () => {
      setScheme(body.hasAttribute("data-ds-dark-theme") ? "dark" : "light");
    };
    update();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(update);
    observer.observe(body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
    return () => {
      observer.disconnect();
    };
  }, []);
  return scheme;
}
function useGoThemeTokens() {
  const scheme = useHostScheme();
  return GO_THEME_TOKENS[scheme];
}
function themeStyle(tokens) {
  return {
    "--go-bg": tokens.bg,
    "--go-surface": tokens.surface,
    "--go-surface-2": tokens.surface2,
    "--go-border": tokens.border,
    "--go-text": tokens.text,
    "--go-muted": tokens.muted,
    "--go-accent": tokens.accent,
    "--go-accent-2": tokens.accent2,
    "--go-accent-soft": tokens.accentSoft,
    "--go-on-accent": tokens.onAccent,
    "--go-cache-read": tokens.cacheRead,
    "--go-cache-write": tokens.cacheWrite,
    "--go-shadow": tokens.shadow,
    "--go-success": tokens.success,
    "--go-warning": tokens.warning,
    "--go-danger": tokens.danger,
    "--go-font": '"Anthropic Sans Web", "Anthropic Sans", "Styrene B", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    "--go-display-font": '"Anthropic Serif Web", "Anthropic Serif", "Tiempos Text", Charter, "Songti SC", "Noto Serif SC", SimSun, Georgia, serif',
    "--go-number-font": '"Anthropic Mono Web", "Anthropic Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace'
  };
}

// src/engines/opencode-go/client/Section.tsx
var import_react2 = require("react");

// src/engines/opencode-go/client/controller.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
var TEXT_FIELDS = [
  "usageDisplay",
  "usagePillStyle",
  "showSidebarQuota",
  "baseURL",
  "freeBaseURL",
  "proxyURL",
  "refreshMinutes",
  "streamIdleTimeoutMs",
  "maxImages",
  "maxRequestImageBytes",
  "requestImagePixelBudget",
  "requestImageMaxBytes"
];
var editableKeys = [...TEXT_FIELDS, "modelLimits"];
function formatField(field, value) {
  if (field === "usageDisplay") return typeof value === "string" ? value : DEFAULT_USAGE_DISPLAY;
  if (field === "usagePillStyle") return typeof value === "string" ? value : DEFAULT_USAGE_PILL_STYLE;
  if (field === "showSidebarQuota") return String(value === true);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function parseField(field, text2) {
  if (field === "usageDisplay") return USAGE_DISPLAY_MODES.some((mode) => mode === text2) ? { kind: "set", value: text2 } : void 0;
  if (field === "usagePillStyle") return USAGE_PILL_STYLES.some((style) => style === text2) ? { kind: "set", value: text2 } : void 0;
  if (field === "showSidebarQuota") return text2 === "true" || text2 === "false" ? { kind: "set", value: text2 === "true" } : void 0;
  const trimmed = text2.trim();
  if (field === "proxyURL") {
    try {
      assertProxyURL(trimmed);
      return { kind: "set", value: trimmed };
    } catch {
      return void 0;
    }
  }
  if (!trimmed) return { kind: "clear" };
  if (field === "baseURL" || field === "freeBaseURL") {
    try {
      const url = new URL(trimmed);
      return ["http:", "https:"].includes(url.protocol) && !url.search && !url.hash ? { kind: "set", value: trimmed } : void 0;
    } catch {
      return void 0;
    }
  }
  const value = Number(trimmed);
  return Number.isFinite(value) && (field !== "maxImages" || Number.isSafeInteger(value) && value > 0) ? { kind: "set", value } : void 0;
}
function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const l = left, r = right;
  const keys = Object.keys(l);
  return keys.length === Object.keys(r).length && keys.every((key) => Object.hasOwn(r, key) && sameValue(l[key], r[key]));
}
function modelsForSource(models, source) {
  if (models.status !== "ready") return models;
  const entries = models.entries.filter((model) => (model.source ?? "go") === source);
  const status = models.sources?.[source];
  return {
    ...models,
    entries,
    count: entries.length,
    preview: entries.map((model) => model.name ?? model.id),
    ...status === void 0 ? {} : { stale: status.error !== void 0, message: status.error }
  };
}
function operationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
var OpencodeGoSectionController = class {
  constructor(scope, ctx, readModels = async () => {
    return ctx.remote.opencodeGoModels.read();
  }, readUsage = async (ref) => {
    const result = await ctx.remote.opencodeGoUsage.readAccount(ref);
    if (!result.ok) throw result.error;
    return result.value;
  }, executeAccountCommand = async (command) => {
    const result = await ctx.remote.opencodeGoAccounts.execute(command);
    return result.ok ? result.value : "unknown";
  }) {
    this.scope = scope;
    this.ctx = ctx;
    this.readModels = readModels;
    this.readUsage = readUsage;
    this.executeAccountCommand = executeAccountCommand;
    this.syncAccounts();
    this.store = (0, import_dsh_client_store.createSnapshotStore)(this.projection());
    const endpoint = () => [scope.getSnapshot().value?.baseURL, scope.getSnapshot().value?.freeBaseURL, scope.getSnapshot().value?.proxyURL];
    let network = endpoint();
    this.unsubscribe = scope.subscribe(() => {
      this.syncAccounts();
      const next = endpoint();
      if (!sameValue(network, next)) {
        network = next;
        this.modelsRequest++;
        this.models = { status: "idle" };
      }
      this.publish();
    });
  }
  drafts = /* @__PURE__ */ new Map();
  store;
  unsubscribe;
  saving = false;
  failed = false;
  pickerSaving = false;
  pickerFailed = false;
  models = { status: "idle" };
  modelsRequest = 0;
  face;
  accountRows = /* @__PURE__ */ new Map();
  accountBusy = false;
  accountRefreshing = false;
  accountFailure;
  accountEpoch = 0;
  accountsIdentity = "";
  accountsLoaded = false;
  disposed = false;
  addition;
  dispose() {
    this.disposed = true;
    this.accountEpoch++;
    this.modelsRequest++;
    this.unsubscribe();
  }
  publish() {
    if (!this.disposed) this.store.set(this.projection());
  }
  blocked() {
    return this.saving || this.pickerSaving;
  }
  stored(field) {
    const user = this.scope.getSnapshot().user;
    return !!user && Object.hasOwn(user, field);
  }
  value(field) {
    const draft = this.drafts.get(field);
    if (draft?.kind === "limits") return draft.value;
    const snapshot = this.scope.getSnapshot();
    return draft?.kind === "clear" ? snapshot.base?.[field] : snapshot.value?.[field];
  }
  field(field) {
    const draft = this.drafts.get(field);
    const text2 = draft?.kind === "text" ? draft.text : formatField(field, this.value(field));
    const write = draft?.kind === "clear" ? { kind: "clear" } : parseField(field, text2);
    const changed = draft?.kind === "text" && text2 !== formatField(field, this.scope.getSnapshot().value?.[field]);
    return { text: text2, overridden: draft?.kind === "clear" ? false : changed ? write?.kind === "set" : this.stored(field), invalid: !!draft && !write };
  }
  plan() {
    const value = this.scope.getSnapshot().value;
    return [...this.drafts].flatMap(([field, draft]) => {
      if (draft.kind === "clear") return this.stored(field) ? [{ field, draft, write: { kind: "clear" } }] : [];
      if (draft.kind === "limits") return sameValue(draft.value, value?.modelLimits) ? [] : [{ field, draft, write: { kind: "set", value: draft.value } }];
      if (field === "modelLimits" || draft.text === formatField(field, value?.[field])) return [];
      return [{ field, draft, write: parseField(field, draft.text) }];
    });
  }
  projection() {
    const snapshot = this.scope.getSnapshot();
    const plan = this.plan();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: plan.length > 0,
      invalid: plan.some((item) => !item.write),
      saving: this.saving || this.accountBusy,
      failed: this.failed,
      accounts: this.accountState(),
      enabled: snapshot.value?.enabled ?? true,
      ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, this.field(field)])),
      modelVisibility: snapshot.value?.modelVisibility ?? {},
      pickerSaving: this.pickerSaving,
      pickerFailed: this.pickerFailed,
      models: this.models,
      modelLimits: { overridden: this.drafts.get("modelLimits")?.kind === "limits" || !this.drafts.has("modelLimits") && this.stored("modelLimits"), invalid: false },
      modelLimitDraft: modelLimitsOf(this.value("modelLimits"))
    };
  }
  edit(field, draft) {
    this.drafts.set(field, draft);
    this.failed = false;
    this.publish();
  }
  async save() {
    const plan = this.plan();
    if (!plan.length || this.blocked() || this.accountBusy || !this.scope.getSnapshot().writable || plan.some((item) => !item.write)) return;
    const revision = this.scope.getSnapshot().revision;
    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      const ops = plan.map(({ field, write }) => write.kind === "clear" ? { op: "unset", path: [field] } : { op: "set", path: [field], value: write.value });
      const accepted = await this.scope.mutate(ops, revision);
      this.failed = !accepted;
      if (accepted) {
        for (const { field, draft } of plan) if (this.drafts.get(field) === draft) this.drafts.delete(field);
      }
    } catch {
      this.failed = true;
    } finally {
      this.saving = false;
      this.publish();
    }
  }
  async setEnabled(next) {
    await this.writePickerSetting("enabled", next);
  }
  async setModelEnabled(id4, next) {
    if (this.models.status === "ready" && this.models.entries.some((model) => modelSettingsKey(model) === id4 && model.configurationMissing)) return;
    await this.writePickerSetting("modelVisibility", { ...this.scope.getSnapshot().value?.modelVisibility, [id4]: next });
  }
  async writePickerSetting(field, value) {
    if (this.blocked() || this.accountBusy || !this.scope.getSnapshot().writable) return;
    this.pickerSaving = true;
    this.pickerFailed = false;
    this.publish();
    try {
      this.pickerFailed = !await this.scope.set(field, value);
    } catch {
      this.pickerFailed = true;
    } finally {
      this.pickerSaving = false;
      this.publish();
    }
  }
  inject() {
    this.face ??= {
      hooks: { opencodeGo: this.store },
      loadModels: () => this.loadModels(),
      setEnabled: (next) => {
        void this.setEnabled(next);
      },
      setModelEnabled: (id4, next) => {
        void this.setModelEnabled(id4, next);
      },
      edit: (field, text2) => this.edit(field, { kind: "text", text: text2 }),
      editModelLimits: (value) => this.edit("modelLimits", { kind: "limits", value: structuredClone(value) }),
      resetField: (field) => this.edit(field, { kind: "clear" }),
      save: () => {
        void this.save();
      },
      discard: () => {
        this.drafts.clear();
        this.failed = false;
        this.publish();
      },
      ...this.accountActions()
    };
    return this.face;
  }
  loadModels() {
    const request = ++this.modelsRequest;
    const previous = this.models.status === "ready" ? this.models : void 0;
    this.models = previous ? { ...previous, refreshing: true } : { status: "loading" };
    this.publish();
    const failed = (message) => {
      this.models = previous ? { ...previous, refreshing: false, stale: true, message, sources: void 0 } : { status: "failed", message };
    };
    void this.readModels().then((response) => {
      if (request !== this.modelsRequest) return;
      if (!response.ok) failed(response.error.message);
      else if (response.value.stale && response.value.models.length === 0) {
        this.models = {
          status: "failed",
          ...response.value.error ? { message: response.value.error } : {},
          ...response.value.sources ? { sources: response.value.sources } : {}
        };
      } else {
        this.models = {
          status: "ready",
          count: response.value.models.length,
          preview: response.value.models.map((model) => model.name ?? model.id),
          entries: response.value.models,
          stale: response.value.stale,
          ...response.value.sources ? { sources: response.value.sources } : {},
          ...response.value.error ? { message: response.value.error } : {}
        };
      }
      this.publish();
    }).catch((error) => {
      if (request !== this.modelsRequest) return;
      failed(error instanceof Error ? error.message : String(error));
      this.publish();
    });
  }
  accountState() {
    const config = this.scope.getSnapshot().value ?? {};
    return {
      entries: accountsOf(config).map((account) => ({ ...this.accountRows.get(account.apiKeyEnv), ...account })),
      activeRef: accountRefOf(config),
      autoSwitch: config.autoSwitch === true,
      busy: this.accountBusy,
      blocked: this.blocked(),
      refreshing: this.accountRefreshing,
      failure: this.accountFailure
    };
  }
  syncAccounts() {
    const config = this.scope.getSnapshot().value ?? {};
    const identity = JSON.stringify([
      accountsOf(config).map((account) => [account.id, account.apiKeyEnv]).sort((left, right) => left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0),
      config.baseURL,
      config.proxyURL
    ]);
    if (identity === this.accountsIdentity) return;
    this.accountsIdentity = identity;
    this.accountEpoch++;
    this.accountRows.clear();
    this.accountRefreshing = false;
    if (this.accountsLoaded) void this.refreshAccounts();
  }
  refreshCredential(ref) {
    if (!accountsOf(this.scope.getSnapshot().value ?? {}).some((account) => account.apiKeyEnv === ref)) return;
    this.accountEpoch++;
    this.accountRows.delete(ref);
    this.publish();
    if (this.accountsLoaded) void this.refreshAccounts();
  }
  async refreshAccounts() {
    this.accountsLoaded = true;
    const epoch = ++this.accountEpoch;
    const accounts = [...accountsOf(this.scope.getSnapshot().value ?? {})];
    this.accountRefreshing = true;
    this.publish();
    try {
      const described = await this.ctx.remote.credentials.describe(accounts.map((account) => account.apiKeyEnv));
      if (this.disposed || epoch !== this.accountEpoch) return;
      if (!described.ok) {
        this.accountFailure = "read";
        this.markUnreadable(accounts, described.error instanceof Error ? described.error.message : String(described.error));
        return;
      }
      this.accountFailure = void 0;
      await Promise.all(accounts.map(async (account) => {
        const ref = account.apiKeyEnv;
        const info = described.value[ref];
        const previous = this.accountRows.get(ref);
        this.accountRows.set(ref, {
          ...previous,
          ...account,
          configured: info?.configured ?? false,
          writable: info?.writable ?? true,
          loading: info?.configured === true,
          failed: false
        });
        this.publish();
        if (!info?.configured) {
          this.accountRows.set(ref, { ...account, configured: false, writable: info?.writable ?? true });
          return;
        }
        try {
          const usage = await this.readUsage(ref);
          if (this.disposed || epoch !== this.accountEpoch) return;
          this.accountRows.set(ref, { ...account, configured: true, writable: info.writable, usage, updatedAt: Date.now() });
        } catch (error) {
          if (this.disposed || epoch !== this.accountEpoch) return;
          const details = error && typeof error === "object" && "code" in error && error.code === "opencode-go/usage-unavailable" && "details" in error && error.details && typeof error.details === "object" ? error.details : void 0;
          const retain = details?.retryable === true && details.retainPrevious === true && previous?.usage?.source && previous.usage.source === details.source;
          const message = error instanceof Error ? error.message : String(error);
          this.accountRows.set(ref, {
            ...account,
            configured: true,
            writable: info.writable,
            failed: true,
            problem: message.length > 512 ? message.slice(0, 512) + "\u2026" : message,
            ...retain ? { usage: previous.usage, updatedAt: previous.updatedAt, stale: true } : {}
          });
        }
        this.publish();
      }));
    } catch (error) {
      if (epoch === this.accountEpoch) {
        this.accountFailure = "read";
        this.markUnreadable(accounts, error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!this.disposed && epoch === this.accountEpoch) {
        this.accountRefreshing = false;
        this.publish();
      }
    }
  }
  /** Mark every account row as unreadable with the Host's own diagnostic. */
  markUnreadable(accounts, message) {
    const problem = message.length > 200 ? message.slice(0, 200) + "\u2026" : message;
    for (const account of accounts) this.accountRows.set(account.apiKeyEnv, { ...account, failed: true, problem });
    this.publish();
  }
  accountActions() {
    const command = (request) => this.executeAccountCommand(request).then((status) => status === "applied");
    return {
      loadAccounts: () => {
        void this.refreshAccounts();
      },
      resetAddition: () => {
        this.addition = void 0;
      },
      addAccount: (name, key) => this.runAccountAction(async () => {
        if (!name.trim() || name.trim().length > 80 || !key.trim()) return false;
        if (this.addition?.name !== name.trim()) this.addition = { name: name.trim(), id: operationId() };
        const accepted = await command({ kind: "add", id: this.addition.id, name, key });
        if (accepted) this.addition = void 0;
        return accepted;
      }),
      renameAccount: (ref, name) => this.runAccountAction(() => command({ kind: "rename", ref, name })),
      removeAccount: (ref) => this.runAccountAction(async () => {
        const accepted = await command({ kind: "remove", ref });
        if (!accepted) this.accountFailure = "remove";
        return accepted;
      }),
      selectAccount: (ref) => this.runAccountAction(() => command({ kind: "select", ref })),
      setAutoSwitch: (value) => this.runAccountAction(() => command({ kind: "auto-switch", value })),
      replaceAccountKey: (ref, key) => this.runAccountAction(async () => {
        if (!key.trim() || this.accountRows.get(ref)?.writable === false) return false;
        const accepted = await command({ kind: "replace-key", ref, key });
        if (accepted) this.refreshCredential(ref);
        return accepted;
      }, false),
      moveAccount: (ref, toIndex) => this.runAccountAction(() => command({ kind: "move", ref, toIndex }))
    };
  }
  async runAccountAction(action, requiresSettings = true) {
    if (this.accountBusy || this.blocked() || requiresSettings && !this.scope.getSnapshot().writable) return false;
    this.accountBusy = true;
    this.accountFailure = void 0;
    this.publish();
    try {
      const accepted = await action();
      if (!accepted && !this.accountFailure) this.accountFailure = "write";
      return accepted;
    } catch {
      this.accountFailure ??= "write";
      return false;
    } finally {
      this.accountBusy = false;
      this.publish();
    }
  }
};
function modelLimitsOf(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const limits = {};
  for (const [id4, entry] of Object.entries(value)) {
    if (entry === null) {
      limits[id4] = null;
      continue;
    }
    if (typeof entry !== "object" || Array.isArray(entry)) continue;
    const fields = entry;
    const limit = {};
    if (fields.contextWindow === null) limit.contextWindow = null;
    if (fields.maxTokens === null) limit.maxTokens = null;
    if (fields.thinkingBudgets === null) limit.thinkingBudgets = null;
    if (Array.isArray(fields.thinkingBudgets) && fields.thinkingBudgets.length <= 16 && fields.thinkingBudgets.every((value2) => typeof value2 === "number" && Number.isSafeInteger(value2) && value2 > 0)) {
      limit.thinkingBudgets = fields.thinkingBudgets;
    }
    if (typeof fields.contextWindow === "number" && Number.isSafeInteger(fields.contextWindow) && fields.contextWindow > 0) {
      limit.contextWindow = fields.contextWindow;
    }
    if (typeof fields.maxTokens === "number" && Number.isSafeInteger(fields.maxTokens) && fields.maxTokens > 0) {
      limit.maxTokens = fields.maxTokens;
    }
    if (limit.contextWindow !== void 0 || limit.maxTokens !== void 0 || limit.thinkingBudgets !== void 0) limits[id4] = limit;
  }
  return limits;
}

// src/engines/opencode-go/client/Section.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function HintMark(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: props.hint, side: "bottom", maxWidth: 280, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: Section_default.info, "aria-label": props.hint, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconQuestionOutlineRegular, {}) }) }) });
}
function HintText(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: props.id, className: Section_default.visuallyHidden, children: props.hint });
}
var WINDOWS = ["rolling", "weekly", "monthly"];
var TICKS = [25, 50, 75];
function resetText(resetsAt, t) {
  const remaining = Date.parse(resetsAt) - Date.now();
  if (!Number.isFinite(remaining)) return t("usageResetUnknown");
  if (remaining <= 0) return t("usageResetDue");
  const minutes = Math.max(1, Math.round(remaining / 6e4));
  if (minutes < 60) return t("usageResetMinutes", { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("usageResetHours", { hours });
  return t("usageResetDays", { days: Math.round(hours / 24) });
}
function barLevel(window) {
  if (window.status === "rate-limited" || window.percent >= 100) return "limited";
  return window.percent >= 80 ? "high" : "ok";
}
function stampText(at, locale) {
  const date = new Date(at);
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? time : `${date.toLocaleDateString(locale)} ${time}`;
}
function GripIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "10", height: "14", viewBox: "0 0 10 14", fill: "currentColor", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "2.5", cy: "2.5", r: "1.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "7.5", cy: "2.5", r: "1.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "2.5", cy: "7", r: "1.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "7.5", cy: "7", r: "1.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "2.5", cy: "11.5", r: "1.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "7.5", cy: "11.5", r: "1.3" })
  ] });
}
function slotAt(container, clientY) {
  const rows = container.querySelectorAll("[data-account-row]");
  for (let index = 0; index < rows.length; index++) {
    const box = rows[index].getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return index;
  }
  return rows.length;
}
function AccountsCard({ state, actions, writable, t, locale }) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [details, setDetails] = (0, import_react2.useState)(null);
  const [dragging, setDragging] = (0, import_react2.useState)(null);
  const [dropAt, setDropAt] = (0, import_react2.useState)(null);
  const [editor, setEditor] = (0, import_react2.useState)(null);
  const [name, setName] = (0, import_react2.useState)("");
  const [key, setKey] = (0, import_react2.useState)("");
  const disabled = state.busy || state.blocked || !writable;
  const total = state.entries.length;
  const ready = state.entries.filter((entry) => entry.configured === true).length;
  const unreadable = state.entries.filter((entry) => entry.failed === true).length;
  const preferred = state.entries.find((entry) => entry.apiKeyEnv === state.activeRef);
  const reorderable = !disabled && total > 1;
  const draggingFrom = dragging === null ? -1 : state.entries.findIndex((entry) => entry.apiKeyEnv === dragging);
  const noopSlot = draggingFrom >= 0 && (dropAt === draggingFrom || dropAt === draggingFrom + 1);
  const markAt = (index) => {
    if (!reorderable || dropAt === null || noopSlot) return void 0;
    if (dropAt === index) return "before";
    return dropAt === total && index === total - 1 ? "after" : void 0;
  };
  const updatedAt = state.entries.reduce((latest, entry) => Math.max(latest, entry.updatedAt ?? 0), 0);
  (0, import_react2.useEffect)(() => {
    actions.loadAccounts();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") actions.loadAccounts();
    }, 6e4);
    return () => {
      clearInterval(timer);
    };
  }, [actions.loadAccounts]);
  const start = (next, label = "") => {
    if (next.kind === "add") actions.resetAddition?.();
    setEditor(next);
    setName(label);
    setKey("");
  };
  const cancel = () => {
    if (editor?.kind === "add") actions.resetAddition?.();
    setEditor(null);
    setName("");
    setKey("");
  };
  (0, import_react2.useEffect)(() => {
    if (editor?.ref != null && !state.entries.some((entry) => entry.apiKeyEnv === editor.ref)) cancel();
  }, [state.entries, editor]);
  (0, import_react2.useEffect)(() => {
    if (dragging !== null && !state.entries.some((entry) => entry.apiKeyEnv === dragging)) {
      setDragging(null);
      setDropAt(null);
    }
  }, [state.entries, dragging]);
  const submit = async () => {
    if (!editor) return;
    const accepted = editor.kind === "add" ? await actions.addAccount(name, key) : editor.kind === "rename" ? await actions.renameAccount(editor.ref, name) : editor.kind === "key" ? await actions.replaceAccountKey(editor.ref, key) : await actions.removeAccount(editor.ref);
    if (accepted) cancel();
  };
  const move = (ref, toIndex) => {
    void actions.moveAccount(ref, toIndex);
  };
  const summary = total ? t("accountsSummary", { count: total, name: preferred ? preferred.name || t("accountDefault") : "" }) : t("accountsSummaryEmpty");
  const editorTitle = (kind) => t(kind === "add" ? "accountAdd" : kind === "rename" ? "accountRename" : kind === "key" ? "accountReplaceKey" : "accountRemove");
  const editorForm = (label = "") => editor ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "form",
    {
      className: Section_default.accountEditor,
      onSubmit: (event) => {
        event.preventDefault();
        void submit();
      },
      onKeyDown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.accountEditorHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.accountEditorTitle, children: editorTitle(editor.kind) }),
          label ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.accountEditorFor, children: label }) : null
        ] }),
        editor.kind === "remove" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("accountRemoveHint", { name }) }) : null,
        editor.kind === "add" || editor.kind === "rename" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: Section_default.accountField, children: [
          t("accountName"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: Section_default.input,
              value: name,
              maxLength: 80,
              required: true,
              disabled: state.busy,
              autoFocus: true,
              onChange: (event) => {
                setName(event.target.value);
              }
            }
          )
        ] }) : null,
        editor.kind === "add" || editor.kind === "key" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: Section_default.accountField, children: [
            t("keyLabel"),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: Section_default.input,
                type: "password",
                autoComplete: "off",
                value: key,
                required: true,
                disabled: state.busy,
                autoFocus: true,
                onChange: (event) => {
                  setKey(event.target.value);
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("accountKeyHint") })
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.accountEditorActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Button,
            {
              variant: "primary",
              size: "sm",
              type: "submit",
              disabled: editor.kind === "key" ? state.busy || state.blocked : disabled,
              children: t(state.busy ? "saving" : "accountConfirm")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", type: "button", disabled: state.busy, onClick: cancel, children: t("accountCancel") })
        ] })
      ]
    }
  ) : null;
  const detail = (account, label) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.accountDetail, children: [
    account.usage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.accountUsage, children: WINDOWS.map((window) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        t(`usage_${window}`),
        " \xB7 ",
        account.usage[window].percent,
        "%"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "progress",
        {
          "data-level": barLevel(account.usage[window]),
          max: 100,
          value: Math.min(100, account.usage[window].percent),
          "aria-label": `${label} ${t(`usage_${window}`)}`
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.hint, children: [
        t("usageResets"),
        " ",
        new Date(account.usage[window].resetsAt).toLocaleString(locale)
      ] })
    ] }, window)) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t(account.loading ? "usageLoading" : "usageUnavailable") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.accountActions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled, onClick: () => {
        start({ kind: "rename", ref: account.apiKeyEnv }, label);
      }, children: t("accountRename") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled: state.busy || state.blocked || account.writable === false, onClick: () => {
        start({ kind: "key", ref: account.apiKeyEnv }, label);
      }, children: t("accountReplaceKey") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled, onClick: () => {
        start({ kind: "remove", ref: account.apiKeyEnv }, label);
      }, children: t("accountRemove") })
    ] })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: open ? Section_default.card : Section_default.card + " " + Section_default.cardFolded, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.cardHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          className: Section_default.cardTrigger,
          "aria-expanded": open,
          "aria-controls": "opencode-go-accounts",
          onClick: () => {
            setOpen(!open);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.cardTitle, children: t("accountsTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.cardSub, children: summary }),
            total > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: unreadable > 0 || ready < total ? "warning" : "success", children: t(unreadable > 0 ? "accountsAvailabilityFailed" : "accountsAvailability", { ready, total, failed: unreadable }) }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: open ? Section_default.chevronOpen : Section_default.chevron })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.trailing, children: [
        updatedAt > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.cardStamp, title: new Date(updatedAt).toLocaleString(locale), children: [
          t("usageLastUpdated"),
          " ",
          stampText(updatedAt, locale)
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Button,
          {
            variant: "outline",
            size: "sm",
            disabled: state.refreshing,
            onClick: actions.loadAccounts,
            children: t(state.refreshing ? "usageRefreshing" : "accountsRefresh")
          }
        )
      ] })
    ] }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { id: "opencode-go-accounts", className: Section_default.cardBody, children: [
      state.blocked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("accountsBlocked") }) : null,
      state.failure ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.failedNote, role: "alert", children: t(state.failure === "cleanup" ? "accountsCleanupFailed" : state.failure === "remove" ? "accountsRemoveKeyFailed" : state.failure === "read" ? "accountsReadFailed" : "accountsWriteFailed") }) : null,
      !total ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("accountsEmpty") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: Section_default.accounts,
          onDragEnter: (event) => {
            if (reorderable && dragging !== null) event.preventDefault();
          },
          onDragOver: (event) => {
            if (!reorderable || dragging === null) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            setDropAt(slotAt(event.currentTarget, event.clientY));
          },
          onDrop: (event) => {
            const source = dragging;
            setDragging(null);
            setDropAt(null);
            if (source === null) return;
            event.preventDefault();
            const from = state.entries.findIndex((entry) => entry.apiKeyEnv === source);
            if (from < 0) return;
            const slot = Number.isFinite(event.clientY) ? slotAt(event.currentTarget, event.clientY) : dropAt;
            if (slot === null) return;
            const to = slot > from ? slot - 1 : slot;
            if (to !== from) move(source, to);
          },
          onDragEnd: () => {
            setDragging(null);
            setDropAt(null);
          },
          children: state.entries.map((account, index) => {
            const label = account.name || t("accountDefault");
            const rolling = account.usage?.rolling;
            const expanded = details === account.apiKeyEnv;
            const panelId = `opencode-go-account-${index}`;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react2.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                className: Section_default.accountRow,
                "data-account-row": account.apiKeyEnv,
                "data-dragging": dragging === account.apiKeyEnv ? "true" : void 0,
                "data-drop": markAt(index),
                onDragStart: (event) => {
                  if (!reorderable || event.target?.closest?.("[data-account-handle]") == null) {
                    event.preventDefault();
                    return;
                  }
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", account.apiKeyEnv);
                    if (typeof event.dataTransfer.setDragImage === "function") {
                      event.dataTransfer.setDragImage(event.currentTarget, 16, 16);
                    }
                  }
                  setDragging(account.apiKeyEnv);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.accountMain, "data-account-main": "", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        className: Section_default.accountHandle,
                        "data-account-handle": "",
                        draggable: reorderable,
                        disabled: !reorderable,
                        title: t("accountDragHandle", { name: label }),
                        "aria-label": t("accountDragHandle", { name: label }),
                        onKeyDown: (event) => {
                          if (event.key === "ArrowUp" && index > 0) {
                            event.preventDefault();
                            move(account.apiKeyEnv, index - 1);
                          }
                          if (event.key === "ArrowDown" && index < total - 1) {
                            event.preventDefault();
                            move(account.apiKeyEnv, index + 1);
                          }
                        },
                        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GripIcon, {})
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { className: Section_default.accountName, title: label, children: label }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.accountState, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.accountDot, "data-off": account.configured === false ? "true" : void 0 }),
                      account.configured === void 0 ? t(account.failed ? "accountsStatusUnknown" : "usageLoading") : account.configured ? t("keyConfigured") : t("keyMissing")
                    ] }),
                    rolling ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "span",
                        {
                          className: Section_default.accountBar,
                          role: "progressbar",
                          "data-level": barLevel(rolling),
                          "aria-valuemin": 0,
                          "aria-valuemax": 100,
                          "aria-valuenow": Math.min(100, rolling.percent),
                          "aria-label": `${label} ${t("usage_rolling")}`,
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.accountBarFill, style: { width: `${Math.min(100, rolling.percent)}%` } }),
                            TICKS.map((at) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.accountBarTick, style: { left: `${at}%` } }, at))
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.accountPercent, children: [
                        rolling.percent,
                        "%"
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.accountReset, children: resetText(rolling.resetsAt, t) })
                    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.accountIdle, children: account.configured === false ? t("accountConfigureHint") : t(account.loading ? "usageLoading" : "usageUnavailable") }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        className: Section_default.accountToggle,
                        "aria-expanded": expanded,
                        "aria-controls": panelId,
                        "aria-label": t(expanded ? "accountsDetailsHide" : "accountsDetails", { name: label }),
                        onClick: () => {
                          setDetails(expanded ? null : account.apiKeyEnv);
                        },
                        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: expanded ? Section_default.chevronOpen : Section_default.chevron })
                      }
                    )
                  ] }),
                  account.failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.accountProblems, role: "alert", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.failedNote, children: account.problem ?? t(account.stale ? "usageStaleHint" : "usageRefreshFailed") }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        className: Section_default.accountRetry,
                        disabled: state.refreshing,
                        onClick: actions.loadAccounts,
                        children: t("usageRetry")
                      }
                    )
                  ] }) : null,
                  expanded ? detail(account, label) : null,
                  editor?.ref === account.apiKeyEnv ? editorForm(label) : null
                ]
              }
            ) }, account.id);
          })
        }
      ),
      editor ? editor.kind === "add" ? editorForm() : null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          className: Section_default.addAccount,
          variant: "primary",
          size: "sm",
          disabled: disabled || total >= MAX_ACCOUNTS,
          onClick: () => {
            start({ kind: "add" });
          },
          children: t("accountAdd")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.field, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.head, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.label, children: [
          t("accountAutoSwitch"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HintMark, { hint: t("accountAutoSwitchHint") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Switch,
          {
            checked: state.autoSwitch,
            disabled,
            label: t("accountAutoSwitch"),
            title: t("accountAutoSwitchHint"),
            onChange: (next) => {
              void actions.setAutoSwitch(next);
            }
          }
        )
      ] }) })
    ] }) : null
  ] });
}
var MODALITY_COPY = {
  text: "modalityText",
  image: "modalityImage",
  audio: "modalityAudio",
  video: "modalityVideo",
  pdf: "modalityPdf"
};
function hasCapacityOverride(limit) {
  return limit?.contextWindow != null || limit?.maxTokens != null || (limit?.thinkingBudgets?.length ?? 0) > 0;
}
function ModelEditor({ source = "go", models, draft, modelVisibility, t, locale, disabled, visibilitySaving, onEdit, onModelEnabled }) {
  const [query, setQuery] = (0, import_react2.useState)("");
  const [filter, setFilter] = (0, import_react2.useState)("all");
  const [selected, setSelected] = (0, import_react2.useState)();
  const [now, setNow] = (0, import_react2.useState)(Date.now);
  (0, import_react2.useEffect)(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 6e4);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const all = sortModels(models.status === "ready" ? models.entries : [], now);
  const normalized = query.trim().toLocaleLowerCase();
  const entries = all.filter((model2) => `${model2.name ?? ""} ${model2.id}`.toLocaleLowerCase().includes(normalized) && (filter === "all" || filter === "new" && isNewModel(model2, now) || filter === "custom" && hasCapacityOverride(draft[modelSettingsKey(model2)]) || filter === "deprecated" && model2.deprecated));
  const model = entries.find((entry) => entry.id === selected) ?? entries[0];
  const visibilityDisabled = disabled || visibilitySaving;
  const customized = all.filter((entry) => hasCapacityOverride(draft[modelSettingsKey(entry)])).length;
  const ownKeys = Object.keys(draft).filter((key) => key.startsWith(`${FREE_PROVIDER_ID}/`) === (source === "free"));
  const filters = [
    ["all", "filterAll", all.length],
    ["new", "filterNew", all.filter((entry) => isNewModel(entry, now)).length],
    ["custom", "filterCustom", customized],
    ["deprecated", "filterDeprecated", all.filter((entry) => entry.deprecated).length]
  ];
  const write = (id4, field, value) => {
    const current = draft[id4] === null ? { contextWindow: null, maxTokens: null, thinkingBudgets: null } : draft[id4] ?? {};
    onEdit({ ...draft, [id4]: { ...current, [field]: value ?? null } });
  };
  const badges = (entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    entry.configurationMissing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "warning", children: t("configurationMissing") }) : null,
    isNewModel(entry, now) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.newBadge, title: t("newHint"), children: t("newBadge") }) : null,
    entry.deprecated ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "warning", children: t("deprecatedBadge") }) : null
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.limitsEditor, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.modelSearchRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: Section_default.visuallyHidden, htmlFor: "opencode-go-model-filter", children: t("limitsFilterLabel") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: "opencode-go-model-filter",
          className: Section_default.input,
          type: "search",
          autoComplete: "off",
          placeholder: t("limitsFilterPlaceholder"),
          value: query,
          onChange: (event) => {
            setQuery(event.target.value);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.filters, role: "group", "aria-label": t("filterLabel"), children: filters.map(([key, label, count]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          className: Section_default.filter,
          "aria-pressed": filter === key,
          onClick: () => {
            setFilter(key);
          },
          children: [
            t(label),
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: count })
          ]
        },
        key
      )) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.modelHelp, children: t("visibilityHint") }),
    model ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.modelLayout, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.modelList, role: "group", "aria-label": t("modelsLabel"), children: entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          className: entry.id === model.id ? `${Section_default.modelRow} ${Section_default.modelRowSelected}` : Section_default.modelRow,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: Section_default.modelChoice,
                "aria-pressed": entry.id === model.id,
                onClick: () => {
                  setSelected(entry.id);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.modelName, children: [
                  entry.name ?? entry.id,
                  " ",
                  badges(entry),
                  hasCapacityOverride(draft[modelSettingsKey(entry)]) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.overrideDot, title: t("overridden"), "aria-hidden": "true" }) : null
                ] })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Switch,
              {
                label: t("modelVisibleLabel", { name: entry.name ?? entry.id }),
                checked: isModelEnabled(entry, modelVisibility),
                disabled: visibilityDisabled || entry.configurationMissing,
                onChange: (enabled) => {
                  onModelEnabled(modelSettingsKey(entry), enabled);
                }
              }
            )
          ]
        },
        entry.id
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: Section_default.modelDetails, "aria-label": t("modelDetails"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.modelHeading, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: model.name ?? model.id }),
          badges(model)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.modelMeta, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: Section_default.limitsModelId, translate: "no", children: model.id }),
          model.releaseDate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.releaseDate, title: t("releaseSource", { date: model.releaseDate }), children: model.releaseDate }) : null
        ] }),
        model.configurationMissing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("configurationMissingHint") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          model.deprecated ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("deprecatedHint") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.stats, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Capacity, { model, field: "contextWindow", limit: draft[modelSettingsKey(model)], t, locale, disabled, onChange: write }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Capacity, { model, field: "maxTokens", limit: draft[modelSettingsKey(model)], t, locale, disabled, onChange: write }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.stat, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.statLabel, children: t("modalityLabel") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Modalities, { model, t })
            ] })
          ] }),
          model.reasoningBudget ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            BudgetPresets,
            {
              model,
              limit: draft[modelSettingsKey(model)],
              t,
              locale,
              disabled,
              onChange: (values) => {
                write(modelSettingsKey(model), "thinkingBudgets", values);
              }
            },
            model.id
          ) : null,
          hasCapacityOverride(draft[modelSettingsKey(model)]) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: Section_default.reset,
              disabled,
              onClick: () => {
                onEdit({ ...draft, [modelSettingsKey(model)]: null });
              },
              children: t("limitsResetModel")
            }
          ) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: Section_default.paneFoot, children: [
            t("limitsHint"),
            " ",
            t("modalitiesSource"),
            model.inputModalities?.some((modality) => modality !== "text" && modality !== "image") === true ? ` ${t("modalitiesForwarding")}` : ""
          ] })
        ] })
      ] })
    ] }) : models.status === "ready" && all.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("limitsNoMatches", { query }) }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.limitsFoot, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.limitsSummary, children: t("limitsSummary", { count: customized }) }),
      ownKeys.some((key) => hasCapacityOverride(draft[key])) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          variant: "outline",
          size: "sm",
          disabled,
          onClick: () => {
            onEdit({ ...draft, ...Object.fromEntries(ownKeys.map((id4) => [id4, null])) });
          },
          children: t("limitsResetAll")
        }
      ) : null
    ] })
  ] });
}
function Modalities({ model, t }) {
  const declared = model.inputModalities;
  if (declared === void 0 || declared.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.hint, children: t("modalityUnknown") });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.modalities, children: INPUT_MODALITIES.map((modality) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      className: declared.includes(modality) ? Section_default.modality : Section_default.modalityOff,
      children: t(MODALITY_COPY[modality])
    },
    modality
  )) });
}
function Capacity({ model, field, limit, disabled, t, locale, onChange }) {
  const id4 = `opencode-go-${field}-${encodeURIComponent(model.id)}`;
  const catalogValue = model[field];
  const defaultValue = field === "maxTokens" && catalogValue !== void 0 ? Math.min(catalogValue, 65536) : catalogValue;
  const cappedOutput = field === "maxTokens" && catalogValue !== void 0 && catalogValue > 65536;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.stat, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: Section_default.statLabel, htmlFor: id4, children: t(field === "contextWindow" ? "limitsContext" : "limitsOutput") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        id: id4,
        className: Section_default.input,
        type: "number",
        min: 1,
        max: field === "maxTokens" ? model.maxTokens : void 0,
        step: 1,
        inputMode: "numeric",
        "aria-label": t(field === "contextWindow" ? "limitsContextLabel" : "limitsOutputLabel", { name: model.name ?? model.id }),
        "aria-describedby": `${id4}-default`,
        value: limit?.[field] ?? "",
        placeholder: defaultValue === void 0 ? t("capacityMissing") : String(defaultValue),
        disabled,
        onChange: (event) => {
          const text2 = event.target.value.trim();
          const value = Number(text2);
          if (text2 === "") onChange(modelSettingsKey(model), field, void 0);
          else if (Number.isSafeInteger(value) && value > 0) onChange(modelSettingsKey(model), field, value);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { id: `${id4}-default`, className: Section_default.hint, children: [
      cappedOutput ? t("capacityDefaultCapped", { value: defaultValue.toLocaleString(locale), max: catalogValue.toLocaleString(locale) }) : t("capacityDefault", { value: defaultValue === void 0 ? t("capacityMissing") : defaultValue.toLocaleString(locale) }),
      limit?.[field] != null ? ` \xB7 ${t("overridden")}` : ""
    ] })
  ] });
}
function BudgetPresets({ model, limit, disabled, t, locale, onChange }) {
  const [text2, setText] = (0, import_react2.useState)("");
  const range = model.reasoningBudget;
  const max = Math.min(range.max, (limit?.maxTokens ?? model.maxTokens ?? range.max + 1024) - 1024);
  const values = limit?.thinkingBudgets ?? [];
  const tokens = Number(text2);
  const valid = text2.trim() !== "" && Number.isSafeInteger(tokens) && tokens >= range.min && tokens <= max;
  const id4 = `opencode-go-thinking-budget-${encodeURIComponent(model.id)}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: Section_default.budgetEditor, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("thinkingBudgets") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("thinkingBudgetsHint", { min: range.min.toLocaleString(locale), max: max.toLocaleString(locale) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: Section_default.statLabel, htmlFor: id4, children: t("thinkingBudgetAddLabel", { name: model.name ?? model.id }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.budgetInput, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: id4,
          className: Section_default.input,
          type: "number",
          step: 1,
          min: range.min,
          max,
          inputMode: "numeric",
          value: text2,
          placeholder: "4096",
          disabled,
          "aria-invalid": text2 !== "" && !valid,
          onChange: (event) => {
            setText(event.target.value);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          variant: "outline",
          size: "sm",
          disabled: disabled || !valid || values.includes(tokens) || values.length >= 16,
          onClick: () => {
            onChange([...values, tokens].sort((a, b) => a - b));
            setText("");
          },
          children: t("thinkingBudgetAdd")
        }
      )
    ] }),
    values.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.budgetPresets, children: values.map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: Section_default.filter,
        disabled,
        "aria-label": t("thinkingBudgetRemove", { value }),
        onClick: () => {
          const next = values.filter((tokens2) => tokens2 !== value);
          onChange(next.length > 0 ? next : void 0);
        },
        children: [
          value.toLocaleString(locale),
          " tokens \xD7"
        ]
      },
      value
    )) }) : null
  ] });
}
var ADVANCED_FIELDS = [
  "usageDisplay",
  "baseURL",
  "freeBaseURL",
  "proxyURL",
  "refreshMinutes",
  "streamIdleTimeoutMs",
  "maxImages",
  "maxRequestImageBytes",
  "requestImagePixelBudget",
  "requestImageMaxBytes"
];
var APPEARANCE_FIELDS = ["showSidebarQuota", "usagePillStyle"];
function ValueField(props) {
  const hintId = props.id + "-hint";
  const errorId = props.id + "-error";
  const labelId = props.id + "-label";
  const options = props.options;
  const selected = options ? options.findIndex((option) => option.value === props.field.text) : -1;
  const describedBy = props.field.invalid ? `${errorId} ${hintId}` : hintId;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.row, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.rowLabel, children: [
      options ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { id: labelId, className: Section_default.rowTitle, children: props.label }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: props.id, className: Section_default.rowTitle, children: props.label }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HintMark, { hint: props.hint })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.rowControl, children: options ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: Section_default.seg,
        role: "radiogroup",
        "aria-labelledby": labelId,
        "aria-describedby": describedBy,
        "data-count": options.length,
        "data-index": selected < 0 ? 0 : selected,
        ...props.field.invalid ? { "aria-invalid": true } : {},
        onKeyDown: (event) => {
          const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
          if (step === 0) return;
          event.preventDefault();
          const next = (Math.max(0, selected) + step + options.length) % options.length;
          props.onEdit(options[next].value);
          event.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus();
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.segThumb, "aria-hidden": "true" }),
          options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              role: "radio",
              "aria-checked": option.value === props.field.text,
              tabIndex: option.value === props.field.text ? 0 : -1,
              className: Section_default.segOption,
              disabled: props.disabled,
              onClick: () => {
                props.onEdit(option.value);
              },
              children: option.label
            },
            option.value
          ))
        ]
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        id: props.id,
        name: props.id,
        autoComplete: "off",
        placeholder: props.placeholder,
        "aria-describedby": describedBy,
        className: props.field.invalid ? Section_default.inputInvalid : Section_default.input,
        type: props.numeric === true ? "number" : "text",
        ...props.numeric === true ? { inputMode: "numeric" } : {},
        ...props.field.invalid ? { "aria-invalid": true } : {},
        value: props.field.text,
        disabled: props.disabled,
        onChange: (event) => {
          props.onEdit(event.target.value);
        }
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HintText, { id: hintId, hint: props.hint }),
    props.field.invalid ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: errorId, className: Section_default.rowInvalid, role: "alert", children: props.invalidLabel }) : null
  ] });
}
function QuotaAppearance({ state, t, disabled, onEdit, onReset }) {
  const tokens = useGoThemeTokens();
  const locked = disabled || state.saving;
  const styleId = "opencode-go-usage-pill-style";
  const describedBy = state.usagePillStyle.invalid ? `${styleId}-hint ${styleId}-error` : `${styleId}-hint`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: Section_default.appearanceGroup, "aria-labelledby": "opencode-go-appearance-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${Section_default.groupHead} ${Section_default.appearanceHead}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { id: "opencode-go-appearance-title", className: Section_default.appearanceTitle, children: t("usageAppearanceLabel") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: Section_default.reset,
          disabled: locked || !APPEARANCE_FIELDS.some((field) => state[field].overridden || state[field].invalid),
          onClick: () => {
            for (const field of APPEARANCE_FIELDS) {
              if (state[field].overridden || state[field].invalid) onReset(field);
            }
          },
          children: t("usageAppearanceReset")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.appearanceToggle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.appearanceCopy, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.rowLabel, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.rowTitle, children: t("showSidebarQuotaLabel") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HintMark, { hint: t("showSidebarQuotaHint") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.appearanceHint, children: t("showSidebarQuotaSummary") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Switch,
        {
          checked: state.showSidebarQuota.text === "true",
          label: t("showSidebarQuotaLabel"),
          title: t("showSidebarQuotaHint"),
          disabled: locked,
          onChange: (next) => {
            onEdit("showSidebarQuota", String(next));
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "fieldset",
      {
        className: Section_default.appearanceStyles,
        role: "radiogroup",
        "aria-labelledby": `${styleId}-label`,
        "aria-describedby": describedBy,
        "aria-invalid": state.usagePillStyle.invalid || void 0,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("legend", { className: Section_default.appearanceLegend, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { id: `${styleId}-label`, className: Section_default.rowTitle, children: t("usagePillStyleLabel") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HintMark, { hint: t("usagePillStyleHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: `${styleId}-hint`, className: Section_default.appearanceHint, children: t("usagePillStylePreviewHint") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.appearanceChoices, children: USAGE_PILL_STYLES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "label",
            {
              className: Section_default.appearanceChoice,
              "data-selected": state.usagePillStyle.text === value,
              "data-disabled": locked,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: Section_default.appearanceChoiceHead, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t(`usagePillStyle_${value}`) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "input",
                    {
                      type: "radio",
                      name: styleId,
                      value,
                      className: Section_default.appearanceRadio,
                      checked: state.usagePillStyle.text === value,
                      disabled: locked,
                      "aria-describedby": describedBy,
                      onChange: () => {
                        onEdit("usagePillStyle", value);
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.appearancePreview, style: themeStyle(tokens), "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${UsagePill_default.trigger} ${value === "plain" ? UsagePill_default.plain : ""} ${Section_default.appearanceSample}`, children: [
                  t("usageRollingShort"),
                  " 24% \xB7 ",
                  t("usageWeekShort"),
                  " 48%"
                ] }) })
              ]
            },
            value
          )) }),
          state.usagePillStyle.invalid ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: `${styleId}-error`, className: Section_default.rowInvalid, role: "alert", children: t("invalidValue") }) : null
        ]
      }
    )
  ] });
}
function ModelSourceStatus({ models, source, t, locale }) {
  const status = models.status === "ready" || models.status === "failed" ? models.sources?.[source] : void 0;
  const busy = models.status === "idle" || models.status === "loading" || models.status === "ready" && models.refreshing;
  const failed = models.status === "failed" || models.status === "ready" && models.stale;
  const label = busy ? t("modelsRefreshingShort") : failed ? t("modelsSourceFailed") : status?.updatedAt === void 0 && status !== void 0 ? t("modelsSourceNeverFetched") : t("modelsSourceCurrent");
  const updated = status?.updatedAt === void 0 ? void 0 : new Date(status.updatedAt);
  const fullTime = updated ? t("modelsSourceUpdated", { time: updated.toLocaleString(locale) }) : void 0;
  const detail = `${t(source === "go" ? "modelsGoSource" : "modelsFreeSource")}: ${label}${fullTime ? `. ${fullTime}` : ""}`;
  const sameDay = updated?.toDateString() === (/* @__PURE__ */ new Date()).toDateString();
  const progressLabel = models.status === "ready" ? t("modelsRefreshing") : t("modelsLoading");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      className: Section_default.modelSync,
      role: "status",
      "aria-label": busy ? progressLabel : detail,
      "data-state": busy ? "loading" : failed ? "failed" : updated ? "ready" : "idle",
      title: detail,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.modelSyncDot, "aria-hidden": "true" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
        updated && !busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("time", { dateTime: updated.toISOString(), children: updated.toLocaleString(locale, {
          ...sameDay ? {} : { month: "short", day: "numeric" },
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }) }) : null
      ]
    }
  );
}
function ModelsBody({ models, t, source, showProgress = true }) {
  const sources = models.status === "ready" || models.status === "failed" ? models.sources : void 0;
  if (models.status === "failed") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.failedNote, role: "alert", children: t("modelsFailed") }),
      models.message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: models.message }) : null
    ] });
  }
  if (models.status !== "ready") return showProgress ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, role: "status", "aria-live": "polite", children: t("modelsLoading") }) : null;
  const progress = showProgress && models.refreshing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, role: "status", children: t("modelsRefreshing") }) : null;
  if (models.stale) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    progress,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.failedNote, role: "alert", children: t("modelsStale") }),
    models.message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: models.message }) : null
  ] });
  const warnings = (source ? [source] : ["go", "free"]).map((key) => sources?.[key]?.warning).filter((warning) => Boolean(warning));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    progress,
    warnings.map((warning, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.failedNote, role: "alert", children: warning }, index)),
    models.count === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("modelsEmpty") }) : null
  ] });
}
function OpencodeGoSection(props) {
  const { useOpencodeGo, edit, resetField, save, discard, loadModels, setEnabled, setModelEnabled, t } = props;
  if (useOpencodeGo === void 0 || edit === void 0 || resetField === void 0 || save === void 0 || discard === void 0 || loadModels === void 0 || setEnabled === void 0 || setModelEnabled === void 0 || props.editModelLimits === void 0 || t === void 0 || !props.loadAccounts || !props.addAccount || !props.renameAccount || !props.removeAccount || !props.selectAccount || !props.setAutoSwitch || !props.replaceAccountKey || !props.moveAccount) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    Loaded,
    {
      state: useOpencodeGo((snapshot) => snapshot),
      t,
      locale: props.getLocale?.(),
      edit,
      editModelLimits: props.editModelLimits,
      resetField,
      save,
      discard,
      loadModels,
      setEnabled,
      setModelEnabled,
      accountActions: {
        loadAccounts: props.loadAccounts,
        addAccount: props.addAccount,
        renameAccount: props.renameAccount,
        resetAddition: props.resetAddition,
        removeAccount: props.removeAccount,
        selectAccount: props.selectAccount,
        setAutoSwitch: props.setAutoSwitch,
        replaceAccountKey: props.replaceAccountKey,
        moveAccount: props.moveAccount
      }
    }
  );
}
function Loaded(props) {
  const { t, state, loadModels } = props;
  const tokens = useGoThemeTokens();
  const [advanced, setAdvanced] = (0, import_react2.useState)(false);
  const [modelsOpen, setModelsOpen] = (0, import_react2.useState)(false);
  const [modelSource, setModelSource] = (0, import_react2.useState)("go");
  const models = modelsForSource(state.models, modelSource);
  const modelNotices = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelsBody, { models: modelsOpen ? models : state.models, source: modelsOpen ? modelSource : void 0, t, showProgress: !modelsOpen }),
    state.pickerFailed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.failedNote, role: "alert", children: t("pickerFailed") }) : null
  ] });
  (0, import_react2.useEffect)(() => {
    if (state.available && state.models.status === "idle") loadModels();
  }, [state.available, state.models.status, loadModels]);
  if (!state.available) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.page, style: themeStyle(tokens), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.intro, children: t("unavailable") }) });
  }
  const disabled = !state.writable;
  const enabledHint = state.enabled ? t("enabledHint") : t("enabledOff");
  const accountCard = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    AccountsCard,
    {
      state: state.accounts,
      actions: props.accountActions,
      writable: state.writable,
      t,
      locale: props.locale
    }
  );
  const fieldProps = {
    invalidLabel: t("invalidValue"),
    disabled
  };
  const advancedOverridden = ADVANCED_FIELDS.some((field) => state[field].overridden);
  const canResetAdvanced = ADVANCED_FIELDS.some((field) => state[field].overridden || state[field].invalid);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.page, style: themeStyle(tokens), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.pageBody, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.pageTop, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: Section_default.title, children: t("titleLabel") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.intro, children: t("intro") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { className: Section_default.card, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.cardHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: Section_default.cardTitle, children: [
          t("enabledLabel"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HintMark, { hint: enabledHint })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Switch,
          {
            checked: state.enabled,
            label: t("enabledLabel"),
            title: enabledHint,
            disabled: disabled || state.saving || state.pickerSaving,
            onChange: props.setEnabled
          }
        )
      ] }) }),
      accountCard,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: modelsOpen ? Section_default.cardModels : Section_default.cardModels + " " + Section_default.cardFolded, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: Section_default.cardTrigger,
            "aria-expanded": modelsOpen,
            "aria-controls": "opencode-go-models",
            onClick: () => {
              setModelsOpen(!modelsOpen);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.cardTitle, children: t("modelsLabel") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: modelsOpen ? Section_default.chevronOpen : Section_default.chevron })
            ]
          }
        ),
        modelsOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { id: "opencode-go-models", className: Section_default.cardBody, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.modelToolbar, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.modelTabs, role: "tablist", "aria-label": t("modelSourcesLabel"), children: ["go", "free"].map((source) => {
              const catalog = modelsForSource(state.models, source);
              const status = catalog.status === "ready" || catalog.status === "failed" ? catalog.sources?.[source] : void 0;
              const label = t(source === "go" ? "modelsGoTab" : "modelsFreeTab");
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  role: "tab",
                  "aria-label": label,
                  title: status?.error ?? status?.warning,
                  id: `opencode-model-tab-${source}`,
                  "aria-selected": modelSource === source,
                  tabIndex: modelSource === source ? 0 : -1,
                  "aria-controls": "opencode-model-panel",
                  className: Section_default.modelTab,
                  onKeyDown: (event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === "Home" ? "go" : event.key === "End" ? "free" : source === "go" ? "free" : "go";
                    setModelSource(next);
                    document.getElementById(`opencode-model-tab-${next}`)?.focus();
                  },
                  onClick: () => {
                    setModelSource(source);
                  },
                  children: [
                    label,
                    catalog.status === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.modelTabCount, "aria-hidden": "true", children: catalog.count }) : null,
                    status?.error || status?.warning ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.modelTabWarning, "aria-hidden": "true" }) : null
                  ]
                },
                source
              );
            }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.modelTools, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSourceStatus, { models, source: modelSource, t, locale: props.locale }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  variant: "outline",
                  size: "sm",
                  disabled: state.models.status === "loading" || state.models.status === "ready" && state.models.refreshing,
                  onClick: loadModels,
                  children: t("modelsRefresh")
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { role: "tabpanel", id: "opencode-model-panel", className: Section_default.modelPanel, "aria-labelledby": `opencode-model-tab-${modelSource}`, children: [
            modelNotices,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ModelEditor,
              {
                source: modelSource,
                models,
                draft: state.modelLimitDraft,
                t,
                locale: props.locale,
                disabled: disabled || state.saving,
                modelVisibility: state.modelVisibility,
                visibilitySaving: state.pickerSaving,
                onModelEnabled: props.setModelEnabled,
                onEdit: props.editModelLimits
              },
              modelSource
            )
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.cardNotes, children: modelNotices })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: Section_default.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: Section_default.cardTrigger,
            "aria-expanded": advanced,
            "aria-controls": "opencode-go-advanced",
            onClick: () => {
              setAdvanced(!advanced);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: Section_default.cardTitle, children: t("advancedLabel") }),
              advancedOverridden ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "neutral", children: t("overridden") }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: advanced ? Section_default.chevronOpen : Section_default.chevron })
            ]
          }
        ),
        advanced ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { id: "opencode-go-advanced", className: Section_default.cardBody, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.advancedHead, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("advancedHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: Section_default.reset,
                disabled: disabled || !canResetAdvanced,
                onClick: () => {
                  for (const field of ADVANCED_FIELDS) {
                    if (state[field].overridden || state[field].invalid) props.resetField(field);
                  }
                },
                children: t("advancedResetAll")
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.rows, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.groupHead, children: t("groupUsage") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-usage-display",
                label: t("usageDisplayLabel"),
                hint: t("usageDisplayHint"),
                field: state.usageDisplay,
                options: USAGE_DISPLAY_MODES.map((value) => ({ value, label: t(`usageDisplay_${value}`) })),
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("usageDisplay", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QuotaAppearance, { state, t, disabled, onEdit: props.edit, onReset: props.resetField }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.groupHead, children: t("groupConnection") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-base-url",
                label: t("baseURLLabel"),
                hint: t("baseURLHint"),
                field: state.baseURL,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("baseURL", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-free-base-url",
                label: t("freeBaseURLLabel"),
                hint: t("freeBaseURLHint"),
                field: state.freeBaseURL,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("freeBaseURL", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-proxy-url",
                label: t("proxyURLLabel"),
                hint: t("proxyURLHint"),
                placeholder: "http://127.0.0.1:7890",
                field: state.proxyURL,
                ...fieldProps,
                invalidLabel: t("proxyURLInvalid"),
                onEdit: (text2) => {
                  props.edit("proxyURL", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.groupHead, children: t("groupCacheTimeouts") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-refresh-minutes",
                label: t("refreshMinutesLabel"),
                hint: t("refreshMinutesHint"),
                field: state.refreshMinutes,
                numeric: true,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("refreshMinutes", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-stream-idle",
                label: t("streamIdleTimeoutMsLabel"),
                hint: t("streamIdleTimeoutMsHint"),
                field: state.streamIdleTimeoutMs,
                numeric: true,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("streamIdleTimeoutMs", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: Section_default.groupHead, children: t("groupImages") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-max-images",
                label: t("maxImagesLabel"),
                hint: t("maxImagesHint"),
                field: state.maxImages,
                numeric: true,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("maxImages", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-max-request-image-bytes",
                label: t("maxRequestImageBytesLabel"),
                hint: t("maxRequestImageBytesHint"),
                field: state.maxRequestImageBytes,
                numeric: true,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("maxRequestImageBytes", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-image-pixel-budget",
                label: t("requestImagePixelBudgetLabel"),
                hint: t("requestImagePixelBudgetHint"),
                field: state.requestImagePixelBudget,
                numeric: true,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("requestImagePixelBudget", text2);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              ValueField,
              {
                id: "opencode-go-image-max-bytes",
                label: t("requestImageMaxBytesLabel"),
                hint: t("requestImageMaxBytesHint"),
                field: state.requestImageMaxBytes,
                numeric: true,
                ...fieldProps,
                onEdit: (text2) => {
                  props.edit("requestImageMaxBytes", text2);
                }
              }
            )
          ] })
        ] }) : null
      ] }),
      disabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.hint, children: t("readOnly") }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: Section_default.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "md", disabled: disabled || !state.dirty || state.invalid || state.saving || state.pickerSaving, onClick: props.save, children: state.saving ? t("saving") : t("save") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "md", disabled: disabled || !state.dirty || state.saving, onClick: props.discard, children: t("discard") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "a",
        {
          className: Section_default.starLink,
          href: "https://github.com/Duskriver/dsh-opencode-go",
          target: "_blank",
          rel: "noopener noreferrer",
          title: t("starProjectTitle"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "currentColor", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("starProject") })
          ]
        }
      ),
      state.failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: Section_default.failedNote, children: t("savedFailed") }) : null
    ] })
  ] });
}

// src/engines/opencode-go/client/UsagePill.tsx
var import_react4 = require("react");

// src/engines/opencode-go/client/AnalyticsDialog.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/engines/opencode-go/client/dashboard-copy.ts
var historyEn = {
  account: "Viewing account",
  noAccounts: "Add an account to view workspace history.",
  scope: "All workspace clients \xB7 UTC calendar days",
  requests: "Requests",
  tokens: "Tokens",
  amount: "Usage amount",
  cacheHit: "Cache hit rate",
  input: "Input",
  output: "Output",
  cacheRead: "Cache read",
  cacheWrite: "Cache write",
  dailyAverage: "Daily average",
  models: "models",
  activeDays: "active days",
  trend: "Daily activity",
  trendHint: "Select a day to inspect its usage.",
  tokensMode: "Token breakdown",
  requestsMode: "Request count",
  chartHelp: "Arrow keys move between days. Click or tap to pin a day; Escape clears it.",
  selectDay: "Hover, focus or tap a bar for daily details.",
  ranking: "Model distribution",
  rankingHint: "Compare models across this workspace.",
  details: "Model details",
  model: "Model",
  share: "Token share",
  allModels: "Show all models",
  fewerModels: "Show fewer models",
  export: "Export CSV",
  exporting: "Exporting\u2026",
  exportFailed: "Could not export this range. Please retry.",
  refresh: "Refresh history",
  refreshed: "Updated",
  refreshing: "Refreshing official history\u2026",
  stale: "Refresh failed. Showing the last successful result for this account and range.",
  loading: "Loading official workspace history\u2026",
  empty: "No recorded usage in this range.",
  failed: "Could not load workspace history.",
  retry: "Try again",
  permission: "This key cannot read history. Check its Usage read permission in OpenCode Console.",
  credentials: "The selected account has no usable key. Update it in account settings.",
  unsupported: "History is available for the official OpenCode gateway. This account uses another gateway.",
  pending: "OpenCode is still preparing daily summaries. Please try again shortly.",
  invalid: "OpenCode returned an unreadable history response. Please retry.",
  quota: "Current allowance",
  quotaUnavailable: "Allowance unavailable",
  rolling: "5 hours",
  weekly: "Weekly",
  monthly: "Monthly",
  resets: "Resets",
  amountHint: "Official usage amount is not a receipt or an extra charge for Go.",
  lagHint: "Daily summaries may lag recent requests. Anonymous Free usage may not appear.",
  exportHint: "CSV includes member and service-account fields supplied by Console."
};
var historyZh = {
  account: "\u67E5\u770B\u8D26\u53F7",
  noAccounts: "\u6DFB\u52A0\u8D26\u53F7\u540E\u5373\u53EF\u67E5\u770B\u5DE5\u4F5C\u533A\u7684\u7528\u91CF\u5386\u53F2\u3002",
  scope: "\u5305\u542B\u5DE5\u4F5C\u533A\u5185\u6240\u6709\u5BA2\u6237\u7AEF \xB7 \u6309 UTC \u65E5\u7EDF\u8BA1",
  requests: "\u8BF7\u6C42\u6570",
  tokens: "Token",
  amount: "\u7528\u91CF\u91D1\u989D",
  cacheHit: "\u7F13\u5B58\u547D\u4E2D\u7387",
  input: "\u8F93\u5165",
  output: "\u8F93\u51FA",
  cacheRead: "\u7F13\u5B58\u8BFB",
  cacheWrite: "\u7F13\u5B58\u5199",
  dailyAverage: "\u65E5\u5747",
  models: "\u4E2A\u6A21\u578B",
  activeDays: "\u4E2A\u6D3B\u8DC3\u65E5",
  trend: "\u6BCF\u65E5\u6D3B\u52A8",
  trendHint: "\u9009\u62E9\u4E00\u5929\uFF0C\u67E5\u770B\u5F53\u65E5\u7528\u91CF\u3002",
  tokensMode: "Token \u6784\u6210",
  requestsMode: "\u8BF7\u6C42\u6570",
  chartHelp: "\u65B9\u5411\u952E\u5207\u6362\u65E5\u671F\uFF1B\u70B9\u51FB\u6216\u8F7B\u89E6\u56FA\u5B9A\u4E00\u5929\uFF0CEscape \u53D6\u6D88\u9009\u62E9\u3002",
  selectDay: "\u60AC\u505C\u3001\u805A\u7126\u6216\u8F7B\u89E6\u67F1\u5F62\uFF0C\u67E5\u770B\u5F53\u65E5\u660E\u7EC6\u3002",
  ranking: "\u6A21\u578B\u7528\u91CF\u5206\u5E03",
  rankingHint: "\u6BD4\u8F83\u5DE5\u4F5C\u533A\u5185\u5404\u6A21\u578B\u7684\u6D88\u8017\u3002",
  details: "\u6A21\u578B\u660E\u7EC6",
  model: "\u6A21\u578B",
  share: "Token \u5360\u6BD4",
  allModels: "\u5C55\u5F00\u5168\u90E8\u6A21\u578B",
  fewerModels: "\u6536\u8D77\u6A21\u578B",
  export: "\u5BFC\u51FA CSV",
  exporting: "\u6B63\u5728\u5BFC\u51FA\u2026",
  exportFailed: "\u5BFC\u51FA\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  refresh: "\u5237\u65B0\u5386\u53F2",
  refreshed: "\u66F4\u65B0\u4E8E",
  refreshing: "\u6B63\u5728\u5237\u65B0\u5B98\u65B9\u5386\u53F2\u2026",
  stale: "\u5237\u65B0\u5931\u8D25\uFF0C\u4EE5\u4E0B\u4E3A\u5F53\u524D\u8D26\u53F7\u4E0E\u533A\u95F4\u4E0A\u6B21\u6210\u529F\u8BFB\u53D6\u7684\u7ED3\u679C\u3002",
  loading: "\u6B63\u5728\u8BFB\u53D6\u5B98\u65B9\u5DE5\u4F5C\u533A\u5386\u53F2\u2026",
  empty: "\u6240\u9009\u533A\u95F4\u6682\u65E0\u5DF2\u8BB0\u5F55\u7684\u7528\u91CF\u3002",
  failed: "\u65E0\u6CD5\u8BFB\u53D6\u5DE5\u4F5C\u533A\u7528\u91CF\u5386\u53F2\u3002",
  retry: "\u91CD\u8BD5",
  permission: "\u8BE5 Key \u65E0\u6CD5\u8BFB\u53D6\u5386\u53F2\uFF0C\u8BF7\u5728 OpenCode Console \u68C0\u67E5 Usage \u8BFB\u53D6\u6743\u9650\u3002",
  credentials: "\u6240\u9009\u8D26\u53F7\u6CA1\u6709\u53EF\u7528 Key\uFF0C\u8BF7\u5728\u8D26\u53F7\u8BBE\u7F6E\u4E2D\u66F4\u65B0\u3002",
  unsupported: "\u5386\u53F2\u67E5\u8BE2\u4EC5\u652F\u6301 OpenCode \u5B98\u65B9\u7F51\u5173\uFF0C\u5F53\u524D\u8D26\u53F7\u4F7F\u7528\u4E86\u5176\u4ED6\u7F51\u5173\u3002",
  pending: "OpenCode \u5C1A\u672A\u751F\u6210\u6BCF\u65E5\u6C47\u603B\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  invalid: "OpenCode \u8FD4\u56DE\u7684\u5386\u53F2\u6570\u636E\u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  quota: "\u5F53\u524D\u989D\u5EA6",
  quotaUnavailable: "\u989D\u5EA6\u6682\u4E0D\u53EF\u7528",
  rolling: "5 \u5C0F\u65F6",
  weekly: "\u6BCF\u5468",
  monthly: "\u6BCF\u6708",
  resets: "\u91CD\u7F6E\u4E8E",
  amountHint: "\u5B98\u65B9\u7528\u91CF\u91D1\u989D\u4E0D\u7B49\u540C\u8D26\u5355\u6216 Go \u5957\u9910\u5916\u7684\u5B9E\u9645\u6263\u6B3E\u3002",
  lagHint: "\u6BCF\u65E5\u6C47\u603B\u53EF\u80FD\u5EF6\u8FDF\uFF0C\u533F\u540D Free \u8C03\u7528\u53EF\u80FD\u4E0D\u5728\u5176\u4E2D\u3002",
  exportHint: "CSV \u5305\u542B Console \u63D0\u4F9B\u7684\u6210\u5458\u548C\u670D\u52A1\u8D26\u53F7\u5B57\u6BB5\u3002"
};
function historyCopy(locale) {
  return locale?.toLowerCase().startsWith("zh") ? historyZh : historyEn;
}

// plugin-css:src/engines/opencode-go/client/AnalyticsDialog.module.css
var id3 = "dsh-llm-fusion/AnalyticsDialog.module.css";
if (!document.querySelector("style[data-plugin-css=" + JSON.stringify(id3) + "]")) {
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-llm-fusion";
  style.dataset.pluginCss = id3;
  style.textContent = ".gMSkkG_shell{scrollbar-width:thin;border-radius:14px;gap:0;width:min(1100px,100%);max-height:100%;padding:0;overflow:auto}.gMSkkG_dashboard{color:var(--go-text);background:var(--go-bg);font-family:var(--go-font);flex-shrink:0;padding:26px 32px 24px;font-size:13px;line-height:1.6}.gMSkkG_dashboard,.gMSkkG_dashboard *{box-sizing:border-box}.gMSkkG_dashboard button,.gMSkkG_dashboard select{font:inherit}.gMSkkG_dashboard button{cursor:pointer;color:inherit}.gMSkkG_dashboard button:disabled{cursor:default;opacity:.45}.gMSkkG_dashboard button:focus-visible,.gMSkkG_dashboard select:focus-visible,.gMSkkG_tableScroll:focus-visible{outline:2px solid var(--go-accent);outline-offset:3px}.gMSkkG_header{justify-content:space-between;align-items:center;gap:12px;margin-bottom:30px;display:flex}.gMSkkG_brand{font-family:var(--go-display-font);letter-spacing:-.04em;align-items:center;gap:11px;font-size:23px;font-weight:400;display:flex}.gMSkkG_brandIcon{background:var(--go-accent-soft);width:33px;height:33px;color:var(--go-accent);border-radius:9px;flex:none;place-items:center;display:grid}.gMSkkG_brandIcon svg,.gMSkkG_iconButton svg,.gMSkkG_exportButton svg{width:17px;height:17px}.gMSkkG_iconButton{background:0 0;border:0;border-radius:7px;place-items:center;width:34px;height:34px;padding:7px;display:inline-grid}.gMSkkG_iconButton:hover{background:var(--go-surface-2)}.gMSkkG_heading{justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;display:flex}.gMSkkG_heading h1{font-family:var(--go-display-font);letter-spacing:-.025em;margin:0 0 8px;font-size:30px;font-weight:400;line-height:1.3}.gMSkkG_heading p,.gMSkkG_sectionHead p{color:var(--go-muted);margin:0;font-size:12px}.gMSkkG_source{color:var(--go-muted);white-space:nowrap;align-items:center;gap:7px;font-size:11px;display:flex}.gMSkkG_source i{background:var(--go-success);border-radius:50%;width:5px;height:5px}.gMSkkG_toolbar{flex-wrap:wrap;align-items:center;gap:10px;padding:0;display:flex}.gMSkkG_accountSelect{align-items:center;gap:9px;min-width:0;display:flex}.gMSkkG_accountSelect>span{color:var(--go-muted);font-size:12px}.gMSkkG_accountSelect select{color:var(--go-text);background:var(--go-surface);border:1px solid var(--go-border);text-overflow:ellipsis;border-radius:7px;min-width:0;max-width:205px;height:34px;padding:0 26px 0 10px}.gMSkkG_rangeGroup,.gMSkkG_segmented{align-items:center;gap:3px;display:inline-flex}.gMSkkG_rangeGroup{margin-left:auto}.gMSkkG_rangeGroup button,.gMSkkG_segmented button{min-height:31px;color:var(--go-muted);white-space:nowrap;background:0 0;border:0;border-radius:6px;padding:5px 10px;font-size:12px}.gMSkkG_rangeGroup button:hover,.gMSkkG_segmented button:hover{color:var(--go-text)}.gMSkkG_rangeGroup button[aria-pressed=true],.gMSkkG_segmented button[aria-pressed=true]{background:var(--go-surface-2);color:var(--go-text)}.gMSkkG_utc{color:var(--go-muted);font-size:11px;font-family:var(--go-number-font)}.gMSkkG_toolbarActions{align-items:center;gap:7px;display:flex}.gMSkkG_exportButton{border:1px solid var(--go-border);background:var(--go-surface);border-radius:7px;align-items:center;gap:7px;min-height:34px;padding:6px 11px;display:inline-flex;font-size:12px!important}.gMSkkG_exportButton:hover{background:var(--go-surface-2)}.gMSkkG_statusRow{min-height:35px;color:var(--go-muted);flex-wrap:wrap;justify-content:space-between;gap:5px 14px;padding:8px 0;font-size:11px;display:flex}.gMSkkG_kpis{grid-template-columns:repeat(4,minmax(0,1fr));margin:12px 0 27px;display:grid}.gMSkkG_kpis>div{border-left:1px solid var(--go-border);flex-direction:column;min-width:0;padding:0 20px;display:flex}.gMSkkG_kpis>div:first-child{border-left:0;padding-left:0}.gMSkkG_kpis>div:last-child{padding-right:0}.gMSkkG_kpis>div>span{color:var(--go-muted);font-size:12px}.gMSkkG_kpis strong{font:400 clamp(24px, 2.6vw, 32px)/1.5 var(--go-number-font);font-variant-numeric:tabular-nums;letter-spacing:-.055em;white-space:nowrap;text-overflow:ellipsis;display:block;overflow:hidden}.gMSkkG_kpis strong em{margin-left:2px;font-size:18px;font-style:normal}.gMSkkG_kpis small{color:var(--go-muted);font-size:11px}.gMSkkG_amountKpi strong{color:var(--go-text)}.gMSkkG_quotaStrip{border-block:1px solid var(--go-border);grid-template-columns:repeat(3,minmax(0,1fr));gap:9px 24px;padding:17px 0 19px;display:grid}.gMSkkG_quotaTitle{color:var(--go-muted);grid-column:1/-1;font-size:11px}.gMSkkG_quotaWindow{min-width:0}.gMSkkG_quotaWindow>span{color:var(--go-muted);justify-content:space-between;gap:10px;font-size:12px;display:flex}.gMSkkG_quotaWindow b{font-weight:400;font-family:var(--go-number-font);color:var(--go-text);font-variant-numeric:tabular-nums}.gMSkkG_quotaWindow progress{appearance:none;background:var(--go-surface-2);--go-progress:var(--go-accent);width:100%;height:5px;accent-color:var(--go-progress);border:0;border-radius:99px;margin-top:8px;display:block;overflow:hidden}.gMSkkG_quotaWindow progress::-webkit-progress-bar{background:var(--go-surface-2)}.gMSkkG_quotaWindow progress::-webkit-progress-value{background:var(--go-progress);border-radius:99px}.gMSkkG_quotaWindow progress::-moz-progress-bar{background:var(--go-progress);border-radius:99px}.gMSkkG_quotaWindow[data-level=high] progress{--go-progress:var(--go-warning)}.gMSkkG_quotaWindow[data-level=limited] progress{--go-progress:var(--go-danger)}.gMSkkG_quotaUnavailable{color:var(--go-muted);margin:0;font-size:12px}.gMSkkG_sectionHead{justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px;display:flex}.gMSkkG_sectionHead h2{font-family:var(--go-display-font);margin:0 0 4px;font-size:18px;font-weight:500}.gMSkkG_sectionHead>span{color:var(--go-muted);font-size:11px}.gMSkkG_trend,.gMSkkG_models,.gMSkkG_details{margin-top:6px;padding-top:27px}.gMSkkG_models,.gMSkkG_details{border-top:1px solid var(--go-border);margin-top:24px}.gMSkkG_legend{color:var(--go-muted);flex-wrap:wrap;gap:16px;margin-bottom:16px;font-size:11px;display:flex}.gMSkkG_legend span{align-items:center;gap:6px;display:inline-flex}.gMSkkG_legend i{border-radius:2px;width:7px;height:7px}.gMSkkG_dashboard [data-part=inputTokens],.gMSkkG_dashboard [data-part=requests]{background:var(--go-accent)}.gMSkkG_dashboard [data-part=outputTokens]{background:var(--go-accent-2)}.gMSkkG_dashboard [data-part=cacheReadTokens]{background:var(--go-cache-read)}.gMSkkG_dashboard [data-part=cacheWriteTokens]{background:var(--go-cache-write)}.gMSkkG_chartScroll{scrollbar-width:thin;scrollbar-color:var(--go-border) transparent;overflow-x:auto}.gMSkkG_chart{grid-template-rows:210px 31px;grid-template-columns:64px 1fr;padding-top:6px;display:grid}.gMSkkG_yAxis{color:var(--go-muted);font:11px var(--go-number-font);white-space:nowrap;flex-direction:column;grid-column:1;justify-content:space-between;padding-right:9px;display:flex}.gMSkkG_plot{isolation:isolate;grid-column:2;gap:4px;display:grid;position:relative}.gMSkkG_gridlines{pointer-events:none;z-index:-1;flex-direction:column;justify-content:space-between;display:flex;position:absolute;inset:0}.gMSkkG_gridlines i{border-top:1px solid var(--go-border);width:100%}.gMSkkG_dayBar{background:0 0;border:0;border-radius:3px;flex-direction:column;justify-content:flex-end;align-items:stretch;min-width:0;height:100%;padding:0;display:flex;position:relative}.gMSkkG_dayBar:hover,.gMSkkG_dayBar[data-selected=true]{background:var(--go-accent-soft)}.gMSkkG_barStack{opacity:.88;border-radius:3px 3px 0 0;flex-direction:column-reverse;width:100%;min-height:0;transition:opacity .12s;display:flex;overflow:hidden}.gMSkkG_dayBar[data-selected=true] .gMSkkG_barStack,.gMSkkG_dayBar:hover .gMSkkG_barStack{opacity:1}.gMSkkG_barStack i{min-height:0;display:block}.gMSkkG_zeroDot{background:var(--go-border);z-index:-1;width:100%;height:2px;position:absolute;bottom:0}.gMSkkG_xAxis{color:var(--go-muted);grid-column:2;justify-content:space-between;padding-top:10px;font-size:11px;display:flex}.gMSkkG_dayDetail{background:var(--go-surface-2);border-radius:8px;flex-wrap:wrap;align-items:center;gap:20px;min-height:68px;margin-top:12px;padding:14px 16px;display:flex}.gMSkkG_dayDetail>div{flex-direction:column;margin-right:auto;display:flex}.gMSkkG_dayDetail strong{font-size:13px;font-weight:500}.gMSkkG_dayDetail small,.gMSkkG_dayDetail>span{color:var(--go-muted);font-size:11px}.gMSkkG_dayDetail b{font:400 12px var(--go-number-font);color:var(--go-text);margin-top:4px;display:block}.gMSkkG_dayDetail p{color:var(--go-muted);margin:0;font-size:12px}.gMSkkG_rankList{flex-direction:column;gap:16px;display:flex}.gMSkkG_rankRow{grid-template-columns:24px minmax(145px,1fr) minmax(60px,1.8fr) 88px 48px;align-items:center;gap:14px;display:grid}.gMSkkG_rankIndex{color:var(--go-muted);font:11px var(--go-number-font)}.gMSkkG_rankIdentity{flex-direction:column;min-width:0;display:flex}.gMSkkG_rankIdentity>span{text-overflow:ellipsis;white-space:nowrap;font-size:13px;overflow:hidden}.gMSkkG_rankIdentity>small{color:var(--go-muted);font-size:11px}.gMSkkG_rankTrack{background:var(--go-surface-2);border-radius:99px;height:5px;overflow:hidden}.gMSkkG_rankTrack i{background:var(--go-accent);border-radius:inherit;height:100%;display:block}.gMSkkG_rankRow>b,.gMSkkG_rankRow>small{font-family:var(--go-number-font);text-align:right}.gMSkkG_rankRow>b{font-size:12px;font-weight:400}.gMSkkG_rankRow>small{color:var(--go-muted);font-size:11px}.gMSkkG_expandButton{background:0 0;border:0;margin:16px auto 0;padding:6px 9px;display:block;color:var(--go-accent)!important;font-size:12px!important}.gMSkkG_tableScroll{scrollbar-width:thin;scrollbar-color:var(--go-border) transparent;overflow:auto}.gMSkkG_details table{border-collapse:collapse;width:100%;min-width:890px;font-size:12px}.gMSkkG_details th{color:var(--go-muted);text-align:right;border-bottom:1px solid var(--go-border);white-space:nowrap;padding:9px 10px;font-weight:400}.gMSkkG_details th:first-child{text-align:left;padding-left:0}.gMSkkG_details th button{color:inherit;background:0 0;border:0;padding:3px 0}.gMSkkG_details td{text-align:right;border-bottom:1px solid var(--go-border);font-family:var(--go-number-font);white-space:nowrap;padding:13px 10px}.gMSkkG_details td:first-child{text-align:left;padding-left:0;font-family:inherit}.gMSkkG_details td strong{font-weight:500;display:block}.gMSkkG_details td small{color:var(--go-muted);font-size:11px}.gMSkkG_details tbody tr:hover{background:var(--go-surface-2)}.gMSkkG_footer{color:var(--go-muted);flex-direction:column;gap:5px;margin-top:24px;font-size:11px;display:flex}.gMSkkG_notice{background:color-mix(in srgb, var(--go-warning) 8%, var(--go-bg));color:var(--go-text);border:1px solid color-mix(in srgb, var(--go-warning) 35%, var(--go-border));border-radius:8px;justify-content:space-between;align-items:center;gap:15px;margin:0 0 18px;padding:12px 14px;font-size:12px;display:flex}.gMSkkG_notice button{color:var(--go-accent);white-space:nowrap;background:0 0;border:0;padding:4px}.gMSkkG_state{min-height:240px;color:var(--go-muted);flex-direction:column;justify-content:center;align-items:center;display:flex}.gMSkkG_state>svg,.gMSkkG_empty>svg{opacity:.5;width:30px;height:30px}.gMSkkG_empty{color:var(--go-muted);justify-content:center;align-items:center;gap:12px;padding:20px 0 0;font-size:12px;display:flex}.gMSkkG_spinner{border:2px solid var(--go-border);border-top-color:var(--go-accent);border-radius:50%;width:20px;height:20px;animation:.8s linear infinite gMSkkG_spin}@keyframes gMSkkG_spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.gMSkkG_spinner{animation:none}.gMSkkG_barStack{transition:none}}@media (width<=760px){div:has(>.gMSkkG_shell){padding:var(--dsh-frame-overlay-top,0px) 0 0}.gMSkkG_shell{border-radius:0;flex-shrink:0;width:100%;max-width:100%;height:100%;max-height:100%}.gMSkkG_dashboard{min-height:100%;padding:22px 20px}.gMSkkG_header{margin-bottom:25px}.gMSkkG_heading{margin-bottom:21px}.gMSkkG_heading h1{font-size:27px}.gMSkkG_heading .gMSkkG_source{display:none}.gMSkkG_toolbar{gap:8px}.gMSkkG_accountSelect{flex:1;min-width:120px}.gMSkkG_accountSelect select{width:100%;max-width:100%}.gMSkkG_accountSelect>span{display:none}.gMSkkG_toolbarActions{margin-left:auto}.gMSkkG_rangeGroup{order:3;margin-left:0}.gMSkkG_utc{order:4}.gMSkkG_kpis{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:22px}.gMSkkG_kpis>div{padding:0 18px}.gMSkkG_kpis>div:nth-child(3){border-left:0;padding-left:0}.gMSkkG_kpis strong{font-size:28px}.gMSkkG_quotaStrip{gap:10px 16px}.gMSkkG_sectionHead{flex-wrap:wrap;align-items:flex-start;gap:10px}.gMSkkG_dayDetail{gap:13px 20px}.gMSkkG_dayDetail>div{width:100%}.gMSkkG_rankRow{grid-template-columns:20px minmax(120px,1fr) minmax(30px,1fr) 74px;gap:10px}.gMSkkG_rankRow>small{display:none}}@media (width<=420px){.gMSkkG_dashboard{padding-inline:16px}.gMSkkG_rangeGroup button{padding-inline:9px}.gMSkkG_kpis strong{font-size:25px}.gMSkkG_quotaStrip{grid-template-columns:minmax(0,1fr)}.gMSkkG_quotaWindow{grid-template-columns:95px minmax(0,1fr);align-items:center;gap:12px;display:grid}.gMSkkG_quotaWindow progress{margin:0}.gMSkkG_rankRow{grid-template-columns:18px minmax(0,1fr) 70px;gap:9px}.gMSkkG_rankTrack{display:none}}@media (pointer:coarse){.gMSkkG_iconButton,.gMSkkG_exportButton,.gMSkkG_rangeGroup button,.gMSkkG_segmented button,.gMSkkG_accountSelect select,.gMSkkG_expandButton{min-height:44px}.gMSkkG_iconButton{min-width:44px}}";
  document.head.appendChild(style);
}
var AnalyticsDialog_default = { "accountSelect": "gMSkkG_accountSelect", "amountKpi": "gMSkkG_amountKpi", "barStack": "gMSkkG_barStack", "brand": "gMSkkG_brand", "brandIcon": "gMSkkG_brandIcon", "chart": "gMSkkG_chart", "chartScroll": "gMSkkG_chartScroll", "dashboard": "gMSkkG_dashboard", "dayBar": "gMSkkG_dayBar", "dayDetail": "gMSkkG_dayDetail", "details": "gMSkkG_details", "empty": "gMSkkG_empty", "expandButton": "gMSkkG_expandButton", "exportButton": "gMSkkG_exportButton", "footer": "gMSkkG_footer", "gridlines": "gMSkkG_gridlines", "header": "gMSkkG_header", "heading": "gMSkkG_heading", "iconButton": "gMSkkG_iconButton", "kpis": "gMSkkG_kpis", "legend": "gMSkkG_legend", "models": "gMSkkG_models", "notice": "gMSkkG_notice", "plot": "gMSkkG_plot", "quotaStrip": "gMSkkG_quotaStrip", "quotaTitle": "gMSkkG_quotaTitle", "quotaUnavailable": "gMSkkG_quotaUnavailable", "quotaWindow": "gMSkkG_quotaWindow", "rangeGroup": "gMSkkG_rangeGroup", "rankIdentity": "gMSkkG_rankIdentity", "rankIndex": "gMSkkG_rankIndex", "rankList": "gMSkkG_rankList", "rankRow": "gMSkkG_rankRow", "rankTrack": "gMSkkG_rankTrack", "sectionHead": "gMSkkG_sectionHead", "segmented": "gMSkkG_segmented", "shell": "gMSkkG_shell", "source": "gMSkkG_source", "spin": "gMSkkG_spin", "spinner": "gMSkkG_spinner", "state": "gMSkkG_state", "statusRow": "gMSkkG_statusRow", "tableScroll": "gMSkkG_tableScroll", "toolbar": "gMSkkG_toolbar", "toolbarActions": "gMSkkG_toolbarActions", "trend": "gMSkkG_trend", "utc": "gMSkkG_utc", "xAxis": "gMSkkG_xAxis", "yAxis": "gMSkkG_yAxis", "zeroDot": "gMSkkG_zeroDot" };

// src/engines/opencode-go/client/AnalyticsDialog.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var RANGES = ["today", "7d", "30d", "90d"];
var RANGE_LABELS = { today: "analyticsRangeToday", "7d": "analyticsRange7d", "30d": "analyticsRange30d", "90d": "analyticsRange90d" };
var PARTS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
var LABELS = { inputTokens: "input", outputTokens: "output", cacheReadTokens: "cacheRead", cacheWriteTokens: "cacheWrite" };
function historyNumber(value, locale, compact = false) {
  return new Intl.NumberFormat(locale, compact ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(BigInt(value));
}
function historyMoney(value, locale) {
  const raw = BigInt(value), digits = raw < 10000000n ? 4 : 2;
  const unit = 10n ** BigInt(8 - digits), base = 10n ** BigInt(digits);
  const rounded = (raw + unit / 2n) / unit;
  const fraction = String(rounded % base).padStart(digits, "0");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).formatToParts(rounded / base).map((part) => part.type === "fraction" ? fraction : part.value).join("");
}
function percent(part, total) {
  return BigInt(total) === 0n ? 0 : Number(BigInt(part) * 100000n / BigInt(total)) / 1e3;
}
function metricText(row, metric, locale) {
  return metric === "costMicroCents" ? historyMoney(row[metric], locale) : historyNumber(row[metric], locale, true);
}
function dayText(day, locale) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(/* @__PURE__ */ new Date(day + "T00:00:00Z"));
}
function errorDetails(error) {
  return error && typeof error === "object" && "code" in error && error.code === "opencode-go/analytics-unavailable" && "details" in error && error.details && typeof error.details === "object" ? error.details : {};
}
function errorText(error, copy) {
  const reason = errorDetails(error).reason;
  if (reason === "permission-denied") return copy.permission;
  if (reason === "missing-credential" || reason === "credential-unavailable" || reason === "unknown-account") return copy.credentials;
  if (reason === "unsupported-gateway") return copy.unsupported;
  if (reason === "invalid-response") return copy.invalid;
  return copy.failed;
}
function Icon({ name }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: name === "close" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m5 5 10 10M15 5 5 15" }) : name === "refresh" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M16.5 9A6.5 6.5 0 1 1 14 4.8" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M16.5 3v4h-4" })
  ] }) : name === "download" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M10 3v9m-3-3 3 3 3-3M4 13v4h12v-4" }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M3 3v14h14M6 13V9m4 4V5m4 8V7" }) }) });
}
function AnalyticsDialog(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Modal, { open: props.open, onClose: props.onClose, title: props.t("analyticsTitle"), headless: true, className: AnalyticsDialog_default.shell, children: props.open ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Dashboard, { ...props }, props.contextKey) : null });
}
function Dashboard({ activeRef, accounts, readAnalytics, exportAnalytics, readQuota, onClose, t, getLocale }) {
  const [selected, setSelected] = (0, import_react3.useState)(activeRef);
  const accountRef = accounts.some((a) => a.apiKeyEnv === selected) ? selected : accounts.find((a) => a.apiKeyEnv === activeRef)?.apiKeyEnv ?? accounts[0]?.apiKeyEnv ?? "";
  const [range, setRange] = (0, import_react3.useState)("30d"), [revision, setRevision] = (0, import_react3.useState)(0);
  const [snapshot, setSnapshot] = (0, import_react3.useState)(null);
  const [failure, setFailure] = (0, import_react3.useState)(null);
  const [loading, setLoading] = (0, import_react3.useState)(false);
  const [quota, setQuota] = (0, import_react3.useState)(null), [quotaFailed, setQuotaFailed] = (0, import_react3.useState)(false);
  const [exporting, setExporting] = (0, import_react3.useState)(false), [exportFailed, setExportFailed] = (0, import_react3.useState)(false);
  const force = (0, import_react3.useRef)(false), exporter = (0, import_react3.useRef)(null);
  const readers = (0, import_react3.useRef)({ readAnalytics, readQuota, exportAnalytics });
  readers.current = { readAnalytics, readQuota, exportAnalytics };
  const tokens = useGoThemeTokens(), locale = getLocale?.(), copy = historyCopy(locale);
  const key = JSON.stringify([accountRef, range]), report = snapshot?.key === key ? snapshot.value : null, error = failure?.key === key ? failure.error : null;
  (0, import_react3.useEffect)(() => {
    if (!accountRef) {
      setLoading(false);
      setSnapshot(null);
      setFailure(null);
      return;
    }
    const controller = new AbortController();
    let stopped = false;
    const query = { accountRef, range, ...force.current ? { refresh: true } : {} };
    force.current = false;
    setLoading(true);
    setFailure(null);
    void readers.current.readAnalytics(query, controller.signal).then((next) => {
      if (stopped) return;
      if (next.accountRef !== accountRef || next.period !== range) throw new Error("History identity mismatch");
      setSnapshot({ key, value: next });
    }).catch((reason) => {
      if (stopped || controller.signal.aborted) return;
      const details = errorDetails(reason);
      setSnapshot((previous) => details.retryable === true && details.retainPrevious === true && previous?.key === key && previous.value.source === details.source ? previous : null);
      setFailure({ key, error: reason });
    }).finally(() => {
      if (!stopped) setLoading(false);
    });
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [accountRef, range, revision, key]);
  (0, import_react3.useEffect)(() => {
    setQuota(null);
    setQuotaFailed(false);
    if (!accountRef || !readers.current.readQuota) return;
    let stopped = false;
    void readers.current.readQuota(accountRef).then((value) => {
      if (!stopped) setQuota({ ref: accountRef, value });
    }, () => {
      if (!stopped) setQuotaFailed(true);
    });
    return () => {
      stopped = true;
    };
  }, [accountRef, revision]);
  (0, import_react3.useEffect)(() => {
    setExporting(false);
    setExportFailed(false);
    return () => {
      exporter.current?.abort();
    };
  }, [accountRef, range]);
  const refresh = () => {
    force.current = true;
    setRevision((value) => value + 1);
  };
  const download = async () => {
    if (!readers.current.exportAnalytics || exporting || !accountRef) return;
    const controller = new AbortController();
    exporter.current = controller;
    setExporting(true);
    setExportFailed(false);
    try {
      const result = await readers.current.exportAnalytics({ accountRef, range }, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" })), anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1e3);
    } catch {
      if (!controller.signal.aborted) setExportFailed(true);
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.dashboard, style: themeStyle(tokens), "aria-busy": loading, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: AnalyticsDialog_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.brand, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: AnalyticsDialog_default.brandIcon, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "chart" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("titleLabel") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: AnalyticsDialog_default.iconButton, onClick: onClose, "aria-label": t("analyticsClose"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "close" }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.heading, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { children: t("analyticsTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: copy.scope })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: AnalyticsDialog_default.source, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", {}),
        "OpenCode Console"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: AnalyticsDialog_default.accountSelect, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: copy.account }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { "aria-label": copy.account, value: accountRef, onChange: (event) => {
          setSelected(event.target.value);
        }, disabled: !accounts.length, children: accounts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: a.apiKeyEnv, children: a.name || t("accountDefault") }, a.apiKeyEnv)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.rangeGroup, role: "group", "aria-label": t("analyticsRange"), children: RANGES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-pressed": value === range, onClick: () => {
        setRange(value);
      }, children: t(RANGE_LABELS[value]) }, value)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: AnalyticsDialog_default.utc, children: "UTC" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.toolbarActions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: AnalyticsDialog_default.iconButton, onClick: refresh, disabled: loading || !accountRef, "aria-label": copy.refresh, title: copy.refresh, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "refresh" }) }),
        exportAnalytics ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: AnalyticsDialog_default.exportButton, onClick: () => {
          void download();
        }, disabled: exporting || !report, title: copy.exportHint, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "download" }),
          exporting ? copy.exporting : copy.export
        ] }) : null
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.statusRow, "aria-live": "polite", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: report ? `${copy.refreshed} ${new Date(report.generatedAt).toLocaleTimeString(locale, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC` : "" }),
      loading && report ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: copy.refreshing }) : null
    ] }),
    exportFailed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: AnalyticsDialog_default.notice, role: "alert", children: copy.exportFailed }) : null,
    !accountRef ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.state, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "chart" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: copy.noAccounts })
    ] }) : null,
    error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.notice, role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: report ? copy.stale : errorText(error, copy) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: refresh, disabled: loading, children: copy.retry })
    ] }) : null,
    loading && !report && accountRef ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.state, role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: AnalyticsDialog_default.spinner }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: copy.loading })
    ] }) : null,
    report ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Kpis, { report, copy, locale }) : null,
    quota?.ref === accountRef ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(QuotaStrip, { quota: quota.value, copy, locale }) : quotaFailed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: AnalyticsDialog_default.quotaUnavailable, children: copy.quotaUnavailable }) : null,
    report ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      report.totals.requests === "0" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.empty, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "chart" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: copy.empty })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Trend, { days: report.byDay, copy, locale }, key),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Models, { rows: report.byModel, totals: report.totals, copy, locale })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("footer", { className: AnalyticsDialog_default.footer, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "OpenCode Console \xB7 ",
        copy.lagHint
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: copy.amountHint })
    ] })
  ] });
}
function Kpis({ report, copy, locale }) {
  const c = report.totals, days = Math.max(1, report.byDay.length), input = String(BigInt(c.inputTokens) + BigInt(c.cacheReadTokens) + BigInt(c.cacheWriteTokens));
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: AnalyticsDialog_default.kpis, "aria-label": copy.scope, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: copy.requests }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: historyNumber(c.requests, locale) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        copy.dailyAverage,
        " ",
        historyNumber(String(BigInt(c.requests) / BigInt(days)), locale),
        " / ",
        locale?.startsWith("zh") ? "\u5929" : "day"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: copy.tokens }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { title: historyNumber(c.tokens, locale), children: historyNumber(c.tokens, locale, true) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        report.byModel.length,
        " ",
        copy.models,
        " \xB7 ",
        report.byDay.filter((d) => d.requests !== "0").length,
        " ",
        copy.activeDays
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: copy.cacheHit }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { children: [
        percent(c.cacheReadTokens, input).toFixed(1),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { children: "%" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        historyNumber(c.cacheReadTokens, locale, true),
        " ",
        copy.cacheRead
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.amountKpi, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: copy.amount }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: historyMoney(c.costMicroCents, locale) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "USD \xB7 OpenCode Console" })
    ] })
  ] });
}
function QuotaStrip({ quota, copy, locale }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: AnalyticsDialog_default.quotaStrip, "aria-label": copy.quota, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: AnalyticsDialog_default.quotaTitle, children: copy.quota }),
    ["rolling", "weekly", "monthly"].map((key) => {
      const item = quota[key];
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.quotaWindow, "data-level": item.status === "rate-limited" || item.percent >= 100 ? "limited" : item.percent >= 80 ? "high" : "ok", title: `${copy.resets} ${new Date(item.resetsAt).toLocaleString(locale, { timeZone: "UTC" })} UTC`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          copy[key],
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
            item.percent,
            "%"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("progress", { max: 100, value: item.percent, "aria-label": copy[key] })
      ] }, key);
    })
  ] });
}
function Trend({ days, copy, locale }) {
  const [mode, setMode] = (0, import_react3.useState)("tokens"), [active, setActive] = (0, import_react3.useState)(null), [pinned, setPinned] = (0, import_react3.useState)(null);
  const buttons = (0, import_react3.useRef)([]);
  const maximum = days.reduce((max, day) => BigInt(day[mode]) > max ? BigInt(day[mode]) : max, 0n), selected = days[active ?? pinned ?? -1];
  const focusDay = (index) => {
    const next = Math.max(0, Math.min(days.length - 1, index));
    setActive(next);
    buttons.current[next]?.focus();
  };
  const keyboard = (event, index) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      focusDay(index + (event.key === "ArrowLeft" ? -1 : 1));
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusDay(event.key === "Home" ? 0 : days.length - 1);
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      setPinned(null);
      setActive(null);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: AnalyticsDialog_default.trend, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.sectionHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: copy.trend }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: copy.trendHint })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.segmented, role: "group", "aria-label": copy.trend, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-pressed": mode === "tokens", onClick: () => {
          setMode("tokens");
        }, children: copy.tokensMode }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-pressed": mode === "requests", onClick: () => {
          setMode("requests");
        }, children: copy.requestsMode })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.legend, children: mode === "tokens" ? PARTS.map((part) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { "data-part": part }),
      copy[LABELS[part]]
    ] }, part)) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { "data-part": "requests" }),
      copy.requests
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.chartScroll, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.chart, style: { minWidth: `${Math.max(380, days.length * 11)}px` }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.yAxis, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: historyNumber(String(maximum), locale, true) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: historyNumber(String(maximum / 2n), locale, true) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.plot, role: "group", "aria-label": copy.chartHelp, style: { gridTemplateColumns: `repeat(${Math.max(1, days.length)}, minmax(3px, 1fr))` }, onPointerLeave: () => {
        setActive(pinned);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.gridlines, "aria-hidden": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", {}),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", {}),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", {})
        ] }),
        days.map((day, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            ref: (node) => {
              buttons.current[index] = node;
            },
            className: AnalyticsDialog_default.dayBar,
            "data-day": day.day,
            "data-selected": selected?.day === day.day || void 0,
            "aria-pressed": pinned === index,
            tabIndex: index === (active ?? pinned ?? days.length - 1) ? 0 : -1,
            "aria-label": `${day.day} \xB7 ${historyNumber(day.requests, locale)} ${copy.requests} \xB7 ${historyNumber(day.tokens, locale)} ${copy.tokens}`,
            onPointerEnter: () => {
              setActive(index);
            },
            onFocus: () => {
              setActive(index);
            },
            onKeyDown: (event) => {
              keyboard(event, index);
            },
            onClick: () => {
              setPinned(pinned === index ? null : index);
              setActive(index);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: AnalyticsDialog_default.barStack, style: { height: `${Math.max(day[mode] === "0" ? 0 : 0.6, percent(day[mode], String(maximum)))}%` }, children: mode === "requests" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { "data-part": "requests", style: { flex: 1 } }) : PARTS.map((part) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { "data-part": part, style: { flex: percent(day[part], day.tokens) } }, part)) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: AnalyticsDialog_default.zeroDot })
            ]
          },
          day.day
        ))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.xAxis, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: days[0] ? dayText(days[0].day, locale) : "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: days.length > 2 ? dayText(days[Math.floor(days.length / 2)].day, locale) : "" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: days.length > 1 ? dayText(days.at(-1).day, locale) : "" })
      ] })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.dayDetail, "aria-live": "polite", children: selected ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: dayText(selected.day, locale) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "UTC" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        copy.requests,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: historyNumber(selected.requests, locale) })
      ] }),
      PARTS.map((part) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        copy[LABELS[part]],
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: historyNumber(selected[part], locale, true) })
      ] }, part)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        copy.amount,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: historyMoney(selected.costMicroCents, locale) })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: copy.selectDay }) })
  ] });
}
function Models({ rows, totals, copy, locale }) {
  const [metric, setMetric] = (0, import_react3.useState)("tokens"), [expanded, setExpanded] = (0, import_react3.useState)(false), [sort, setSort] = (0, import_react3.useState)({ field: "tokens", ascending: false });
  const compare = (a, b, field, asc = false) => {
    const left = BigInt(a[field]), right = BigInt(b[field]);
    return (left === right ? a.model.localeCompare(b.model) || a.provider.localeCompare(b.provider) : left > right ? -1 : 1) * (asc ? -1 : 1);
  };
  const ranked = [...rows].sort((a, b) => compare(a, b, metric)), visible = expanded ? ranked : ranked.slice(0, 6);
  const fields = [["requests", "requests"], ["tokens", "tokens"], ["inputTokens", "input"], ["outputTokens", "output"], ["cacheReadTokens", "cacheRead"], ["cacheWriteTokens", "cacheWrite"], ["costMicroCents", "amount"]];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: AnalyticsDialog_default.models, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.sectionHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: copy.ranking }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: copy.rankingHint })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.segmented, role: "group", "aria-label": copy.ranking, children: ["tokens", "requests", "costMicroCents"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-pressed": metric === value, onClick: () => {
          setMetric(value);
        }, children: value === "costMicroCents" ? copy.amount : copy[value] }, value)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.rankList, children: visible.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.rankRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: AnalyticsDialog_default.rankIndex, children: String(index + 1).padStart(2, "0") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.rankIdentity, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: row.model }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: row.provider })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.rankTrack, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { style: { width: `${percent(row[metric], ranked[0]?.[metric] ?? "0")}%` } }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: metricText(row, metric, locale) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
          percent(row[metric], totals[metric]).toFixed(1),
          "%"
        ] })
      ] }, JSON.stringify([row.provider, row.model]))) }),
      rows.length > 6 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: AnalyticsDialog_default.expandButton, onClick: () => {
        setExpanded((value) => !value);
      }, children: expanded ? copy.fewerModels : `${copy.allModels} (${rows.length})` }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: AnalyticsDialog_default.details, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: AnalyticsDialog_default.sectionHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: copy.details }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          rows.length,
          " ",
          copy.models
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: AnalyticsDialog_default.tableScroll, tabIndex: 0, role: "region", "aria-label": copy.details, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: copy.model }),
          fields.map(([field, label]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { "aria-sort": sort.field === field ? sort.ascending ? "ascending" : "descending" : "none", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", onClick: () => {
            setSort({ field, ascending: sort.field === field ? !sort.ascending : false });
          }, children: [
            copy[label],
            sort.field === field ? sort.ascending ? " \u2191" : " \u2193" : ""
          ] }) }, field)),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: copy.share })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: [...rows].sort((a, b) => compare(a, b, sort.field, sort.ascending)).map((row) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("td", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: row.model }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: row.provider })
          ] }),
          fields.map(([field]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { title: field === "costMicroCents" ? void 0 : historyNumber(row[field], locale), children: field === "costMicroCents" ? historyMoney(row[field], locale) : historyNumber(row[field], locale, true) }, field)),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("td", { children: [
            percent(row.tokens, totals.tokens).toFixed(1),
            "%"
          ] })
        ] }, JSON.stringify([row.provider, row.model]))) })
      ] }) })
    ] })
  ] });
}

// src/engines/opencode-go/client/UsagePill.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var sidebarAccountStorageKey = "dsh-opencode-go.sidebar-account";
var unchanged = () => 0;
var noSubscription = () => () => {
};
function usageFailure(error) {
  if (error && typeof error === "object" && "code" in error && error.code === "opencode-go/usage-unavailable" && "details" in error && error.details && typeof error.details === "object") {
    const details = error.details;
    let lastSwitch;
    try {
      if (details.lastSwitch) lastSwitch = parseAccountSwitch(details.lastSwitch);
    } catch {
    }
    return {
      ..."message" in error && typeof error.message === "string" ? { message: error.message } : {},
      retainPrevious: details.retryable === true && details.retainPrevious === true,
      ...typeof details.source === "string" ? { source: details.source } : {},
      ...lastSwitch ? { lastSwitch } : {}
    };
  }
  return { retainPrevious: false };
}
var usageRefreshTimeoutMs = 3e4;
var refreshTimedOut = Symbol("usage-refresh-timed-out");
function withRefreshTimeout(read) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(refreshTimedOut), usageRefreshTimeoutMs);
    read().then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
function usageLevel(window) {
  if (window.status === "rate-limited" || window.percent >= 100) return UsagePill_default.limited;
  return window.percent >= 80 ? UsagePill_default.high : void 0;
}
function ChevronRight() {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: UsagePill_default.icon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M6 4l4 4-4 4" }) });
}
function ChevronLeft() {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: UsagePill_default.icon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M10 4 6 8l4 4" }) });
}
function ChartIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: UsagePill_default.icon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M2.5 13.5h11M4.5 11V8M8 11V4M11.5 11V6" }) });
}
function Tick() {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: UsagePill_default.tick, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M3.5 8.5 6.5 11.5 12.5 4.5" }) });
}
function UsagePill({ directory, ...props }) {
  const state = (0, import_react4.useSyncExternalStore)(directory.subscribe, directory.getSnapshot, directory.getSnapshot);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(UsageSurface, { ...props, variant: "pill", provider: state.current?.provider });
}
function SidebarQuota({ wide, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(UsageSurface, { ...props, variant: wide ? "sidebar" : "sidebar-icon" });
}
function UsageSurface({ settings, credentialChanges, variant, provider, readAccountUsage, ...props }) {
  const readSettings = (0, import_react4.useCallback)(() => settings.getSnapshot(), [settings]);
  const subscribeSettings = (0, import_react4.useCallback)((listener) => settings.subscribe(listener), [settings]);
  const config = (0, import_react4.useSyncExternalStore)(subscribeSettings, readSettings, readSettings);
  const readChanges = (0, import_react4.useCallback)(() => credentialChanges?.getSnapshot() ?? unchanged(), [credentialChanges]);
  const subscribeChanges = (0, import_react4.useCallback)((listener) => credentialChanges?.subscribe(listener) ?? noSubscription(), [credentialChanges]);
  const credentialRevision = (0, import_react4.useSyncExternalStore)(subscribeChanges, readChanges, readChanges);
  const [analyticsOpen, setAnalyticsOpen] = (0, import_react4.useState)(false);
  const [viewedAccountId, setViewedAccountId] = (0, import_react4.useState)(() => {
    if (variant === "pill") return null;
    try {
      return globalThis.localStorage?.getItem(sidebarAccountStorageKey) ?? null;
    } catch {
      return null;
    }
  });
  const mode = config.value?.usageDisplay ?? DEFAULT_USAGE_DISPLAY;
  const visible = config.status === "ready" && config.value?.enabled !== false && (variant === "pill" ? mode === "always" || mode === "auto" && provider === PROVIDER_ID : config.value?.showSidebarQuota === true);
  const accounts = accountsOf(config.value ?? {});
  const viewedAccount = variant !== "pill" && readAccountUsage ? accounts.find((account) => account.id === viewedAccountId) ?? accounts[0] : void 0;
  const viewedRef = viewedAccount?.apiKeyEnv;
  const callingRef = accountRefOf(config.value ?? {});
  const activeRef = viewedRef ?? callingRef;
  const readSidebarUsage = (0, import_react4.useCallback)(() => viewedRef && readAccountUsage ? readAccountUsage(viewedRef) : props.readUsage(), [viewedRef, readAccountUsage, props.readUsage]);
  const readDialogQuota = (0, import_react4.useCallback)((ref) => {
    if (readAccountUsage) return readAccountUsage(ref);
    if (ref === callingRef) return props.readUsage();
    return Promise.reject(new Error("Quota is unavailable for the selected account"));
  }, [readAccountUsage, callingRef, props.readUsage]);
  (0, import_react4.useEffect)(() => {
    if (!visible || !viewedAccount) return;
    setViewedAccountId(viewedAccount.id);
    try {
      globalThis.localStorage?.setItem(sidebarAccountStorageKey, viewedAccount.id);
    } catch {
    }
  }, [visible, viewedAccount?.id]);
  const nextAccount = () => {
    setViewedAccountId((previous) => {
      const index = Math.max(0, accounts.findIndex((account) => account.id === previous));
      return accounts[(index + 1) % accounts.length].id;
    });
  };
  return visible ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      ActiveUsage,
      {
        ...props,
        readUsage: variant === "pill" ? props.readUsage : readSidebarUsage,
        accounts,
        activeRef,
        writable: config.writable,
        onNextAccount: viewedAccount && accounts.length > 1 ? nextAccount : void 0,
        variant,
        pillStyle: config.value?.usagePillStyle ?? DEFAULT_USAGE_PILL_STYLE,
        analyticsOpen,
        onAnalyticsOpenChange: setAnalyticsOpen
      },
      JSON.stringify([activeRef, config.value?.baseURL, config.value?.proxyURL, credentialRevision, accounts])
    ),
    props.readAnalytics ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      AnalyticsDialog,
      {
        open: analyticsOpen,
        onClose: () => {
          setAnalyticsOpen(false);
        },
        readAnalytics: props.readAnalytics,
        exportAnalytics: props.exportAnalytics,
        readQuota: readDialogQuota,
        accounts,
        activeRef: callingRef,
        contextKey: JSON.stringify([credentialRevision, config.value?.baseURL, config.value?.proxyURL]),
        t: props.t,
        getLocale: props.getLocale
      }
    ) : null
  ] }) : null;
}
function ActiveUsage({ readUsage, readAnalytics, t, getLocale, accounts, activeRef, writable, selectAccount, analyticsOpen, onAnalyticsOpenChange, onNextAccount, variant, pillStyle }) {
  const sidebar = variant !== "pill";
  const [snapshot, setSnapshot] = (0, import_react4.useState)(null);
  const [failed, setFailed] = (0, import_react4.useState)(null);
  const [refreshing, setRefreshing] = (0, import_react4.useState)(false);
  const [open, setOpen] = (0, import_react4.useState)(false);
  const [switching, setSwitching] = (0, import_react4.useState)(false);
  const [switchFailed, setSwitchFailed] = (0, import_react4.useState)(false);
  const [view, setView] = (0, import_react4.useState)("usage");
  const tokens = useGoThemeTokens();
  const root = (0, import_react4.useRef)(null);
  const retry = (0, import_react4.useRef)(() => {
  });
  (0, import_react4.useEffect)(() => {
    let alive = true;
    let busy = false;
    setSnapshot(null);
    setFailed(null);
    setRefreshing(false);
    const refresh = async (manual = false) => {
      if (busy || !manual && document.visibilityState === "hidden") return;
      busy = true;
      setRefreshing(true);
      try {
        const value = await withRefreshTimeout(readUsage);
        if (alive) {
          setSnapshot({ reader: readUsage, usage: value, updatedAt: Date.now() });
          setFailed(null);
        }
      } catch (error) {
        if (error === refreshTimedOut && !sidebar) return;
        if (alive) {
          const failure2 = usageFailure(error);
          setFailed({ reader: readUsage, failure: failure2 });
          setSnapshot((previous) => !sidebar && previous?.reader === readUsage && failure2.retainPrevious && typeof previous.usage.source === "string" && previous.usage.source.length > 0 && previous.usage.source === failure2.source ? previous : null);
        }
      } finally {
        busy = false;
        if (alive) setRefreshing(false);
      }
    };
    retry.current = () => {
      void refresh(true);
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 6e4);
    const visible = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      retry.current = () => {
      };
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [readUsage, sidebar]);
  (0, import_react4.useEffect)(() => {
    if (!open) return;
    const click = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  (0, import_react4.useEffect)(() => {
    if (open && view === "accounts") root.current?.querySelector('[aria-selected="true"]')?.focus();
  }, [open, view]);
  const current = snapshot?.reader === readUsage ? snapshot : null;
  const usage = current?.usage;
  const failure = failed?.reader === readUsage ? failed.failure : null;
  const notice = usage?.lastSwitch ?? failure?.lastSwitch;
  const accountName = accounts.find((account) => account.apiKeyEnv === activeRef)?.name || t("accountDefault");
  const accountsView = view === "accounts" && accounts.length > 1;
  const switchable = accounts.length > 1 && writable && selectAccount !== void 0;
  const switchTo = (ref) => {
    if (ref === activeRef) {
      setView("usage");
      return;
    }
    setSwitching(true);
    setSwitchFailed(false);
    void selectAccount?.(ref).then((accepted) => {
      setSwitchFailed(!accepted);
      if (accepted) setView("usage");
    }).catch(() => {
      setSwitchFailed(true);
    }).finally(() => {
      setSwitching(false);
    });
  };
  const label = usage ? `${t("usageRollingShort")} ${usage.rolling.percent}% \xB7 ${t("usageWeekShort")} ${usage.weekly.percent}%${sidebar ? ` \xB7 ${t("usage_monthly")} ${usage.monthly.percent}%` : ""}${failure ? ` \xB7 ${t("usageStaleShort")}` : ""}${notice ? ` \xB7 ${t("usageFallbackShort")}` : ""}${accounts.length > 1 ? ` \xB7 ${accountName}` : ""}` : `${failure ? t("usageUnavailable") : "\u2026"}${notice ? ` \xB7 ${t("usageFallbackShort")}` : ""}${accounts.length > 1 ? ` \xB7 ${accountName}` : ""}`;
  const segments = usage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.reading, "data-stale": failure ? "" : void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.unit, children: [
        t("usageRollingShort"),
        " "
      ] }),
      usage.rolling.percent,
      "%",
      " \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.unit, children: [
        t("usageWeekShort"),
        " "
      ] }),
      usage.weekly.percent,
      "%"
    ] }),
    failure ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.stale, children: [
      " \xB7 ",
      t("usageStaleShort")
    ] }) : null,
    notice ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.fallback, children: [
      " \xB7 ",
      t("usageFallbackShort")
    ] }) : null,
    accounts.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      " \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.account, children: accountName })
    ] }) : null
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    failure ? t("usageUnavailable") : "\u2026",
    notice ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.fallback, children: [
      " \xB7 ",
      t("usageFallbackShort")
    ] }) : null,
    accounts.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      " \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.account, children: accountName })
    ] }) : null
  ] });
  const triggerClass = variant === "sidebar" ? UsagePill_default.sidebarCard : variant === "sidebar-icon" ? UsagePill_default.sidebarIcon : [UsagePill_default.trigger, pillStyle === "plain" ? UsagePill_default.plain : void 0].filter(Boolean).join(" ");
  const iconOpensHistory = variant === "sidebar-icon" && readAnalytics !== void 0;
  const Trigger = !sidebar || iconOpensHistory ? "button" : "span";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "span",
    {
      className: [UsagePill_default.root, sidebar ? UsagePill_default.sidebarRoot : void 0].filter(Boolean).join(" "),
      "data-wide": sidebar ? String(variant === "sidebar") : void 0,
      ref: root,
      style: themeStyle(tokens),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Trigger,
          {
            type: !sidebar || iconOpensHistory ? "button" : void 0,
            role: sidebar && !iconOpensHistory ? "group" : void 0,
            className: triggerClass,
            "aria-expanded": iconOpensHistory ? analyticsOpen : sidebar ? void 0 : open,
            "aria-haspopup": !sidebar || iconOpensHistory ? "dialog" : void 0,
            "data-fallback": notice ? "" : void 0,
            "aria-label": iconOpensHistory ? t("sidebarAnalytics") : `${t("usageTitle")}: ${label}`,
            title: label,
            onClick: iconOpensHistory ? () => {
              onAnalyticsOpenChange(true);
            } : sidebar ? void 0 : () => {
              setOpen(!open);
              setView("usage");
            },
            children: variant === "sidebar" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.sidebarHead, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "OpenCode Go" }),
                onNextAccount ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "button",
                  {
                    type: "button",
                    className: `${UsagePill_default.sidebarBadge} ${UsagePill_default.sidebarAccountButton}`,
                    "aria-label": `${t("sidebarNextAccount")}: ${accountName}`,
                    title: `${accountName} \xB7 ${t("sidebarNextAccount")}`,
                    onClick: onNextAccount,
                    children: accountName
                  }
                ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.sidebarBadge, title: accountName, children: accounts.length ? accountName : "Go" })
              ] }),
              ["rolling", "weekly", "monthly"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: UsagePill_default.sidebarWindow, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t(`usage_${key}`) }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "progress",
                  {
                    "aria-label": t(`usage_${key}`),
                    max: 100,
                    value: usage ? Math.min(100, Math.max(0, usage[key].percent)) : 0,
                    className: [key === "rolling" ? UsagePill_default.progressRolling : key === "weekly" ? UsagePill_default.progressWeekly : UsagePill_default.progressMonthly, usage ? usageLevel(usage[key]) : void 0].filter(Boolean).join(" ")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: usage ? `${usage[key].percent}%` : failure ? "\u2014" : "\u2026" })
              ] }, key)),
              failure ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.sidebarStatus, role: "status", title: failure.message, children: t("usageUnavailable") }) : null,
              readAnalytics ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                "button",
                {
                  type: "button",
                  className: UsagePill_default.sidebarHistory,
                  "aria-label": t("sidebarAnalytics"),
                  "aria-haspopup": "dialog",
                  onClick: () => {
                    onAnalyticsOpenChange(true);
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChartIcon, {}),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("analyticsOpen") }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChevronRight, {})
                  ]
                }
              ) : null
            ] }) : variant === "sidebar-icon" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChartIcon, {}) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.pillStatus, "data-warning": failure || notice ? "" : void 0, "aria-hidden": "true" }),
              segments
            ] })
          }
        ),
        !sidebar && open && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.panel, role: "dialog", "aria-label": t("usageTitle"), "aria-busy": refreshing, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.material, "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.body, children: accountsView ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.panelHead, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: UsagePill_default.back, "aria-label": t("accountSwitchBack"), onClick: () => {
                setView("usage");
              }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChevronLeft, {}) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: t("accountSwitchTitle") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "div",
              {
                className: UsagePill_default.tile,
                role: "listbox",
                "aria-label": t("accountSwitchTitle"),
                onKeyDown: (event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setView("usage");
                    return;
                  }
                  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                  if (step === 0 && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const options = Array.from(event.currentTarget.querySelectorAll('[role="option"]'));
                  const at = options.indexOf(document.activeElement);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (at + step + options.length) % options.length;
                  options[next]?.focus();
                },
                children: accounts.map((account, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_react4.Fragment, { children: [
                  index ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.divider }) : null,
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                    "button",
                    {
                      type: "button",
                      role: "option",
                      "aria-selected": account.apiKeyEnv === activeRef,
                      "data-selected": account.apiKeyEnv === activeRef ? "" : void 0,
                      className: UsagePill_default.option,
                      disabled: switching,
                      onClick: () => {
                        switchTo(account.apiKeyEnv);
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.optionName, children: account.name || t("accountDefault") }),
                        account.apiKeyEnv === activeRef ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tick, {}) : null
                      ]
                    }
                  )
                ] }, account.id))
              }
            ),
            switchFailed ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: UsagePill_default.warning, role: "alert", children: t("accountSwitchFailed") }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: UsagePill_default.hint, children: t("accountSwitchHint") })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.panelTitle, children: t("usageTitle") }),
            accounts.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.tile, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.accHead, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.dot }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.accName, children: accountName }),
              accounts.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.tag, children: t("accountPreferredTag") }) : null,
              accounts.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                "button",
                {
                  type: "button",
                  className: UsagePill_default.switch,
                  disabled: !switchable || switching,
                  "aria-haspopup": "listbox",
                  onClick: () => {
                    setView("accounts");
                  },
                  children: [
                    t("accountSwitchAction"),
                    accounts.length > 1 ? " \xB7 " + accounts.length : "",
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChevronRight, {})
                  ]
                }
              ) : null
            ] }) }) : null,
            switchFailed ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: UsagePill_default.warning, role: "alert", children: t("accountSwitchFailed") }) : null,
            notice ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: UsagePill_default.warning, role: "status", children: [
              t(notice.reason === "quota" ? "accountFallbackQuota" : "accountFallbackCredential"),
              " ",
              accounts.find((account) => account.apiKeyEnv === notice.toRef)?.name || t("accountDefault"),
              " \xB7 ",
              new Date(notice.at).toLocaleString(getLocale?.())
            ] }) : null,
            failure ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.warning, role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: t("usageRefreshFailed") }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: failure.message ?? t("usageUnavailable") }),
              usage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t("usageStaleHint") }) : null
            ] }) : null,
            failure ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: UsagePill_default.retry,
                disabled: refreshing,
                onClick: () => {
                  retry.current();
                },
                children: t(refreshing ? "usageRefreshing" : "usageRetry")
              }
            ) : null,
            usage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.tile, children: ["rolling", "weekly", "monthly"].map((key, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_react4.Fragment, { children: [
              index ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.divider }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.window, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.windowRow, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: UsagePill_default.windowLabel, children: t(`usage_${key}`) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    "progress",
                    {
                      className: [usageLevel(usage[key]), key === "rolling" ? UsagePill_default.progressRolling : key === "weekly" ? UsagePill_default.progressWeekly : UsagePill_default.progressMonthly].filter(Boolean).join(" "),
                      "aria-label": t(`usage_${key}`),
                      max: 100,
                      value: Math.min(100, usage[key].percent)
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("strong", { className: UsagePill_default.windowPercent, children: [
                    usage[key].percent,
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.windowReset, children: [
                  t("usageResets"),
                  " ",
                  new Date(usage[key].resetsAt).toLocaleString(getLocale?.())
                ] }),
                usage[key].status === "rate-limited" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: UsagePill_default.limitedText, children: t("usageLimited") })
              ] })
            ] }, key)) }) : failure ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: UsagePill_default.hint, children: t("usageLoading") }),
            readAnalytics ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "button",
              {
                type: "button",
                className: UsagePill_default.analyticsEntry,
                "aria-haspopup": "dialog",
                onClick: () => {
                  setOpen(false);
                  onAnalyticsOpenChange(true);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChartIcon, {}),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("analyticsOpen") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChevronRight, {})
                ]
              }
            ) : null,
            current ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: UsagePill_default.foot, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
                t("usageLastUpdated"),
                " ",
                new Date(current.updatedAt).toLocaleString(getLocale?.())
              ] }),
              !failure ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  className: UsagePill_default.switch,
                  disabled: refreshing,
                  onClick: () => {
                    retry.current();
                  },
                  children: t(refreshing ? "usageRefreshing" : "usageRefresh")
                }
              ) : null
            ] }) : null
          ] }) })
        ] })
      ]
    }
  );
}

// src/engines/opencode-go/client/index.ts
var import_dsh_client_store2 = require("@deepseek-ai/dsh-client-store");
var NS = "settings.opencode-go";
var inject = ["slots", "locale", "remote", "remote.credentials", "remote.llm"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "llm-opencode-go: copy dictionaries");
  const modelsReady = ctx.remote.$mount(goRemote);
  ctx.effect(async () => await modelsReady);
  ctx.inject(["configForms", "remote.opencodeGoModels"], (child) => {
    mountSettings(child, child.configForms.get(PROFILE_ENTRY_ID), modelsReady);
  });
}
function mountSettings(ctx, scope, modelsReady) {
  const executeAccountCommand = accountCommands(ctx);
  registerUsagePill(ctx, scope, async (ref) => await executeAccountCommand({ kind: "select", ref }) === "applied");
  let readAccount;
  ctx.inject(["remote.opencodeGoUsage"], (ready) => {
    readAccount = async (ref) => {
      const result = await ready.remote.opencodeGoUsage.readAccount(ref);
      if (!result.ok) throw result.error;
      return result.value;
    };
  });
  const controller = new OpencodeGoSectionController(scope, ctx, async () => {
    await modelsReady;
    return ctx.remote.opencodeGoModels.read();
  }, async (ref) => {
    await modelsReady;
    if (readAccount === void 0) throw new Error("OpenCode Go account usage is unavailable in this session");
    return readAccount(ref);
  }, executeAccountCommand);
  ctx.effect(() => () => controller.dispose());
  const t = ctx.locale.bind(NS);
  const injected = () => ({ ...controller.inject(), t, getLocale: () => ctx.locale.getLocale().active });
  ctx.effect(() => {
    const refresh = (ref) => {
      controller.refreshCredential(ref);
    };
    const dispose = ctx.remote.$on("credentials/reference-updated", refresh);
    return () => {
      dispose();
    };
  }, "llm-opencode-go: pushed credential invalidations");
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "opencode-go",
    order: 20,
    label: () => t("nav"),
    inject: injected
  }, OpencodeGoSection));
}
function accountCommands(ctx) {
  const unavailable = async () => "unknown";
  let execute = unavailable;
  ctx.inject(["remote.opencodeGoAccounts"], (ready) => {
    ready.effect(() => {
      const connected = async (command) => {
        const result = await ready.remote.opencodeGoAccounts.execute(command);
        return result.ok ? result.value : "unknown";
      };
      execute = connected;
      return () => {
        if (execute === connected) execute = unavailable;
      };
    });
  });
  return (command) => execute(command);
}
function registerUsagePill(ctx, settings, selectAccount) {
  ctx.inject(["remote.opencodeGoUsage"], (ready) => {
    const credentialChanges = (0, import_dsh_client_store2.createSnapshotStore)(0);
    ready.effect(() => ready.remote.$on("credentials/reference-updated", (ref) => {
      if (accountsOf(settings.getSnapshot().value ?? {}).some((account) => account.apiKeyEnv === ref)) {
        credentialChanges.set(credentialChanges.getSnapshot() + 1);
      }
    }));
    const readUsage = async () => {
      const result = await ready.remote.opencodeGoUsage.read();
      if (!result.ok) throw result.error;
      return result.value;
    };
    const readAccountUsage = async (ref) => {
      const result = await ready.remote.opencodeGoUsage.readAccount(ref);
      if (!result.ok) throw result.error;
      return result.value;
    };
    let analytics;
    let exportCsv;
    ready.inject(["remote.opencodeGoAnalytics"], (withAnalytics) => {
      analytics = async (query, signal) => {
        const result = await withAnalytics.remote.opencodeGoAnalytics.read(query, signal);
        if (!result.ok) throw result.error;
        return result.value;
      };
      exportCsv = async (query, signal) => {
        const result = await withAnalytics.remote.opencodeGoAnalytics.exportCsv(query, signal);
        if (!result.ok) throw result.error;
        return result.value;
      };
    });
    const readAnalytics = async (query, signal) => {
      if (analytics === void 0) throw Object.assign(new Error("OpenCode Go analytics is unavailable in this session"), {
        code: "opencode-go/analytics-unavailable",
        details: { reason: "unavailable", retryable: false }
      });
      return analytics(query, signal);
    };
    const exportAnalytics = async (query, signal) => {
      if (exportCsv === void 0) throw new Error("OpenCode Console export is unavailable in this session");
      return exportCsv(query, signal);
    };
    const translate = ready.locale.bind("settings.opencode-go");
    const usageProps = () => ({
      settings,
      credentialChanges,
      selectAccount: async (ref) => {
        const snapshot = settings.getSnapshot();
        if (!snapshot.writable || !accountsOf(snapshot.value ?? {}).some((account) => account.apiKeyEnv === ref)) return false;
        return selectAccount ? selectAccount(ref).catch(() => false) : false;
      },
      readUsage,
      readAccountUsage,
      readAnalytics,
      exportAnalytics,
      getLocale: () => ready.locale.getLocale().active,
      t: (key) => translate(key)
    });
    ready.slots.inject("sidebar.footer.action", () => ready.slots.register({
      name: "sidebar.footer.action",
      id: "opencode-go-sidebar-quota",
      order: 1e3,
      inject: () => ({ ...usageProps(), readAccountUsage })
    }, SidebarQuota));
    ready.inject(["modelDirectories", "sessions", "remote.session"], (scope) => {
      scope.slots.inject("conversation.input.right", () => scope.slots.register({
        name: "conversation.input.right",
        id: "opencode-go-usage",
        order: 1e3,
        inject: (sessionId) => ({ ...usageProps(), directory: scope.modelDirectories.directoryFor(sessionId).store })
      }, UsagePill));
    });
  });
}

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
  for (const id4 of ids) BY_ID.set(id4, { efforts: efforts2, defaultEffort });
}
function commandCodeReasoning(upstreamId) {
  return BY_ID.get(upstreamId);
}

// src/engines/protocom/commandcode-catalog.ts
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
function decodeVariantId(id4) {
  const at = id4.lastIndexOf(MARKER);
  if (at === -1) return { upstreamId: id4 };
  const tokens = Number(id4.slice(at + MARKER.length));
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return { upstreamId: id4 };
  return { upstreamId: id4.slice(0, at), contextWindow: tokens };
}
function stripVariantId(id4) {
  return decodeVariantId(id4).upstreamId;
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
function matchRegistry(id4, registry = REGISTRY) {
  return registry.find((entry) => entry.id === id4);
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
function servesChat(id4, refused = REFUSED_CHAT_MODEL_IDS) {
  return !refused.includes(id4);
}
function acceptsImages(id4, declared, registry = REGISTRY) {
  const chosen = declared?.get(identityKey(id4, registry));
  if (chosen !== void 0) return chosen;
  return matchRegistry(id4, registry)?.vision !== false;
}
var DEFAULT_RECOMMENDED = REGISTRY.filter((entry) => entry.rank !== void 0 && servesChat(entry.id)).slice().sort((left, right) => left.rank - right.rank).map((entry) => entry.id);
function identityKey(id4, registry = REGISTRY) {
  const entry = matchRegistry(id4, registry);
  if (entry === void 0) return id4;
  if (entry.identity !== void 0) return entry.identity;
  const sibling = registry.find((candidate) => candidate.displayName === entry.displayName && candidate.identity === void 0);
  return sibling?.id ?? id4;
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
  const rankOf = (id4) => {
    const at = options.recommended?.indexOf(identityKey(id4, registry)) ?? -1;
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

// src/engines/protocom/fusion.ts
var FUSION_NS = "model-fusion";

// src/engines/protocom/client/ProtocomSection.tsx
var import_react5 = require("react");

// src/engines/protocom/retry.ts
var DEFAULT_RETRY_MAX_ATTEMPTS = 20;
var DEFAULT_RETRY_MAX_DELAY_MS = 36e5;
var RETRY_INITIAL_DELAY_MS = 500;
var MAX_RETRY_ATTEMPTS = 100;
var MAX_RETRY_DELAY_MS = 2147483647;
var RETRYABLE_FAILURE_CODES = Object.freeze([
  "EMPTY_RESPONSE",
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT"
]);

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
  const percent2 = numberField2(value.percent);
  if (percent2 !== void 0) window.percent = percent2;
  const status = stringField2(value.status);
  if (status !== void 0) window.status = status;
  const resetsAt = stringField2(value.resetsAt);
  if (resetsAt !== void 0) window.resetsAt = resetsAt;
  return window;
}
function parseGoUsage2(body) {
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
function parseCommandCodeAccountView(body) {
  const source = rec(body);
  if (source === void 0) return void 0;
  const half = (value) => {
    const entry = rec(value);
    if (entry === void 0) return void 0;
    const error = typeof entry["error"] === "string" && entry["error"].length > 0 ? entry["error"] : void 0;
    return {
      reachable: entry["reachable"] === true,
      ...error === void 0 ? {} : { error }
    };
  };
  const credits = half(source["credits"]);
  const usage = half(source["usage"]);
  if (credits === void 0 || usage === void 0) return void 0;
  const account = rec(source["account"]);
  const normalized = account === void 0 ? void 0 : parseCommandCodeAccount(
    account["credits"] === void 0 ? void 0 : { credits: account["credits"], windowLimits: account["windowLimits"] },
    account["usage"]
  );
  return {
    ...normalized === void 0 ? {} : { account: normalized },
    credits,
    usage,
    ...source["credentialRejected"] === true ? { credentialRejected: true } : {}
  };
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

// src/engines/protocom/credential-shape.ts
function describePathShapedSecret(value) {
  const inner = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  if (/^[A-Za-z]:[\\/]/.test(inner)) return "a drive path";
  if (inner.startsWith("\\\\")) return "a UNC path";
  if (/^[A-Za-z]:[^\\/]/.test(inner)) return "a drive-relative path";
  if (/ \(\d+\)$/.test(value) && /[\\/]/.test(inner)) return "a path with a duplicate-download suffix";
  return void 0;
}
function credentialEntryProblem(value) {
  const shape = describePathShapedSecret(value);
  if (shape === void 0) return void 0;
  return `That is ${shape}, not an API key. Paste the key itself -- the text you copy from the provider -- rather than the file it was saved in.`;
}

// src/engines/protocom/client/operations.ts
var PROTOCOM_ENTRY_ID = "protocom-api";
function createProtocomOperations(ctx, scope = { ns: PROTOCOM_ENTRY_ID, sectionKey: "protocom" }) {
  const { ns: discoveryNs, sectionKey } = scope;
  const rooted = (path) => [sectionKey, ...path];
  return {
    describeSettings: async () => {
      const response = await ctx.remote.settings.describe();
      if (!response.ok) return void 0;
      const entry = response.value.namespaces.find((ns) => ns.ns === PROTOCOM_ENTRY_ID);
      if (entry === void 0) return void 0;
      const value = entry.value;
      const section = value !== null && typeof value === "object" && !Array.isArray(value) ? value[sectionKey] : void 0;
      return { ...entry, value: section ?? {} };
    },
    describeCredentials: async (refs) => {
      const response = await ctx.remote.credentials.describe([...refs]);
      return response.ok ? response.value : {};
    },
    storeApiKey: async (group, ref, value, expectedRevision) => {
      const problem = credentialEntryProblem(value);
      if (problem !== void 0) return problem;
      const stored = await ctx.remote.credentials.set(ref, value);
      if (!stored.ok) return stored.error.message;
      const pointed = await ctx.remote.settings.mutate(PROTOCOM_ENTRY_ID, [
        { op: "set", path: rooted(["groups", group, "apiKey"]), value: ref },
        { op: "set", path: rooted(["groups", group, "enabled"]), value: true }
      ], expectedRevision);
      return pointed.ok ? void 0 : pointed.error.message;
    },
    writeSettings: async (ops, expectedRevision) => {
      const rootedOps = ops.map((op) => ({ ...op, path: rooted(op.path) }));
      const response = await ctx.remote.settings.mutate(PROTOCOM_ENTRY_ID, rootedOps, expectedRevision);
      if (response.ok) {
        const value = response.value.value;
        const section = value !== null && typeof value === "object" && !Array.isArray(value) ? value[sectionKey] : void 0;
        return { kind: "written", view: { ...response.value, value: section ?? {} } };
      }
      const { code, message } = response.error;
      return code === "settings/conflict" ? { kind: "conflict", message } : { kind: "refused", message };
    },
    discoverModels: async (request) => {
      const response = await ctx.remote.llm.discoverModels(discoveryNs, request);
      return response.ok ? { kind: "found", models: response.value } : { kind: "refused", message: response.error.message };
    }
  };
}

// src/engines/protocom/client/ProtocomSection.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function sectionOf(view) {
  const value = view?.value;
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function groupValueOf(section, key, family) {
  const raw = section.groups?.[key] ?? {};
  const defaults = family.defaults[key];
  return {
    enabled: raw.enabled ?? false,
    protocol: raw.protocol ?? defaults?.protocol ?? "chat-completions",
    // The card shows the effective lengths, so a group that ships a ladder
    // (StepFun) reads as configured before the deployment stores its own. A
    // normalized empty array means unset, matching the adapter's resolution.
    contextLengths: raw.contextLengths?.length ? raw.contextLengths : [...defaults?.contextLengths ?? []],
    showBalance: raw.showBalance ?? true,
    apiKeys: raw.apiKeys ?? [],
    keyPolicy: raw.keyPolicy ?? "sticky"
  };
}
function formatAmount(value, unit) {
  return unit === "USD" ? `$${value.toFixed(2)}` : `${value}${unit === void 0 ? "" : ` ${unit}`}`;
}
function QuotaView({ usage, phase, error, onRefresh, t }) {
  const windows = [
    [t("quotaRolling"), usage?.rolling],
    [t("quotaWeekly"), usage?.weekly],
    [t("quotaMonthly"), usage?.monthly]
  ];
  const rows = windows.filter((pair) => pair[1] !== void 0);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("usageQuota") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "protocom-button", disabled: phase === "loading", onClick: onRefresh, children: phase === "loading" ? t("refreshing") : t("refresh") })
    ] }),
    phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-error", children: `${t("loadFailed")}: ${error ?? ""}` }) : null,
    phase === "ready" && rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("none") }) : null,
    rows.map(([label, window]) => {
      const percent2 = window.percent ?? 0;
      const limited = window.status === "rate-limited";
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-quota-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-quota-label", children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-quota-bar", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "span",
          {
            className: limited || percent2 > 80 ? "protocom-quota-fill is-warn" : "protocom-quota-fill",
            style: { width: `${Math.min(100, Math.max(0, percent2))}%` }
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-quota-num", children: [
          `${percent2}%`,
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("small", { children: limited ? t("quotaRateLimited") : window.resetsAt === void 0 ? "" : `${t("quotaResets")} ${window.resetsAt.slice(0, 10)}` })
        ] })
      ] }, label);
    })
  ] });
}
function AccountView({ view, phase, error, onRefresh, t }) {
  const credits = view?.account?.credits;
  const usage = view?.account?.usage;
  const money = (value) => value === void 0 ? t("none") : "$" + value.toFixed(2);
  const windowRow = (label, window) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-quota-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-quota-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "protocom-quota-bar", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "div",
      {
        className: window !== void 0 && window.exceeded ? "protocom-quota-fill is-warn" : "protocom-quota-fill",
        style: { width: (window?.percent ?? 0) + "%" }
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-quota-num", children: [
      window === void 0 ? t("none") : money(window.used) + " " + t("accountUsedOfCap") + " " + money(window.cap),
      window?.resetAt === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("small", { children: t("accountResets") + " " + new Date(window.resetAt).toLocaleString() })
    ] })
  ] }, label);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("accountCredits") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "protocom-button", disabled: phase === "loading", onClick: onRefresh, children: phase === "loading" ? t("refreshing") : t("refresh") })
    ] }),
    view?.credentialRejected === true ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-error", children: t("accountCredential") }) : null,
    phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-error", children: error ?? t("loadFailed") }) : null,
    phase !== "error" && view !== void 0 && !view.credits.reachable ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: view.credits.error ?? t("accountUnavailable") }) : null,
    credits === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-quota", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-balance-item", children: [
          t("accountMonthly") + " ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: money(credits.monthlyCredits) })
        ] }),
        credits.purchasedCredits === void 0 || credits.purchasedCredits === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-balance-item", children: [
          t("balance") + " ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: money(credits.purchasedCredits) })
        ] })
      ] }),
      windowRow(t("accountFiveHour"), credits.fiveHour),
      windowRow(t("accountWeekly"), credits.weekly)
    ] }),
    view !== void 0 && !view.usage.reachable ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: view.usage.error ?? t("accountUnavailable") }) : null,
    usage === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-quota", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-balance-item", children: t("accountUsage") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-balance-item", children: [
          t("accountRequests") + " ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: usage.requests ?? t("none") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-balance-item", children: [
          t("accountSuccessRate") + " ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: usage.successRatePercent === void 0 ? t("none") : usage.successRatePercent + "%" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-balance-item", children: [
          t("accountCost") + " ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: money(usage.cost) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-balance-item", children: [
          t("accountTokens") + " ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: usage.tokens ?? (usage.tokensIn ?? 0) + " / " + (usage.tokensOut ?? 0) })
        ] })
      ] })
    ] })
  ] });
}
function BalanceView({ group, balance, phase, error, onRefresh, t }) {
  const items = [];
  const heroQuota = balance !== void 0 && balance.remaining !== void 0 && balance.limit !== void 0 && balance.limit > 0;
  if (balance !== void 0) {
    if (!heroQuota) {
      if (balance.remaining !== void 0) items.push([t("remaining"), formatAmount(balance.remaining, balance.unit)]);
      if (balance.limit !== void 0) items.push([t("limit"), formatAmount(balance.limit, balance.unit)]);
    }
    if (balance.balance !== void 0) items.push([t("balanceAmount"), formatAmount(balance.balance, balance.unit)]);
    if (balance.planName !== void 0) items.push([t("plan"), balance.planName]);
    if (balance.todayRequests !== void 0 || balance.todayCost !== void 0) {
      const parts = [
        balance.todayRequests === void 0 ? void 0 : `${balance.todayRequests} ${t("requests")}`,
        balance.todayCost === void 0 ? void 0 : formatAmount(balance.todayCost, balance.unit ?? "USD")
      ].filter((part) => part !== void 0);
      items.push([t("today"), parts.join(" \xB7 ")]);
    }
    if (balance.rpm !== void 0 || balance.tpm !== void 0) {
      items.push([t("rateWindow"), `RPM ${balance.rpm ?? t("none")} \xB7 TPM ${balance.tpm ?? t("none")}`]);
    }
    if (balance.expiresAt !== void 0) items.push([t("expiresAt"), balance.expiresAt.slice(0, 10)]);
    if (balance.rateMultiplier !== void 0) items.push([t("rateMultiplier"), `\xD7${balance.rateMultiplier}`]);
    if (balance.groupRateMultiplier !== void 0) items.push([t("groupRateMultiplier"), `\xD7${balance.groupRateMultiplier}`]);
  }
  void group;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-balance-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("balance") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "protocom-button", disabled: phase === "loading", onClick: onRefresh, children: phase === "loading" ? t("refreshing") : t("refresh") })
    ] }),
    phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-error", children: `${t("loadFailed")}: ${error ?? ""}` }) : null,
    phase === "ready" && items.length === 0 && !heroQuota ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("none") }) : null,
    heroQuota && balance !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-quota", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-quota-hero", children: [
        formatAmount(balance.remaining, balance.unit),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("small", { children: `/ ${formatAmount(balance.limit, balance.unit)} ${t("limit")}` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "protocom-quota-bar", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "div",
        {
          className: (balance.limit - balance.remaining) / balance.limit > 0.8 ? "protocom-quota-fill is-warn" : "protocom-quota-fill",
          style: { width: `${Math.min(100, Math.max(0, (balance.limit - balance.remaining) / balance.limit * 100))}%` }
        }
      ) })
    ] }) : null,
    items.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "protocom-balance-grid", children: items.map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-balance-item", children: [
      `${label} `,
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: value })
    ] }, label)) })
  ] });
}
var FILTER_THRESHOLD = 8;
function ModelRow({ model, group, family, hidden, recommended, contexts, vision, writable, busy, t, onWrite }) {
  const [openRow, setOpenRow] = (0, import_react5.useState)(false);
  const key = identityKey(model.upstreamId, family.registry);
  const hiddenSet = new Set(hidden);
  const shown = model.ids.every((id4) => !hiddenSet.has(id4));
  const starred = recommended.includes(key);
  const options = contextVariantsFor(model, group.contextLengths) ?? [model.contextWindow];
  const stored = (contexts[key] ?? []).filter((length) => options.includes(length));
  const chosen = stored.length > 0 ? stored : options;
  const images = vision[key] ?? model.vision;
  const meta = [
    ...model.reasoning === void 0 ? [] : [t("tagReasoning")]
  ].join(" \xB7 ");
  const toggleShown = () => {
    const rest = hidden.filter((id4) => !model.ids.includes(id4));
    const next = shown ? [...rest, ...model.ids] : rest;
    onWrite(next.length === 0 ? [{ op: "unset", path: ["hiddenModels"] }] : [{ op: "set", path: ["hiddenModels"], value: next }]);
  };
  const writeContexts = (next) => {
    const isDefault = next.length === options.length && next.every((length, index) => length === options[index]);
    onWrite(isDefault ? [{ op: "unset", path: ["modelContexts", key] }] : [{ op: "set", path: ["modelContexts", key], value: next }]);
  };
  const toggleVision = () => {
    onWrite(images ? [{ op: "set", path: ["visionModels", key], value: false }] : [{ op: "unset", path: ["visionModels", key] }]);
  };
  const toggleStar = () => {
    const rest = recommended.filter((id4) => id4 !== key);
    const next = starred ? rest : [...rest, key];
    onWrite(next.length === 0 ? [{ op: "unset", path: ["recommendedModels"] }] : [{ op: "set", path: ["recommendedModels"], value: next }]);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      className: shown ? "protocom-model-row" : "protocom-model-row is-off",
      title: model.ids.join("\n"),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "protocom-model-pick", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              type: "checkbox",
              checked: shown,
              disabled: !writable || busy,
              "aria-label": model.displayName,
              onChange: toggleShown
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-model-dot" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-model-name", children: model.displayName })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-model-spacer" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-model-summary", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-summary-ctx", children: chosen.map((length) => contextLabel(length)).join(" \xB7 ") }),
          images ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-summary-tag", children: t("tagVision") }) : null,
          starred ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-summary-tag is-lead", children: t("tagLead") }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-model-more",
            "aria-expanded": openRow,
            "aria-label": t("rowSettings"),
            title: t("rowSettings"),
            onClick: () => {
              setOpenRow(!openRow);
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-caret", "aria-hidden": "true", children: openRow ? "\u25BE" : "\u25B8" })
          }
        ),
        openRow ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-model-detail", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-detail-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-detail-label", children: t("contextTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-ctx", role: "group", "aria-label": t("contextTitle"), children: options.map((length) => {
              const on = chosen.includes(length);
              const last = on && chosen.length === 1;
              return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: on ? "is-on" : void 0,
                  "aria-pressed": on,
                  disabled: !writable || busy || last,
                  title: last ? t("contextLastTitle") : t("contextTitle"),
                  onClick: () => {
                    writeContexts(on ? chosen.filter((value) => value !== length) : [...chosen, length].sort((left, right) => left - right));
                  },
                  children: contextLabel(length)
                },
                length
              );
            }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-detail-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-detail-label", children: t("visionTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: images ? "protocom-vision is-on" : "protocom-vision",
                disabled: !writable || busy,
                "aria-pressed": images,
                onClick: toggleVision,
                children: images ? t("tagVision") : t("visionOff")
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-detail-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-detail-label", children: t("leadTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: starred ? "protocom-model-star is-on" : "protocom-model-star",
                disabled: !writable || busy,
                "aria-pressed": starred,
                onClick: toggleStar,
                children: "\u2605"
              }
            )
          ] }),
          meta.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-detail-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-detail-label", children: t("capabilityTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-model-meta", children: meta })
          ] })
        ] }) : null
      ]
    }
  );
}
function GroupCard({ groupKey, group, family, credential, writable, revision, probe, hidden, recommended, contexts, vision, operations, t, onChanged, onCommitted, onProbe }) {
  const ref = family.keyRef(groupKey);
  const [keyDraft, setKeyDraft] = (0, import_react5.useState)("");
  const [keyBusy, setKeyBusy] = (0, import_react5.useState)(false);
  const [keyMessage, setKeyMessage] = (0, import_react5.useState)(void 0);
  const [poolDraft, setPoolDraft] = (0, import_react5.useState)(void 0);
  const [poolNotice, setPoolNotice] = (0, import_react5.useState)(void 0);
  const [cardError, setCardError] = (0, import_react5.useState)(void 0);
  const [busy, setBusy] = (0, import_react5.useState)(false);
  const [open, setOpen] = (0, import_react5.useState)(true);
  const [filter, setFilter] = (0, import_react5.useState)("");
  const [balance, setBalance] = (0, import_react5.useState)({ phase: "idle", data: void 0, error: void 0 });
  const savePool = () => {
    if (poolDraft === void 0) return;
    const entries = poolDraft.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    const seen = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      if (seen.has(entry)) {
        setPoolNotice({ kind: "error", text: `${t("keyPoolDuplicate")} ${entry}` });
        return;
      }
      seen.add(entry);
    }
    setPoolNotice(void 0);
    setPoolDraft(void 0);
    write(entries.length === 0 ? [{ op: "unset", path: ["groups", groupKey, "apiKeys"] }] : [{ op: "set", path: ["groups", groupKey, "apiKeys"], value: entries }]);
  };
  const write = (ops) => {
    setCardError(void 0);
    setBusy(true);
    void operations.writeSettings(ops, revision).then(async (outcome) => {
      if (outcome.kind === "written") {
        onCommitted(outcome.view);
        return;
      }
      setCardError(outcome.message);
      await onChanged();
    }).finally(() => {
      setBusy(false);
    });
  };
  const loadBalance = async () => {
    setBalance((previous) => ({ ...previous, phase: "loading", error: void 0 }));
    try {
      const response = await fetch(`${family.telemetryPath}?group=${groupKey}`);
      const unavailable = family.telemetryKind === "quota" ? t("quotaUnavailable") : family.telemetryKind === "account" ? t("accountUnavailable") : t("balanceUnavailable");
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        setBalance({ phase: "error", data: void 0, error: unavailable });
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => void 0);
        throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${response.status}`);
      }
      const raw = await response.json();
      const data = family.telemetryKind === "quota" ? parseGoUsage2(raw) : family.telemetryKind === "account" ? parseCommandCodeAccountView(raw) : parseBalanceView(raw);
      if (data === void 0) throw new Error(unavailable);
      setBalance({ phase: "ready", data, error: void 0 });
    } catch (error) {
      setBalance({ phase: "error", data: void 0, error: error instanceof Error ? error.message : String(error) });
    }
  };
  const balanceVisible = group.enabled && group.showBalance;
  (0, import_react5.useEffect)(() => {
    if (balanceVisible && balance.phase === "idle") void loadBalance();
  }, [balanceVisible]);
  const saveKey = () => {
    if (keyDraft.length === 0 || keyBusy) return;
    setKeyBusy(true);
    setKeyMessage(void 0);
    void operations.storeApiKey(groupKey, ref, keyDraft, revision).then(async (failure) => {
      if (failure !== void 0) {
        setKeyMessage({ kind: "error", text: failure });
        return;
      }
      setKeyDraft("");
      setKeyMessage({ kind: "ok", text: t("keySaved") });
      await onChanged();
    }).finally(() => {
      setKeyBusy(false);
    });
  };
  const credentialConfigured = credential?.configured === true;
  const listing = probe.phase === "ready" ? probe.models : void 0;
  const rows = groupCatalog(
    groupKey,
    listing?.map((model) => ({
      id: model.id,
      ...model.name === void 0 ? {} : { displayName: model.name }
    })),
    {
      recommended,
      family,
      // Only once the group has actually been interrogated: an unprobed group
      // must not present every other group's models as its own menu.
      registryFallback: probe.phase === "ready" || probe.phase === "error"
    }
  );
  const needle = filter.trim().toLowerCase();
  const visibleRows = needle.length === 0 ? rows : rows.filter((row) => row.displayName.toLowerCase().includes(needle) || row.ids.some((id4) => id4.toLowerCase().includes(needle)));
  const groupIds = rows.flatMap((row) => [...row.ids]);
  const hiddenInGroup = groupIds.filter((id4) => hidden.includes(id4));
  const entryCount = visibleRows.reduce((total, row) => {
    const lengths = contextVariantsFor(row, group.contextLengths) ?? [row.contextWindow];
    return total + lengths.length;
  }, 0);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: group.enabled ? "protocom-card" : "protocom-card is-off", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "button",
        {
          type: "button",
          className: "protocom-card-toggle",
          "aria-expanded": open,
          title: open ? t("collapse") : t("expand"),
          onClick: () => {
            setOpen(!open);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-caret", "aria-hidden": "true", children: open ? "\u25BE" : "\u25B8" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-card-name", children: t(`group${groupKey.charAt(0).toUpperCase()}${groupKey.slice(1)}`) })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-tag", title: t("protocol"), children: group.protocol }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "protocom-head-state", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: credentialConfigured ? "protocom-dot is-on" : "protocom-dot" }),
        credentialConfigured ? t("keyConfigured") : t("keyMissing"),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "protocom-switch", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              type: "checkbox",
              role: "switch",
              checked: group.enabled,
              disabled: !writable || busy,
              "aria-label": t("enabled"),
              onChange: () => {
                write([{ op: "set", path: ["groups", groupKey, "enabled"], value: !group.enabled }]);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-switch-track", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-switch-thumb" }) }),
          t("enabled")
        ] })
      ] })
    ] }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-card-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-field-label", children: t("apiKey") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "password",
            className: "protocom-input",
            value: keyDraft,
            placeholder: credentialConfigured ? t("keyConfigured") : t("keyPlaceholder"),
            "aria-label": `${t("apiKey")} (${ref})`,
            disabled: !writable || credential?.writable === false,
            autoComplete: "new-password",
            spellCheck: false,
            onChange: (event) => {
              setKeyDraft(event.target.value);
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "protocom-button protocom-button-primary", disabled: !writable || keyBusy || keyDraft.length === 0, onClick: saveKey, children: keyBusy ? t("savingKey") : t("saveKey") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-key-state", children: credentialConfigured ? `${t("keyConfigured")} (${ref})` : `${t("keyMissing")} (${ref})` }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-field-label", children: t("keyPool") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "textarea",
          {
            className: "protocom-input protocom-keypool",
            rows: Math.max(2, (group.apiKeys?.length ?? 0) + 1),
            value: poolDraft ?? (group.apiKeys ?? []).join("\n"),
            placeholder: t("keyPoolPlaceholder"),
            "aria-label": t("keyPool"),
            disabled: !writable || busy,
            spellCheck: false,
            onChange: (event) => {
              setPoolDraft(event.target.value);
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button",
            disabled: !writable || busy || poolDraft === void 0,
            onClick: savePool,
            children: t("keyPoolApply")
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("keyPoolHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-field-label", children: t("keyPolicy") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "select",
          {
            className: "protocom-input",
            "aria-label": t("keyPolicy"),
            value: group.keyPolicy ?? "sticky",
            disabled: !writable || busy,
            onChange: (event) => {
              write([{ op: "set", path: ["groups", groupKey, "keyPolicy"], value: event.target.value }]);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "sticky", children: t("keyPolicySticky") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "round-robin", children: t("keyPolicyRoundRobin") })
            ]
          }
        )
      ] }),
      poolNotice === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: poolNotice.kind === "ok" ? "protocom-status" : "protocom-error", children: poolNotice.text }),
      keyMessage === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: keyMessage.kind === "ok" ? "protocom-status" : "protocom-error", children: keyMessage.kind === "ok" ? keyMessage.text : `${t("keyFailed")}: ${keyMessage.text}` }),
      cardError === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-error", children: cardError }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-models-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-models-title", children: t("models") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-models-count", children: rows.length === 0 ? "" : `${rows.length} ${t("modelCount")} \xB7 ${entryCount} ${t("menuEntries")}` }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-model-spacer" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button",
            disabled: probe.phase === "loading" || !writable,
            onClick: onProbe,
            children: probe.phase === "loading" ? t("probing") : t("probeRefresh")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button",
            disabled: !writable || busy || hiddenInGroup.length === 0,
            onClick: () => {
              const next = hidden.filter((id4) => !groupIds.includes(id4));
              write(next.length === 0 ? [{ op: "unset", path: ["hiddenModels"] }] : [{ op: "set", path: ["hiddenModels"], value: next }]);
            },
            children: t("selectAll")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button",
            disabled: !writable || busy || hiddenInGroup.length >= groupIds.length,
            onClick: () => {
              write([{ op: "set", path: ["hiddenModels"], value: [.../* @__PURE__ */ new Set([...hidden, ...groupIds])] }]);
            },
            children: t("selectNone")
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("modelsHint") }),
      probe.phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-error", children: `${t("probeFailed")}: ${probe.message}` }) : null,
      probe.phase === "ready" && probe.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("probeEmpty") }) : null,
      probe.phase !== "ready" && !credentialConfigured ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("probeNeedsKey") }) : null,
      probe.phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("listingFallback") }) : null,
      rows.length > FILTER_THRESHOLD ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "input",
        {
          type: "text",
          className: "protocom-input",
          value: filter,
          placeholder: t("filterModels"),
          "aria-label": t("filterModels"),
          onChange: (event) => {
            setFilter(event.target.value);
          }
        }
      ) : null,
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "protocom-models", children: visibleRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        ModelRow,
        {
          model: row,
          group,
          family,
          hidden,
          recommended,
          contexts,
          vision,
          writable,
          busy,
          t,
          onWrite: write
        },
        row.upstreamId
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("details", { className: "protocom-advanced", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("summary", { children: t("probeDetails") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "protocom-advanced-body", children: probe.phase === "ready" && probe.models.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("table", { className: "protocom-probe-table", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: t("colModel") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: t("colId") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: t("colServed") })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tbody", { children: probe.models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: matchRegistry(model.id, family.registry)?.displayName ?? (model.name !== void 0 && model.name !== model.id ? model.name : model.id) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-probe-id", children: model.id }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: servesChat(model.id, family.refused) ? t("servedYes") : t("servedNo") })
          ] }, model.id)) })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("probeHint") }) })
      ] }),
      balanceVisible ? family.telemetryKind === "quota" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        QuotaView,
        {
          usage: balance.data,
          phase: balance.phase,
          error: balance.error,
          onRefresh: () => {
            void loadBalance();
          },
          t
        }
      ) : family.telemetryKind === "account" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        AccountView,
        {
          view: balance.data,
          phase: balance.phase,
          error: balance.error,
          onRefresh: () => {
            void loadBalance();
          },
          t
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        BalanceView,
        {
          group: groupKey,
          balance: balance.data,
          phase: balance.phase,
          error: balance.error,
          onRefresh: () => {
            void loadBalance();
          },
          t
        }
      ) : null
    ] }) : null
  ] });
}
function ProtocomSection(props) {
  const { operations, t, family, copy } = props;
  if (operations === void 0 || t === void 0 || family === void 0 || copy === void 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Loaded2, { operations, t, family, copy });
}
function Loaded2({ operations, t, family, copy }) {
  const [state, setState] = (0, import_react5.useState)({ phase: "loading", credentials: {} });
  const [baseDraft, setBaseDraft] = (0, import_react5.useState)(void 0);
  const [allowCustomDraft, setAllowCustomDraft] = (0, import_react5.useState)(void 0);
  const [baseBusy, setBaseBusy] = (0, import_react5.useState)(false);
  const [baseNotice, setBaseNotice] = (0, import_react5.useState)(void 0);
  const [retryAttemptsDraft, setRetryAttemptsDraft] = (0, import_react5.useState)(void 0);
  const [retryDelayDraft, setRetryDelayDraft] = (0, import_react5.useState)(void 0);
  const [probes, setProbes] = (0, import_react5.useState)({});
  const load = async () => {
    const view2 = await operations.describeSettings();
    if (view2 === void 0) {
      setState({
        phase: "error",
        credentials: {},
        error: `${t("entryUnavailable")} (${PROTOCOM_ENTRY_ID})`
      });
      return;
    }
    const credentials = await operations.describeCredentials(family.keys.map((key) => family.keyRef(key)));
    setState({ phase: "ready", view: view2, credentials });
  };
  const applyCommitted = (view2) => {
    setState((previous) => previous.phase === "ready" ? { ...previous, view: view2, credentials: previous.credentials } : previous);
  };
  (0, import_react5.useEffect)(() => {
    if (state.phase === "loading") void load();
  }, []);
  const baseURL = state.phase === "ready" ? sectionOf(state.view).baseURL : void 0;
  const runProbe = (groupKey) => {
    setProbes((current) => ({ ...current, [groupKey]: { phase: "loading" } }));
    void operations.discoverModels({
      provider: family.providerOf(groupKey),
      ...baseURL === void 0 ? {} : { baseURL }
    }).then((outcome) => {
      setProbes((current) => ({
        ...current,
        [groupKey]: outcome.kind === "found" ? { phase: "ready", models: outcome.models } : { phase: "error", message: outcome.message }
      }));
    });
  };
  const section = state.phase === "ready" ? sectionOf(state.view) : {};
  const probeKey = family.keys.filter((key) => groupValueOf(section, key, family).enabled && state.credentials[family.keyRef(key)]?.configured === true && probes[key] === void 0).join(",");
  (0, import_react5.useEffect)(() => {
    for (const key of probeKey.length === 0 ? [] : probeKey.split(",")) void runProbe(key);
  }, [probeKey]);
  if (state.phase === "loading") return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("loading") });
  if (state.phase === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-error", children: `${t("loadFailed")}: ${state.error ?? ""}` }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "protocom-button", onClick: () => {
        void load();
      }, children: t("retry") })
    ] });
  }
  const view = state.view;
  const revision = view?.revision;
  const writable = revision !== void 0;
  const allowCustom = allowCustomDraft ?? section.allowCustomBaseURL ?? false;
  const applyBaseURL = () => {
    if (baseBusy) return;
    const nextBaseURL = baseDraft ?? baseURL ?? family.baseURL;
    let origin;
    try {
      origin = new URL(nextBaseURL).origin;
    } catch {
      origin = void 0;
    }
    const needsCustom = origin !== void 0 && origin !== family.origin;
    if (needsCustom && !allowCustom) {
      setBaseNotice({ kind: "error", text: t("allowCustomRequired") });
      return;
    }
    const attempts = Number(retryAttemptsDraft ?? retryMaxAttempts);
    const delay = Number(retryDelayDraft ?? retryMaxDelayMs);
    if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > MAX_RETRY_ATTEMPTS) {
      setBaseNotice({ kind: "error", text: t("retryInvalidAttempts") });
      return;
    }
    if (!Number.isFinite(delay) || delay < RETRY_INITIAL_DELAY_MS || delay > MAX_RETRY_DELAY_MS) {
      setBaseNotice({ kind: "error", text: t("retryInvalidDelay") });
      return;
    }
    setBaseBusy(true);
    setBaseNotice(void 0);
    void operations.writeSettings([
      ...needsCustom ? [
        { op: "set", path: ["allowCustomBaseURL"], value: true },
        { op: "set", path: ["baseURL"], value: nextBaseURL }
      ] : [
        { op: "unset", path: ["allowCustomBaseURL"] },
        { op: "set", path: ["baseURL"], value: nextBaseURL }
      ],
      { op: "set", path: ["retryMaxAttempts"], value: attempts },
      { op: "set", path: ["retryMaxDelayMs"], value: delay }
    ], revision).then(async (outcome) => {
      if (outcome.kind !== "written") {
        setBaseNotice({ kind: "error", text: outcome.message });
        await load();
        return;
      }
      setBaseNotice({ kind: "ok", text: t("saved") });
      await load();
    }).finally(() => {
      setBaseBusy(false);
    });
  };
  const retryMaxAttempts = section.retryMaxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
  const retryMaxDelayMs = section.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { className: "protocom-title", children: copy.title }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-intro", children: copy.intro }),
    writable ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("readOnly") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "protocom-groups", children: family.keys.map((key) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      GroupCard,
      {
        groupKey: key,
        family,
        group: groupValueOf(section, key, family),
        credential: state.credentials[family.keyRef(key)],
        writable,
        revision,
        probe: probes[key] ?? { phase: "idle" },
        hidden: section.hiddenModels ?? [],
        recommended: section.recommendedModels ?? family.recommended,
        contexts: section.modelContexts ?? {},
        vision: section.visionModels ?? {},
        operations,
        t,
        onChanged: load,
        onCommitted: applyCommitted,
        onProbe: () => {
          runProbe(key);
        }
      },
      key
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("details", { className: "protocom-advanced", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("summary", { children: t("advanced") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-advanced-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-field-label", children: t("baseUrl") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "text",
            className: "protocom-input",
            value: baseDraft ?? baseURL ?? "",
            "aria-label": t("baseUrl"),
            disabled: !writable,
            onChange: (event) => {
              setBaseDraft(event.target.value);
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "protocom-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              type: "checkbox",
              checked: allowCustom,
              disabled: !writable,
              "aria-label": t("allowCustom"),
              onChange: (event) => {
                setAllowCustomDraft(event.target.checked);
              }
            }
          ),
          t("allowCustom")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("allowCustomHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "protocom-button", disabled: !writable || baseBusy, onClick: applyBaseURL, children: baseBusy ? t("applying") : t("apply") })
      ] }),
      baseNotice === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: baseNotice.kind === "ok" ? "protocom-status" : "protocom-error", children: baseNotice.text }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-advanced-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-field-label", children: t("retryMaxAttempts") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "number",
            className: "protocom-input",
            min: 0,
            max: MAX_RETRY_ATTEMPTS,
            value: retryAttemptsDraft ?? String(retryMaxAttempts),
            "aria-label": t("retryMaxAttempts"),
            disabled: !writable,
            onChange: (event) => {
              setRetryAttemptsDraft(event.target.value);
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("retryMaxAttemptsHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "protocom-advanced-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "protocom-field-label", children: t("retryMaxDelayMs") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "number",
            className: "protocom-input",
            min: RETRY_INITIAL_DELAY_MS,
            value: retryDelayDraft ?? String(retryMaxDelayMs),
            "aria-label": t("retryMaxDelayMs"),
            disabled: !writable,
            onChange: (event) => {
              setRetryDelayDraft(event.target.value);
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "protocom-notice", children: t("retryMaxDelayMsHint") })
    ] })
  ] });
}

// src/engines/protocom/client/FusionSection.tsx
var import_react6 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function registryFor(provider) {
  for (const family of FAMILIES) {
    if (family.groupOf(provider) !== void 0) return family.registry;
  }
  return [];
}
function routeOption(provider, providerName, model) {
  const decoded = decodeVariantId(model.id);
  const entry = matchRegistry(stripVariantId(model.id), registryFor(provider));
  return {
    key: `${provider}\0${model.id}`,
    provider,
    providerName,
    model: model.id,
    modelName: model.name,
    contextWindow: decoded.contextWindow ?? entry?.contextWindow,
    efforts: model.reasoning?.efforts ?? [],
    defaultEffort: model.reasoning?.defaultEffort,
    pricing: entry?.pricing
  };
}
function routeOptions(catalog) {
  return catalog.groups.flatMap((group) => group.models.map((model) => routeOption(group.id, group.name, model)));
}
function optionFor(options, seat) {
  if (seat?.provider === void 0 || seat.model === void 0) return void 0;
  return options.find((option) => option.provider === seat.provider && option.model === seat.model);
}
function seatComplete(seat) {
  return seat?.provider !== void 0 && seat.provider !== "" && seat.model !== void 0 && seat.model !== "";
}
function seatHalfSet(seat) {
  if (seat === void 0) return false;
  const provider = seat.provider !== void 0 && seat.provider !== "";
  const model = seat.model !== void 0 && seat.model !== "";
  return provider !== model;
}
function price(value) {
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}
function draftFrom(state) {
  const value = state.value;
  return {
    enabled: value?.enabled ?? false,
    leader: seatComplete(value?.leader) ? { ...value.leader } : void 0,
    coder: seatComplete(value?.coder) ? { ...value.coder } : void 0,
    includeForks: value?.includeForks ?? true,
    applyLeader: value?.applyLeader ?? true
  };
}
function costBreakdown(leader, coder) {
  const priced = [leader, coder].filter((entry) => entry !== void 0);
  const total = priced.reduce((sum, entry) => sum + entry.input + entry.output, 0);
  const shareOf = (pricing) => {
    if (pricing === void 0 || total === 0) return 0;
    return (pricing.input + pricing.output) / total * 100;
  };
  return {
    rows: [
      { key: "seatLeader", pricing: leader, share: shareOf(leader) },
      { key: "seatCoder", pricing: coder, share: shareOf(coder) }
    ],
    total
  };
}
function CostStrip({ leader, coder, t }) {
  const { rows } = costBreakdown(leader?.pricing, coder?.pricing);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-fusion-cost", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-fusion-cost-title", children: t("costTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "protocom-fusion-bar", role: "presentation", children: rows.map((row) => row.pricing === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "span",
      {
        className: "protocom-fusion-bar-part",
        style: { width: `${row.share}%` },
        title: t(row.key)
      },
      row.key
    )) }),
    rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-fusion-cost-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-fusion-cost-seat", children: t(row.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-fusion-cost-prices", children: row.pricing === void 0 ? t("costUnknown") : `${t("costInput")} ${price(row.pricing.input)} \xB7 ${t("costCache")} ${row.pricing.cacheRead === void 0 ? t("costUnknown") : price(row.pricing.cacheRead)} \xB7 ${t("costOutput")} ${price(row.pricing.output)}` })
    ] }, row.key))
  ] });
}
function SeatRow({ seat, options, value, disabled, unavailable, onChange, t }) {
  const selected = optionFor(options, value);
  const label = seat === "leader" ? t("seatLeader") : t("seatCoder");
  const pickerId = `fusion-${seat}-model`;
  const effortId = `fusion-${seat}-effort`;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-fusion-seat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-fusion-seat-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "protocom-fusion-seat-label", htmlFor: pickerId, children: label }),
      selected?.contextWindow === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "protocom-fusion-ctx", children: [
        t("contextLabel"),
        " ",
        contextLabel(selected.contextWindow)
      ] }),
      unavailable ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-fusion-unavailable", children: t("seatUnavailable") }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      "select",
      {
        id: pickerId,
        className: "protocom-input",
        "aria-label": label,
        disabled,
        value: selected?.key ?? "",
        onChange: (event) => {
          const next = options.find((option) => option.key === event.target.value);
          if (next === void 0) {
            onChange(void 0);
            return;
          }
          onChange({ provider: next.provider, model: next.model });
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: t("seatUnset") }),
          options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: option.key, children: `${option.providerName} \xB7 ${option.modelName}` }, option.key))
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-fusion-effort", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "protocom-fusion-effort-label", htmlFor: effortId, children: t("effortLabel") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "select",
        {
          id: effortId,
          className: "protocom-input",
          "aria-label": `${label} ${t("effortLabel")}`,
          disabled: disabled || selected === void 0 || selected.efforts.length === 0,
          value: value?.reasoningEffort ?? "",
          onChange: (event) => {
            if (selected === void 0) return;
            const effort = event.target.value;
            onChange({
              provider: selected.provider,
              model: selected.model,
              ...effort === "" ? {} : { reasoningEffort: effort }
            });
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: selected?.defaultEffort === void 0 ? t("effortDefault") : `${t("effortDefault")} (${selected.defaultEffort})` }),
            (selected?.efforts ?? []).map((effort) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: effort.id, children: effort.name }, effort.id))
          ]
        }
      )
    ] })
  ] });
}
function Toggle({ id: id4, checked, disabled, onChange, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "protocom-switch", htmlFor: id4, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        id: id4,
        type: "checkbox",
        checked,
        disabled,
        onChange: (event) => {
          onChange(event.target.checked);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-switch-track", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-switch-thumb" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: label })
  ] });
}
function FusionSection(props) {
  const { operations, t, copy } = props;
  if (operations === void 0 || t === void 0 || copy === void 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FusionBody, { operations, t, copy });
}
function FusionBody({ operations, t, copy }) {
  const [state, setState] = (0, import_react6.useState)(() => operations.section());
  const [draft, setDraft] = (0, import_react6.useState)(void 0);
  const [load, setLoad] = (0, import_react6.useState)({ phase: "loading" });
  const [busy, setBusy] = (0, import_react6.useState)(false);
  const [notice, setNotice] = (0, import_react6.useState)(void 0);
  (0, import_react6.useEffect)(() => operations.subscribe(() => {
    setState(operations.section());
  }), [operations]);
  (0, import_react6.useEffect)(() => {
    let live = true;
    void (async () => {
      const outcome = await operations.loadCatalog();
      if (!live) return;
      setLoad(outcome.kind === "found" ? { phase: "ready", catalog: outcome.catalog } : { phase: "error", message: outcome.message });
    })();
    return () => {
      live = false;
    };
  }, [operations]);
  const catalog = load.phase === "ready" ? load.catalog : void 0;
  const options = catalog === void 0 ? [] : routeOptions(catalog);
  const stored = draftFrom(state);
  const editing = draft !== void 0;
  const effective = draft ?? stored;
  const patch = (change) => {
    setDraft((current) => ({ ...current ?? { ...stored }, ...change }));
  };
  const open = () => {
    setNotice(void 0);
    setDraft({ ...stored });
  };
  const save = async () => {
    if (draft === void 0 || busy) return;
    if (seatHalfSet(draft.leader) || seatHalfSet(draft.coder)) {
      setNotice({ kind: "error", text: t("halfSeat") });
      return;
    }
    if (draft.enabled && (!seatComplete(draft.leader) || !seatComplete(draft.coder))) {
      setNotice({ kind: "error", text: t("needBothSeats") });
      return;
    }
    setBusy(true);
    setNotice(void 0);
    try {
      const written = await operations.saveFusion(draft, state.revision);
      if (written.kind !== "written") {
        setNotice({
          kind: "error",
          text: written.kind === "conflict" ? t("conflict") : `${t("saveFailed")}: ${written.message}`
        });
        return;
      }
      const failures = draft.enabled && draft.applyLeader && seatComplete(draft.leader) ? await operations.applyLeader(draft.leader) : [];
      setDraft(void 0);
      setNotice(failures.length === 0 ? { kind: "ok", text: t("saved") } : { kind: "error", text: `${t("savedApplyFailed")}: ${failures.join(" ")}` });
    } catch (error) {
      setNotice({ kind: "error", text: `${t("saveFailed")}: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(false);
    }
  };
  const hasStoredSeats = seatComplete(stored.leader) || seatComplete(stored.coder);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { className: "protocom-title", children: copy.title }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "protocom-intro", children: copy.intro }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-card-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: stored.enabled ? "protocom-dot is-on" : "protocom-dot" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-card-name", children: t("statusTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-head-state", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "protocom-tag", children: stored.enabled ? t("statusOn") : t("statusOff") }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button",
            onClick: open,
            disabled: busy || load.phase !== "ready",
            children: t("configure")
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "protocom-notice", children: hasStoredSeats ? `${t("seatLeader")}: ${seatSummary(stored.leader, t)} \xB7 ${t("seatCoder")}: ${seatSummary(stored.coder, t)}` : t("noSeats") }),
      load.phase === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "protocom-notice", children: t("loading") }) : null,
      load.phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "protocom-error", children: [
        `${t("catalogFailed")}: ${load.message}`,
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button",
            onClick: () => {
              setLoad({ phase: "loading" });
              void operations.loadCatalog().then((outcome) => {
                setLoad(outcome.kind === "found" ? { phase: "ready", catalog: outcome.catalog } : { phase: "error", message: outcome.message });
              });
            },
            children: t("retry")
          }
        )
      ] }) : null,
      load.phase === "ready" && load.catalog.failures.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "protocom-notice", children: t("catalogPartial") }) : null,
      state.status === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "protocom-notice", children: t("sectionUnavailable") }) : null,
      notice === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: notice.kind === "ok" ? "protocom-status" : "protocom-error", children: notice.text })
    ] }),
    editing ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "protocom-fusion-modal", role: "dialog", "aria-label": t("modalTitle"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-fusion-modal-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "protocom-fusion-modal-title", children: t("modalTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "protocom-fusion-modal-intro", children: t("modalIntro") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Toggle,
        {
          id: "fusion-enabled",
          checked: effective.enabled,
          disabled: busy,
          onChange: (next) => {
            patch({ enabled: next });
          },
          label: t("enabled")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        SeatRow,
        {
          seat: "leader",
          options,
          value: effective.leader,
          disabled: busy,
          unavailable: seatComplete(effective.leader) && optionFor(options, effective.leader) === void 0,
          onChange: (next) => {
            patch({ leader: next });
          },
          t
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        SeatRow,
        {
          seat: "coder",
          options,
          value: effective.coder,
          disabled: busy,
          unavailable: seatComplete(effective.coder) && optionFor(options, effective.coder) === void 0,
          onChange: (next) => {
            patch({ coder: next });
          },
          t
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Toggle,
        {
          id: "fusion-forks",
          checked: effective.includeForks,
          disabled: busy,
          onChange: (next) => {
            patch({ includeForks: next });
          },
          label: t("includeForks")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Toggle,
        {
          id: "fusion-apply-leader",
          checked: effective.applyLeader,
          disabled: busy,
          onChange: (next) => {
            patch({ applyLeader: next });
          },
          label: t("applyLeader")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        CostStrip,
        {
          leader: optionFor(options, effective.leader),
          coder: optionFor(options, effective.coder),
          t
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "protocom-fusion-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button",
            disabled: busy,
            onClick: () => {
              setDraft(void 0);
              setNotice(void 0);
            },
            children: t("cancel")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            className: "protocom-button protocom-button-primary",
            disabled: busy || !state.writable,
            onClick: () => {
              void save();
            },
            children: busy ? t("saving") : t("save")
          }
        )
      ] })
    ] }) }) : null
  ] });
}
function seatSummary(seat, t) {
  if (!seatComplete(seat)) return t("seatUnset");
  return seat.reasoningEffort === void 0 ? seat.model : `${seat.model} (${seat.reasoningEffort})`;
}

// src/engines/protocom/client/fusion-operations.ts
var PROTOCOM_ENTRY_ID2 = "protocom-api";
var FUSION_SECTION_PATH = "fusion";
function currentSessionId(ctx) {
  const sessions = ctx.get("sessions");
  const byId = sessions?.list.getSnapshot().byId;
  if (byId === void 0) return void 0;
  return Object.values(byId).find((row) => (row.retainedBy?.mainView ?? 0) > 0)?.id;
}
function leaderTargetSession(rows, current) {
  if (current === void 0) return void 0;
  const row = rows.find((candidate) => candidate.sessionId === current);
  if (row === void 0) return void 0;
  return row.origin === "subagent" ? void 0 : current;
}
function fusionOps(draft) {
  const path = (...rest) => [FUSION_SECTION_PATH, ...rest];
  return [
    { op: "set", path: path("enabled"), value: draft.enabled },
    { op: "set", path: path("leader"), value: seatValue(draft.leader) },
    { op: "set", path: path("coder"), value: seatValue(draft.coder) },
    { op: "set", path: path("includeForks"), value: draft.includeForks },
    { op: "set", path: path("applyLeader"), value: draft.applyLeader }
  ];
}
function seatValue(seat) {
  if (seat === void 0) return {};
  return {
    provider: seat.provider,
    model: seat.model,
    ...seat.reasoningEffort === void 0 ? {} : { reasoningEffort: seat.reasoningEffort }
  };
}
function createFusionOperations(ctx, t) {
  const forms = ctx.get("configForms");
  const scope = forms.get(PROTOCOM_ENTRY_ID2);
  const session = ctx.remote.session;
  return {
    loadCatalog: async () => {
      const response = await session.modelCatalog();
      return response.ok ? { kind: "found", catalog: response.value } : { kind: "refused", message: response.error.message };
    },
    section: () => {
      const snapshot = scope.getSnapshot();
      return {
        status: snapshot.status,
        value: snapshot.value,
        revision: snapshot.revision,
        writable: snapshot.writable
      };
    },
    subscribe: (listener) => scope.subscribe(listener),
    saveFusion: async (draft, expectedRevision) => {
      try {
        const ok = await scope.mutate(fusionOps(draft), expectedRevision);
        if (ok) return { kind: "written" };
        const now = scope.getSnapshot().revision;
        return expectedRevision !== void 0 && now !== void 0 && now !== expectedRevision ? { kind: "conflict", message: t("conflict") } : { kind: "refused", message: t("saveFailed") };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { kind: "refused", message };
      }
    },
    applyLeader: async (seat) => {
      const failures = [];
      const current = currentSessionId(ctx);
      if (current === void 0) {
        failures.push(t("applyLeaderNoSession"));
        return failures;
      }
      const listed = await session.list({});
      if (!listed.ok) {
        failures.push(listed.error.message);
        return failures;
      }
      const target = leaderTargetSession(listed.value.items, current);
      if (target === void 0) {
        const row = listed.value.items.find((candidate) => candidate.sessionId === current);
        failures.push(row === void 0 ? t("applyLeaderNotListed") : t("applyLeaderSubagent"));
        return failures;
      }
      const selected = await session.selectModel({
        sessionId: target,
        provider: seat.provider,
        model: seat.model,
        ...seat.reasoningEffort === void 0 ? {} : { reasoningEffort: seat.reasoningEffort }
      });
      if (!selected.ok) failures.push(selected.error.message);
      return failures;
    }
  };
}

// src/engines/protocom/client/locale.ts
var en2 = {
  nav: "Protocom API",
  navGo: "OpenCode Go (subscription)",
  title: "Protocom API",
  titleGo: "OpenCode Go (subscription)",
  intro: "Connect to the Protocom official API. Each group below is an independent provider route with its own API key.",
  introGo: "Connect to an OpenCode Go subscription. The single Go route carries every model the endpoint serves; thinking-effort, context length, and menu ordering are set per model below.",
  readOnly: "The settings document is read-only in this deployment.",
  advanced: "Advanced",
  baseUrl: "Base URL",
  allowCustom: "Allow a custom endpoint",
  allowCustomHint: "Required before a non-default Base URL takes effect: the stored API key would be sent to that host.",
  allowCustomRequired: 'Tick "Allow a custom endpoint" first: this Base URL is not the shipped endpoint.',
  keyPool: "Key pool",
  keyPoolHint: "Extra credential references for this group, one per line. Sticky mode pins one key per conversation so its prefix cache stays warm; round-robin spreads load at the cost of that cache.",
  keyPoolPlaceholder: "PROTOCOM_AGGREGATE_API_KEY_2",
  keyPolicy: "Key selection",
  keyPolicySticky: "Sticky (keep one key per conversation)",
  keyPolicyRoundRobin: "Round-robin (rotate every request)",
  keyPoolDuplicate: "That reference is already in the pool.",
  keyPoolApply: "Save key pool",
  accountUnavailable: "Account details are not available in this deployment.",
  accountCredits: "Credits",
  accountMonthly: "Monthly remaining",
  accountFiveHour: "Five-hour window",
  accountWeekly: "Weekly window",
  accountUsedOfCap: "used of",
  accountResets: "resets",
  accountUsage: "Usage this period",
  accountRequests: "Requests",
  accountSuccessRate: "Success rate",
  accountTokens: "Tokens",
  accountCost: "Cost",
  accountCredential: "The API key was rejected; check it and save again.",
  retryMaxAttempts: "Retry attempts",
  retryMaxAttemptsHint: "How many times a dropped or failed request is retried before the step gives up. Only transient failures are retried; a bad key or a malformed request still fails at once.",
  retryMaxDelayMs: "Longest retry wait (ms)",
  retryMaxDelayMsHint: "Ceiling for one backoff wait. The delay doubles from 0.5s up to this value, so a long outage is waited out instead of ending an unattended run.",
  retryInvalidAttempts: "Enter a whole number of attempts between 0 and 100.",
  retryInvalidDelay: "Enter a wait of at least 500 ms, no more than the harness timer bound.",
  apply: "Apply",
  applying: "Applying\u2026",
  saved: "Saved.",
  groupAggregate: "Aggregate",
  groupCodex: "Codex",
  groupStepfun: "StepFun",
  groupGrok: "Grok",
  groupGo: "Go",
  groupCc: "Command Code",
  enabled: "Enabled",
  protocol: "Protocol",
  apiKey: "API key",
  keyPlaceholder: "Enter your API key",
  keyConfigured: "API key configured",
  keyMissing: "API key missing",
  saveKey: "Save key",
  savingKey: "Saving\u2026",
  keySaved: "API key saved.",
  keyFailed: "Saving the API key failed",
  probe: "Fetch available models",
  probeRefresh: "Refresh models",
  probing: "Asking the endpoint\u2026",
  probeFailed: "Model discovery failed",
  probeEmpty: "The endpoint listed no models.",
  probeHint: "The raw listing. The menu never offers an id the endpoint refuses.",
  probeDetails: "Models and upstream IDs",
  probeNeedsKey: "Enable this group and save its key to list the models this group contributes to the menu.",
  listingFallback: "The endpoint did not answer with a model listing, so these rows come from the built-in catalog.",
  colModel: "Model",
  colId: "Upstream ID",
  colVariants: "Context variants",
  colServed: "Served",
  servedYes: "yes",
  servedNo: "no",
  models: "Models in the menu",
  modelsHint: "The rows below are this group's own menu entries. Tick one to list it, pick the context lengths it offers, mark whether its entries accept image input, and star the ones that should lead the menu. Each context length is its own menu entry.",
  modelCount: "models",
  menuEntries: "menu entries",
  filterModels: "Filter models",
  visionTitle: "Whether this model's menu entries accept image input",
  visionOff: "Text only",
  rowSettings: "Model settings",
  leadTitle: "Lead the menu",
  capabilityTitle: "Capabilities",
  tagLead: "lead",
  collapse: "Collapse",
  expand: "Expand",
  selectAll: "Show all",
  selectNone: "Hide all",
  starTitle: "Lead the menu with this model",
  unstarTitle: "Stop leading the menu with this model",
  contextTitle: "Context lengths this model offers",
  contextLastTitle: "A model must keep at least one context length",
  tagVision: "vision",
  tagReasoning: "thinking",
  balance: "Balance",
  refresh: "Refresh",
  refreshing: "Refreshing\u2026",
  loading: "Loading\u2026",
  loadFailed: "Loading failed",
  entryUnavailable: "the host is not serving this plugin's settings entry",
  balanceUnavailable: "Balance is not available in this deployment.",
  retry: "Retry",
  remaining: "Remaining",
  limit: "Limit",
  balanceAmount: "Balance",
  plan: "Plan",
  today: "Today",
  requests: "requests",
  cost: "cost",
  rateWindow: "Rate window",
  expiresAt: "Expires",
  rateMultiplier: "Billing rate",
  groupRateMultiplier: "Group rate",
  usageQuota: "Usage quota",
  quotaUnavailable: "Usage quota is not available in this deployment.",
  quotaRolling: "5-hour window",
  quotaWeekly: "Weekly",
  quotaMonthly: "Monthly",
  quotaResets: "resets",
  quotaRateLimited: "rate-limited",
  none: "\u2014",
  navCommandCode: "Command Code",
  titleCommandCode: "Command Code",
  introCommandCode: "Connect a Command Code subscription. The single route carries every model your plan includes; the endpoint decides which wire each model is served on, so Anthropic-only models stay hidden until that wire is implemented.",
  navClinePass: "ClinePass",
  titleClinePass: "ClinePass",
  // Two facts a reader needs: the keys are ordinary API keys, so pooling works,
  // and the model list is NOT the endpoint's public catalog.
  introClinePass: "Connect a ClinePass subscription. Cline issues plain API keys, so several subscriptions can share this one route. The model list is the set ClinePass curates rather than the catalog the endpoint publishes, which belongs to a different product.",
  navFusion: "Fusion dual-model",
  titleFusion: "Fusion dual-model",
  introFusion: "A strong model plans, a matched one executes: the main conversation runs on the leader seat, and every delegated subagent request is pinned to the coder seat.",
  statusTitle: "Dual-model routing",
  statusOn: "On",
  statusOff: "Off",
  configure: "Configure",
  noSeats: "No seats configured yet.",
  modalTitle: "Fusion dual-model",
  modalIntro: "Pick the two seats. The leader stays switchable from the composer; every subagent request follows the coder seat.",
  seatLeader: "Leader",
  seatCoder: "Coder",
  seatUnset: "Not set",
  seatUnavailable: "This route is no longer offered by the deployment",
  effortLabel: "Thinking effort",
  effortDefault: "Model default",
  contextLabel: "Context",
  includeForks: "Forked subagents also use the coder seat",
  applyLeader: "Also make the leader the default model",
  applyLeaderNoSession: "Open or start a conversation first: the leader seat applies to a session, and none is open.",
  applyLeaderSubagent: "The current conversation is a subagent, which keeps the coder seat. Open a main conversation to apply the leader.",
  applyLeaderNotListed: "The current conversation is not in the session list yet. Reopen this editor in a moment.",
  costTitle: "Cost",
  costInput: "Input",
  costCache: "Cached",
  costOutput: "Output",
  costUnknown: "No published price",
  cancel: "Cancel",
  save: "Save and apply",
  saving: "Saving\u2026",
  savedApplyFailed: "Saved, but applying the leader failed",
  needBothSeats: "Pick both a leader and a coder seat before enabling Fusion.",
  halfSeat: "A seat is missing either its provider or its model. Pick a full route, or clear the seat.",
  conflict: "This section changed elsewhere. Reopen the editor to see the current value.",
  saveFailed: "The deployment did not accept these values",
  catalogFailed: "Could not load the model list",
  catalogPartial: "Some providers did not answer; their models are missing from this list.",
  sectionUnavailable: "This deployment does not expose the Fusion section to this client."
};
var zh2 = {
  nav: "Protocom API",
  navGo: "OpenCode Go\uFF08\u8BA2\u9605\uFF09",
  title: "Protocom API",
  titleGo: "OpenCode Go\uFF08\u8BA2\u9605\uFF09",
  intro: "\u63A5\u5165 Protocom \u5B98\u65B9 API\u3002\u4E0B\u65B9\u6BCF\u4E2A\u5206\u7EC4\u90FD\u662F\u4E00\u6761\u72EC\u7ACB\u7684 provider route\uFF0C\u5404\u81EA\u914D\u7F6E API key\u3002",
  introGo: "\u63A5\u5165 OpenCode Go \u8BA2\u9605\u3002Go \u8FD9\u4E00\u6761 route \u627F\u8F7D\u7AEF\u70B9\u63D0\u4F9B\u7684\u5168\u90E8\u6A21\u578B\uFF1B\u601D\u8003\u5F3A\u5EA6\u3001\u4E0A\u4E0B\u6587\u7248\u672C\u548C\u83DC\u5355\u6392\u5E8F\u5747\u53EF\u5728\u4E0B\u65B9\u6309\u6A21\u578B\u8BBE\u7F6E\u3002",
  readOnly: "\u5F53\u524D\u90E8\u7F72\u7684\u8BBE\u7F6E\u6587\u6863\u4E3A\u53EA\u8BFB\u3002",
  advanced: "\u9AD8\u7EA7",
  baseUrl: "Base URL",
  allowCustom: "\u5141\u8BB8\u81EA\u5B9A\u4E49\u7AEF\u70B9",
  allowCustomHint: "\u975E\u9ED8\u8BA4 Base URL \u9700\u8981\u52FE\u9009\u6B64\u9879\u624D\u4F1A\u751F\u6548\uFF1A\u5DF2\u4FDD\u5B58\u7684 API key \u4F1A\u88AB\u53D1\u5F80\u8BE5\u5730\u5740\u3002",
  allowCustomRequired: "\u8BF7\u5148\u52FE\u9009\u300C\u5141\u8BB8\u81EA\u5B9A\u4E49\u7AEF\u70B9\u300D\uFF1A\u8BE5 Base URL \u4E0D\u662F\u5B98\u65B9\u7AEF\u70B9\u3002",
  keyPool: "\u5BC6\u94A5\u6C60",
  keyPoolHint: "\u8BE5\u5206\u7EC4\u7684\u989D\u5916\u51ED\u636E\u5F15\u7528\uFF0C\u6BCF\u884C\u4E00\u4E2A\u3002\u7C98\u6027\u6A21\u5F0F\u4E3A\u6BCF\u4E2A\u4F1A\u8BDD\u56FA\u5B9A\u4E00\u628A\u5BC6\u94A5\uFF0C\u7F13\u5B58\u524D\u7F00\u6301\u7EED\u547D\u4E2D\uFF1B\u8F6E\u8BE2\u6A21\u5F0F\u5747\u8861\u8D1F\u8F7D\uFF0C\u4F46\u4F1A\u727A\u7272\u8FD9\u4EFD\u7F13\u5B58\u3002",
  keyPoolPlaceholder: "PROTOCOM_AGGREGATE_API_KEY_2",
  keyPolicy: "\u5BC6\u94A5\u9009\u62E9\u65B9\u5F0F",
  keyPolicySticky: "\u7C98\u6027\uFF08\u6BCF\u4E2A\u4F1A\u8BDD\u56FA\u5B9A\u4E00\u628A\uFF09",
  keyPolicyRoundRobin: "\u8F6E\u8BE2\uFF08\u6BCF\u6B21\u8BF7\u6C42\u8F6E\u6362\uFF09",
  keyPoolDuplicate: "\u8BE5\u5F15\u7528\u5DF2\u7ECF\u5728\u5BC6\u94A5\u6C60\u4E2D\u3002",
  keyPoolApply: "\u4FDD\u5B58\u5BC6\u94A5\u6C60",
  accountUnavailable: "\u5F53\u524D\u90E8\u7F72\u4E0D\u63D0\u4F9B\u8D26\u6237\u4FE1\u606F\u3002",
  accountCredits: "\u989D\u5EA6",
  accountMonthly: "\u6708\u5EA6\u5269\u4F59",
  accountFiveHour: "5 \u5C0F\u65F6\u7A97\u53E3",
  accountWeekly: "\u6BCF\u5468\u7A97\u53E3",
  accountUsedOfCap: "\u5DF2\u7528 / \u4E0A\u9650",
  accountResets: "\u91CD\u7F6E\u4E8E",
  accountUsage: "\u672C\u5468\u671F\u7528\u91CF",
  accountRequests: "\u8BF7\u6C42\u6570",
  accountSuccessRate: "\u6210\u529F\u7387",
  accountTokens: "Token",
  accountCost: "\u82B1\u8D39",
  accountCredential: "API \u5BC6\u94A5\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u68C0\u67E5\u540E\u91CD\u65B0\u4FDD\u5B58\u3002",
  retryMaxAttempts: "\u91CD\u8BD5\u6700\u5927\u6B21\u6570",
  retryMaxAttemptsHint: "\u8BF7\u6C42\u6389\u7EBF\u6216\u5931\u8D25\u540E\u3001\u653E\u5F03\u8BE5\u6B65\u9AA4\u524D\u6700\u591A\u91CD\u8BD5\u51E0\u6B21\u3002\u53EA\u91CD\u8BD5\u77AC\u65F6\u6545\u969C\uFF1B\u5BC6\u94A5\u9519\u8BEF\u6216\u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF\u4ECD\u4F1A\u7ACB\u5373\u5931\u8D25\u3002",
  retryMaxDelayMs: "\u91CD\u8BD5\u6700\u957F\u65F6\u95F4\uFF08\u6BEB\u79D2\uFF09",
  retryMaxDelayMsHint: "\u5355\u6B21\u9000\u907F\u7B49\u5F85\u7684\u4E0A\u9650\u3002\u9000\u907F\u4ECE 0.5 \u79D2\u8D77\u9010\u6B21\u7FFB\u500D\u76F4\u5230\u8BE5\u503C\uFF0C\u56E0\u6B64\u957F\u65F6\u95F4\u65AD\u7F51\u4F1A\u4E00\u76F4\u7B49\u4E0B\u53BB\uFF0C\u800C\u4E0D\u662F\u8BA9\u65E0\u4EBA\u503C\u5B88\u7684\u4EFB\u52A1\u4E2D\u65AD\u3002",
  retryInvalidAttempts: "\u8BF7\u8F93\u5165 0 \u5230 100 \u4E4B\u95F4\u7684\u6574\u6570\u6B21\u6570\u3002",
  retryInvalidDelay: "\u8BF7\u8F93\u5165\u4E0D\u5C0F\u4E8E 500 \u6BEB\u79D2\u3001\u4E14\u4E0D\u8D85\u8FC7\u8BA1\u65F6\u4E0A\u9650\u7684\u7B49\u5F85\u65F6\u95F4\u3002",
  apply: "\u5E94\u7528",
  applying: "\u5E94\u7528\u4E2D\u2026",
  saved: "\u5DF2\u4FDD\u5B58\u3002",
  groupAggregate: "\u5F00\u6E90\u805A\u5408",
  groupCodex: "Codex",
  groupStepfun: "StepFun",
  groupGrok: "Grok",
  groupGo: "Go",
  groupCc: "Command Code",
  enabled: "\u542F\u7528",
  protocol: "\u534F\u8BAE",
  apiKey: "API \u5BC6\u94A5",
  keyPlaceholder: "\u8F93\u5165\u4F60\u7684 API \u5BC6\u94A5",
  keyConfigured: "API \u5BC6\u94A5\u5DF2\u914D\u7F6E",
  keyMissing: "API \u5BC6\u94A5\u672A\u914D\u7F6E",
  saveKey: "\u4FDD\u5B58\u5BC6\u94A5",
  savingKey: "\u4FDD\u5B58\u4E2D\u2026",
  keySaved: "API \u5BC6\u94A5\u5DF2\u4FDD\u5B58\u3002",
  keyFailed: "\u4FDD\u5B58 API \u5BC6\u94A5\u5931\u8D25",
  probe: "\u63A2\u6D4B\u6A21\u578B",
  probeRefresh: "\u5237\u65B0\u6A21\u578B",
  probing: "\u6B63\u5728\u8BE2\u95EE\u7AEF\u70B9\u2026",
  probeFailed: "\u6A21\u578B\u63A2\u6D4B\u5931\u8D25",
  probeEmpty: "\u7AEF\u70B9\u672A\u5217\u51FA\u4EFB\u4F55\u6A21\u578B\u3002",
  probeHint: "\u8FD9\u91CC\u662F\u5BF9\u7AEF\u70B9\u7684\u539F\u59CB\u5217\u8868\u6F14\u793A\uFF1B\u7AEF\u70B9\u62D2\u7EDD\u7684 id \u4E0D\u4F1A\u8FDB\u5165\u6A21\u578B\u83DC\u5355\u3002",
  probeDetails: "\u6A21\u578B\u548C\u4E0A\u6E38 ID",
  probeNeedsKey: "\u542F\u7528\u8BE5\u5206\u7EC4\u5E76\u4FDD\u5B58\u5BC6\u94A5\u540E\uFF0C\u8FD9\u91CC\u4F1A\u5217\u51FA\u5B83\u8D21\u732E\u7ED9\u6A21\u578B\u83DC\u5355\u7684\u6A21\u578B\u3002",
  listingFallback: "\u7AEF\u70B9\u672A\u8FD4\u56DE\u6A21\u578B\u5217\u8868\uFF0C\u4E0B\u65B9\u6765\u81EA\u5185\u7F6E\u540D\u5F55\u3002",
  colModel: "\u6A21\u578B",
  colId: "\u4E0A\u6E38 ID",
  colVariants: "\u4E0A\u4E0B\u6587\u7248\u672C",
  colServed: "\u7AEF\u70B9\u63D0\u4F9B",
  servedYes: "\u662F",
  servedNo: "\u5426",
  models: "\u83DC\u5355\u4E2D\u663E\u793A\u7684\u6A21\u578B",
  modelsHint: "\u4E0B\u65B9\u5C31\u662F\u8BE5\u5206\u7EC4\u81EA\u5DF1\u5728\u6A21\u578B\u83DC\u5355\u91CC\u7684\u6761\u76EE\uFF1A\u52FE\u9009\u51B3\u5B9A\u662F\u5426\u51FA\u73B0\uFF0C\u53F3\u4FA7\u9009\u62E9\u63D0\u4F9B\u54EA\u4E9B\u4E0A\u4E0B\u6587\u7248\u672C\uFF0C\u300C\u89C6\u89C9\u300D\u51B3\u5B9A\u8FD9\u4E9B\u6761\u76EE\u662F\u5426\u58F0\u660E\u53EF\u63A5\u6536\u56FE\u7247\uFF0C\u661F\u6807\u51B3\u5B9A\u6392\u5E8F\u3002\u6BCF\u4E2A\u4E0A\u4E0B\u6587\u7248\u672C\u5728\u83DC\u5355\u91CC\u662F\u72EC\u7ACB\u7684\u4E00\u6761\u3002",
  modelCount: "\u4E2A\u6A21\u578B",
  menuEntries: "\u4E2A\u83DC\u5355\u9879",
  filterModels: "\u7B5B\u9009\u6A21\u578B",
  visionTitle: "\u8BE5\u6A21\u578B\u7684\u83DC\u5355\u6761\u76EE\u662F\u5426\u63A5\u6536\u56FE\u7247\u8F93\u5165",
  visionOff: "\u4EC5\u6587\u672C",
  rowSettings: "\u6A21\u578B\u8BBE\u7F6E",
  leadTitle: "\u5728\u83DC\u5355\u4E2D\u7F6E\u9876",
  capabilityTitle: "\u80FD\u529B",
  tagLead: "\u7F6E\u9876",
  collapse: "\u6536\u8D77",
  expand: "\u5C55\u5F00",
  selectAll: "\u5168\u90E8\u663E\u793A",
  selectNone: "\u5168\u90E8\u9690\u85CF",
  starTitle: "\u8BA9\u8BE5\u6A21\u578B\u6392\u5728\u83DC\u5355\u6700\u524D",
  unstarTitle: "\u53D6\u6D88\u7F6E\u9876",
  contextTitle: "\u8BE5\u6A21\u578B\u63D0\u4F9B\u54EA\u4E9B\u4E0A\u4E0B\u6587\u7248\u672C",
  contextLastTitle: "\u81F3\u5C11\u8981\u4FDD\u7559\u4E00\u4E2A\u4E0A\u4E0B\u6587\u7248\u672C",
  tagVision: "\u89C6\u89C9",
  tagReasoning: "\u601D\u8003",
  balance: "\u4F59\u989D",
  refresh: "\u5237\u65B0",
  refreshing: "\u5237\u65B0\u4E2D\u2026",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  entryUnavailable: "\u5BBF\u4E3B\u6CA1\u6709\u63D0\u4F9B\u672C\u63D2\u4EF6\u7684\u8BBE\u7F6E\u9879",
  balanceUnavailable: "\u5F53\u524D\u90E8\u7F72\u4E0D\u63D0\u4F9B\u4F59\u989D\u4FE1\u606F\u3002",
  retry: "\u91CD\u8BD5",
  remaining: "\u5269\u4F59\u989D\u5EA6",
  limit: "\u603B\u989D\u5EA6",
  balanceAmount: "\u4F59\u989D",
  plan: "\u5957\u9910",
  today: "\u4ECA\u65E5\u7528\u91CF",
  requests: "\u6B21\u8BF7\u6C42",
  cost: "\u82B1\u8D39",
  rateWindow: "\u901F\u7387\u7A97\u53E3",
  expiresAt: "\u5230\u671F\u65F6\u95F4",
  rateMultiplier: "\u8BA1\u8D39\u500D\u7387",
  groupRateMultiplier: "\u5206\u7EC4\u500D\u7387",
  usageQuota: "\u7528\u91CF\u914D\u989D",
  quotaUnavailable: "\u5F53\u524D\u90E8\u7F72\u4E0D\u63D0\u4F9B\u7528\u91CF\u914D\u989D\u4FE1\u606F\u3002",
  quotaRolling: "5 \u5C0F\u65F6\u7A97\u53E3",
  quotaWeekly: "\u6BCF\u5468",
  quotaMonthly: "\u6BCF\u6708",
  quotaResets: "\u91CD\u7F6E\u4E8E",
  quotaRateLimited: "\u5DF2\u9650\u6D41",
  none: "\u2014",
  navCommandCode: "Command Code",
  titleCommandCode: "Command Code",
  introCommandCode: "\u63A5\u5165 Command Code \u8BA2\u9605\u3002\u5355\u6761\u8DEF\u7531\u627F\u8F7D\u4F60\u5957\u9910\u5305\u542B\u7684\u5168\u90E8\u6A21\u578B\uFF1B\u7531\u7AEF\u70B9\u81EA\u884C\u58F0\u660E\u6BCF\u4E2A\u6A21\u578B\u8D70\u54EA\u6761\u901A\u9053\uFF0C\u56E0\u6B64\u4EC5\u652F\u6301 Anthropic \u901A\u9053\u7684\u6A21\u578B\u4F1A\u6682\u65F6\u9690\u85CF\uFF0C\u76F4\u5230\u8BE5\u901A\u9053\u5B9E\u73B0\u3002",
  navClinePass: "ClinePass",
  titleClinePass: "ClinePass",
  introClinePass: "\u63A5\u5165 ClinePass \u8BA2\u9605\u3002Cline \u7B7E\u53D1\u7684\u662F\u666E\u901A API Key\uFF0C\u56E0\u6B64\u53EF\u4EE5\u4E3A\u540C\u4E00\u6761\u8DEF\u7531\u914D\u7F6E\u591A\u4E2A\u8BA2\u9605\u3002\u6A21\u578B\u6E05\u5355\u53D6\u81EA ClinePass \u81EA\u5DF1\u7CBE\u9009\u7684\u90A3\u4E00\u5957\uFF0C\u800C\u4E0D\u662F\u7AEF\u70B9\u516C\u5F00\u7684\u76EE\u5F55\u2014\u2014\u540E\u8005\u5C5E\u4E8E\u53E6\u4E00\u4E2A\u4EA7\u54C1\u3002",
  navFusion: "Fusion \u53CC\u6A21\u578B",
  titleFusion: "Fusion \u53CC\u6A21\u578B",
  introFusion: "\u5F3A\u6A21\u578B\u6307\u6325\uFF0C\u5339\u914D\u6A21\u578B\u6267\u884C\u2014\u2014\u4E3B\u7EBF\u5BF9\u8BDD\u8D70\u6307\u6325\u4F4D\uFF0C\u6240\u6709\u5B50\u667A\u80FD\u4F53\u8BF7\u6C42\u56FA\u5B9A\u8D70\u6267\u884C\u4F4D\u3002",
  statusTitle: "\u53CC\u6A21\u578B\u8DEF\u7531",
  statusOn: "\u5DF2\u542F\u7528",
  statusOff: "\u672A\u542F\u7528",
  configure: "\u914D\u7F6E",
  noSeats: "\u5C1A\u672A\u914D\u7F6E\u5E2D\u4F4D\u3002",
  modalTitle: "Fusion \u53CC\u6A21\u578B",
  modalIntro: "\u9009\u62E9\u4E24\u4E2A\u5E2D\u4F4D\u3002\u6307\u6325\u4F4D\u4ECD\u53EF\u5728\u8F93\u5165\u6846\u4E34\u65F6\u5207\u6362\uFF1B\u6240\u6709\u5B50\u667A\u80FD\u4F53\u8BF7\u6C42\u90FD\u8D70\u6267\u884C\u4F4D\u3002",
  seatLeader: "\u6307\u6325\u4F4D",
  seatCoder: "\u6267\u884C\u4F4D",
  seatUnset: "\u672A\u8BBE\u7F6E",
  seatUnavailable: "\u5F53\u524D\u90E8\u7F72\u4E0D\u518D\u63D0\u4F9B\u8BE5\u8DEF\u7531",
  effortLabel: "\u601D\u8003\u5F3A\u5EA6",
  effortDefault: "\u6A21\u578B\u9ED8\u8BA4",
  contextLabel: "\u4E0A\u4E0B\u6587",
  includeForks: "fork \u5B50\u667A\u80FD\u4F53\u4E5F\u7528\u6267\u884C\u4F4D",
  applyLeader: "\u540C\u65F6\u628A\u6307\u6325\u4F4D\u8BBE\u4E3A\u9ED8\u8BA4\u6A21\u578B",
  applyLeaderNoSession: "\u8BF7\u5148\u6253\u5F00\u6216\u65B0\u5EFA\u4E00\u4E2A\u4F1A\u8BDD\uFF1A\u6307\u6325\u4F4D\u4F5C\u7528\u4E8E\u4F1A\u8BDD\uFF0C\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u4F1A\u8BDD\u3002",
  applyLeaderSubagent: "\u5F53\u524D\u4F1A\u8BDD\u662F\u5B50\u667A\u80FD\u4F53\uFF0C\u5B83\u56FA\u5B9A\u4F7F\u7528\u6267\u884C\u4F4D\u3002\u8BF7\u6253\u5F00\u4E00\u4E2A\u4E3B\u4F1A\u8BDD\u518D\u5E94\u7528\u6307\u6325\u4F4D\u3002",
  applyLeaderNotListed: "\u5F53\u524D\u4F1A\u8BDD\u5C1A\u672A\u51FA\u73B0\u5728\u4F1A\u8BDD\u5217\u8868\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u6253\u5F00\u6B64\u5F39\u7A97\u518D\u8BD5\u3002",
  costTitle: "\u6210\u672C",
  costInput: "\u8F93\u5165",
  costCache: "\u7F13\u5B58",
  costOutput: "\u8F93\u51FA",
  costUnknown: "\u6682\u65E0\u5B9A\u4EF7",
  cancel: "\u53D6\u6D88",
  save: "\u4FDD\u5B58\u5E76\u5E94\u7528",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  savedApplyFailed: "\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u5E94\u7528\u6307\u6325\u4F4D\u5931\u8D25",
  needBothSeats: "\u542F\u7528 Fusion \u524D\u8BF7\u5148\u9009\u62E9\u6307\u6325\u4F4D\u548C\u6267\u884C\u4F4D\u3002",
  halfSeat: "\u8BE5\u5E2D\u4F4D\u7F3A\u5C11\u670D\u52A1\u5546\u6216\u6A21\u578B\u3002\u8BF7\u9009\u62E9\u5B8C\u6574\u7EBF\u8DEF\uFF0C\u6216\u6E05\u7A7A\u8BE5\u5E2D\u4F4D\u3002",
  conflict: "\u8BE5\u914D\u7F6E\u5DF2\u5728\u522B\u5904\u53D8\u66F4\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u5F39\u7A97\u67E5\u770B\u5F53\u524D\u503C\u3002",
  saveFailed: "\u5F53\u524D\u90E8\u7F72\u672A\u63A5\u53D7\u8FD9\u4E9B\u914D\u7F6E",
  catalogFailed: "\u65E0\u6CD5\u52A0\u8F7D\u6A21\u578B\u5217\u8868",
  catalogPartial: "\u90E8\u5206 provider \u672A\u54CD\u5E94\uFF0C\u5176\u6A21\u578B\u4E0D\u5728\u5217\u8868\u4E2D\u3002",
  sectionUnavailable: "\u5F53\u524D\u90E8\u7F72\u672A\u5411\u6B64\u5BA2\u6237\u7AEF\u5F00\u653E Fusion \u914D\u7F6E\u3002"
};

// src/engines/protocom/client/styles.ts
var SECTION_CSS = `
.protocom-section { display: flex; flex-direction: column; gap: 18px; max-width: 780px; }
.protocom-title { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.01em; }
.protocom-intro { margin: -6px 0 0; font-size: 13px; line-height: 1.55; opacity: 0.72; }
.protocom-notice { margin: 0; font-size: 12px; opacity: 0.7; }
.protocom-error { margin: 0; font-size: 12px; color: var(--dsh-danger, #d03050); }
.protocom-status { margin: 0; font-size: 12px; color: var(--dsh-success, #18a058); }
.protocom-advanced summary { cursor: pointer; font-size: 13px; opacity: 0.8; width: fit-content; }
.protocom-advanced-body { display: flex; gap: 8px; align-items: center; margin-top: 8px; }

.protocom-groups { display: flex; flex-direction: column; gap: 14px; list-style: none; margin: 0; padding: 0; }
.protocom-card {
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.22));
  border-radius: 12px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px;
  background: var(--dsh-card, rgba(128, 128, 128, 0.045));
  transition: border-color 0.15s ease, opacity 0.15s ease;
}
.protocom-card:hover { border-color: var(--dsh-border-strong, rgba(128, 128, 128, 0.38)); }
.protocom-card.is-off > :not(.protocom-card-head) { opacity: 0.55; }

.protocom-card-head { display: flex; align-items: center; gap: 8px; }
.protocom-card-name { font-size: 14.5px; font-weight: 600; }
.protocom-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--dsh-badge, rgba(128, 128, 128, 0.16)); opacity: 0.85; }
.protocom-head-state { margin-left: auto; display: flex; align-items: center; gap: 7px; font-size: 12px; opacity: 0.85; }
.protocom-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsh-muted, #999); flex: none; }
.protocom-dot.is-on { background: var(--dsh-success, #18a058); }

.protocom-switch { position: relative; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; }
.protocom-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-switch-track {
  width: 34px; height: 20px; border-radius: 999px; flex: none; position: relative;
  background: var(--dsh-border, rgba(128, 128, 128, 0.4));
  transition: background 0.15s ease;
}
.protocom-switch-thumb {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  transition: transform 0.15s ease;
}
.protocom-switch input:checked + .protocom-switch-track { background: var(--dsh-accent, #3a7bfd); }
.protocom-switch input:checked + .protocom-switch-track .protocom-switch-thumb { transform: translateX(14px); }
.protocom-switch input:focus-visible + .protocom-switch-track { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: 2px; }
.protocom-switch input:disabled + .protocom-switch-track { opacity: 0.5; }

.protocom-field { display: flex; align-items: center; gap: 8px; }
.protocom-field-label { font-size: 12px; min-width: 64px; opacity: 0.7; }
.protocom-input {
  flex: 1; font-size: 13px; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: var(--dsh-input, transparent); color: inherit;
  transition: border-color 0.15s ease;
}
.protocom-input:focus { outline: none; border-color: var(--dsh-accent, #3a7bfd); }
.protocom-key-state { font-size: 11px; opacity: 0.62; margin-top: -7px; }
/* The key pool is a list of credential references, one per line, so it needs a
   fixed-ish box rather than the single-line input the primary key uses. */
.protocom-keypool { resize: vertical; font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.5; min-height: 46px; }

.protocom-button {
  font-size: 12px; padding: 5px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: transparent; color: inherit;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}
.protocom-button:hover:not(:disabled) { background: var(--dsh-hover, rgba(128, 128, 128, 0.12)); }
.protocom-button:disabled { opacity: 0.5; cursor: default; }
.protocom-button-primary { background: var(--dsh-accent, #3a7bfd); border-color: transparent; color: #fff; }
.protocom-button-primary:hover:not(:disabled) { background: var(--dsh-accent-hover, #2f6ae0); }

.protocom-probe-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.protocom-probe-table th, .protocom-probe-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.16)); }
.protocom-probe-table th { opacity: 0.62; font-weight: 500; font-size: 12px; }
.protocom-probe-table tbody tr:hover { background: var(--dsh-hover, rgba(128, 128, 128, 0.07)); }
.protocom-probe-id { font-family: ui-monospace, monospace; font-size: 11.5px; opacity: 0.62; }

.protocom-chip {
  display: inline-flex; align-items: center; margin: 2px 6px 2px 0; padding: 2px 10px;
  font-size: 11.5px; border-radius: 999px; cursor: pointer; user-select: none;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.protocom-chip input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-chip:hover { border-color: var(--dsh-accent, #3a7bfd); }
.protocom-chip.is-on { background: var(--dsh-accent, #3a7bfd); border-color: transparent; color: #fff; }

.protocom-card-toggle {
  display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0;
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.protocom-card-toggle:hover .protocom-card-name { color: var(--dsh-accent, #3a7bfd); }
.protocom-caret { width: 10px; text-align: center; font-size: 10px; opacity: 0.5; }
.protocom-card-body { display: flex; flex-direction: column; gap: 12px; }
.protocom-models-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.protocom-models-title { font-size: 12.5px; font-weight: 600; }
.protocom-models-count { font-size: 11.5px; opacity: 0.6; font-variant-numeric: tabular-nums; }
.protocom-vision {
  font-size: 11px; padding: 3px 10px; min-height: 24px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: transparent; color: inherit; opacity: 0.55;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.protocom-vision.is-on { opacity: 1; color: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }
.protocom-vision:disabled { cursor: default; opacity: 0.4; }

/* The one bounded viewport in a card: a group may contribute hundreds of menu
   entries, and the card must not grow with them. */
.protocom-models { display: flex; flex-direction: column; gap: 1px; max-height: 340px; min-height: 44px; overflow-y: auto; }
.protocom-model-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 5px 8px; border-radius: 9px;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.protocom-model-row:hover { background: var(--dsh-hover, rgba(128, 128, 128, 0.09)); }
.protocom-model-row.is-off { opacity: 0.42; }
.protocom-model-pick { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.protocom-model-row input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-model-row:focus-within { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: -2px; }
.protocom-model-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  border: 1.5px solid var(--dsh-border, rgba(128, 128, 128, 0.5));
  transition: background 0.15s ease, border-color 0.15s ease;
}
.protocom-model-row:not(.is-off) .protocom-model-dot { background: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }
.protocom-model-name { font-size: 12.5px; font-weight: 500; }
.protocom-model-row.is-off .protocom-model-name { text-decoration: line-through; }
.protocom-model-meta { font-size: 11px; opacity: 0.6; letter-spacing: 0.02em; }
.protocom-model-spacer { flex: 1 1 12px; }

/* The collapsed reading of a row: what it is set to, without opening it. */
.protocom-model-summary {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11px; opacity: 0.62; font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.protocom-summary-ctx { letter-spacing: 0.02em; }
.protocom-summary-tag {
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.3));
  border-radius: 999px; padding: 1px 7px; font-size: 10.5px;
}
.protocom-summary-tag.is-lead { color: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }

/* The per-row disclosure. Sized to the 24px WCAG 2.2 target minimum. */
.protocom-model-more {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  min-width: 24px; min-height: 24px; padding: 2px 6px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  opacity: 0.45; transition: opacity 0.15s ease, background 0.15s ease;
}
.protocom-model-more:hover { opacity: 1; background: var(--dsh-hover, rgba(128, 128, 128, 0.14)); }
.protocom-model-more:focus-visible { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: 1px; }

/* The opened row: labelled fields on their own line, wrapping rather than
   compressing, so no control shrinks below its target size. */
.protocom-model-detail {
  flex: 1 0 100%; display: flex; flex-wrap: wrap; align-items: center;
  gap: 10px 18px; padding: 8px 2px 4px 26px;
  border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.22));
  margin-top: 5px;
}
.protocom-detail-field { display: inline-flex; align-items: center; gap: 8px; }
.protocom-detail-label { font-size: 11px; opacity: 0.55; }
.protocom-model-star {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font-size: 12px; line-height: 1; padding: 3px 5px; border-radius: 50%;
  opacity: 0.3; transition: opacity 0.15s ease, color 0.15s ease;
}
.protocom-model-star:hover:not(:disabled) { opacity: 0.75; }
.protocom-model-star.is-on { opacity: 1; color: var(--dsh-accent, #3a7bfd); }
.protocom-model-star:disabled { cursor: default; }

.protocom-ctx { display: inline-flex; border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35)); border-radius: 999px; overflow: hidden; }
.protocom-ctx button {
  border: 0; border-right: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.22));
  background: transparent; color: inherit; cursor: pointer;
  font-size: 11px; padding: 4px 11px; font-variant-numeric: tabular-nums;
  /* WCAG 2.2 SC 2.5.8: a pointer target is at least 24x24 CSS px, or spaced so
     that 24px circles centred on adjacent targets do not intersect. */
  min-height: 24px;
  transition: background 0.15s ease, color 0.15s ease;
}
.protocom-ctx button:last-child { border-right: 0; }
.protocom-ctx button:hover:not(:disabled):not(.is-on) { background: var(--dsh-hover, rgba(128, 128, 128, 0.16)); }
.protocom-ctx button.is-on { background: var(--dsh-accent, #3a7bfd); color: #fff; }
.protocom-ctx button:disabled { cursor: default; }
.protocom-ctx button.is-on:disabled { opacity: 0.9; }

.protocom-balance { border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25)); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.protocom-balance-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; }
.protocom-quota { display: flex; flex-direction: column; gap: 6px; }
.protocom-quota-hero { font-size: 18px; font-weight: 650; }
.protocom-quota-hero small { font-size: 12px; font-weight: 400; opacity: 0.6; margin-left: 6px; }
.protocom-quota-bar { height: 6px; border-radius: 999px; background: var(--dsh-track, rgba(128, 128, 128, 0.18)); overflow: hidden; }
.protocom-quota-fill { height: 100%; border-radius: 999px; background: var(--dsh-accent, #3a7bfd); transition: width 0.3s ease; }
.protocom-quota-fill.is-warn { background: var(--dsh-danger, #d03050); }
.protocom-quota-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.protocom-quota-label { flex: 0 0 104px; opacity: 0.82; }
.protocom-quota-row .protocom-quota-bar { flex: 1; }
.protocom-quota-num { flex: 0 0 auto; min-width: 92px; text-align: right; opacity: 0.82; }
.protocom-quota-num small { opacity: 0.6; margin-left: 6px; }

.protocom-balance-grid { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; }
.protocom-balance-item { opacity: 0.82; }
.protocom-balance-item b { font-weight: 600; }

/* Fusion dual-model seat editor. The modal is a sheet anchored under the
   settings column rather than a full-viewport overlay, so the section it
   belongs to stays visible while it is open. */
.protocom-fusion-modal {
  border: 1px solid var(--dsh-border-strong, rgba(128, 128, 128, 0.38));
  border-radius: 12px;
  background: var(--dsh-card, rgba(128, 128, 128, 0.045));
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.protocom-fusion-modal-body { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px; }
.protocom-fusion-modal-title { margin: 0; font-size: 15px; font-weight: 650; }
.protocom-fusion-modal-intro { margin: -8px 0 0; font-size: 12.5px; line-height: 1.5; opacity: 0.72; }

.protocom-fusion-seat {
  display: flex; flex-direction: column; gap: 7px;
  border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25));
  padding-top: 12px;
}
.protocom-fusion-seat-head { display: flex; align-items: center; gap: 8px; }
.protocom-fusion-seat-label { font-size: 12.5px; font-weight: 600; }
.protocom-fusion-ctx {
  font-size: 11px; padding: 2px 9px; border-radius: 999px;
  background: var(--dsh-badge, rgba(128, 128, 128, 0.16)); opacity: 0.85;
  font-variant-numeric: tabular-nums; margin-left: auto;
}
.protocom-fusion-unavailable { font-size: 11px; color: var(--dsh-danger, #d03050); }
.protocom-fusion-effort { display: flex; align-items: center; gap: 8px; }
.protocom-fusion-effort-label { font-size: 12px; min-width: 64px; opacity: 0.7; }

.protocom-fusion-cost {
  display: flex; flex-direction: column; gap: 7px;
  border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25));
  padding-top: 12px;
}
.protocom-fusion-cost-title { font-size: 12.5px; font-weight: 600; }
.protocom-fusion-bar {
  display: flex; height: 8px; border-radius: 999px; overflow: hidden;
  background: var(--dsh-track, rgba(128, 128, 128, 0.18));
}
.protocom-fusion-bar-part { height: 100%; background: var(--dsh-accent, #3a7bfd); }
.protocom-fusion-bar-part + .protocom-fusion-bar-part { background: var(--dsh-success, #18a058); }
.protocom-fusion-cost-row { display: flex; align-items: baseline; gap: 10px; font-size: 12px; }
.protocom-fusion-cost-seat { flex: 0 0 72px; opacity: 0.72; }
.protocom-fusion-cost-prices { opacity: 0.85; font-variant-numeric: tabular-nums; }
.protocom-fusion-actions { display: flex; justify-content: flex-end; gap: 8px; }
`;

// src/engines/protocom/client/index.ts
var NS2 = "settings.protocom";
var GO_SECTION_ID = "opencode-go-sub";
var inject2 = [
  "slots",
  "locale",
  "remote",
  "remote.credentials",
  "remote.llm",
  "remote.settings"
];
function apply2(ctx) {
  ctx.effect(() => ctx.locale.register(NS2, { zh: zh2, en: en2 }));
  const t = ctx.locale.bind(NS2);
  const injectedFor = (family, titleKey, introKey) => () => ({
    operations: createProtocomOperations(ctx, family),
    t,
    family,
    copy: { title: t(titleKey), intro: t(introKey) }
  });
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset["plugin"] = "dsh-protocom-api";
    tag.textContent = SECTION_CSS;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  });
  let fusionOperations;
  const fusionInjected = () => ({
    operations: fusionOperations,
    t,
    copy: { title: t("titleFusion"), intro: t("introFusion") }
  });
  ctx.slots.inject("settings.section", () => {
    const protocom = ctx.slots.register({
      name: "settings.section",
      id: PROTOCOM.ns,
      order: 20,
      label: () => t("nav"),
      inject: injectedFor(PROTOCOM, "title", "intro")
    }, ProtocomSection);
    const go = ctx.slots.register({
      name: "settings.section",
      id: GO_SECTION_ID,
      order: 21,
      label: () => t("navGo"),
      inject: injectedFor(OPENCODE_GO, "titleGo", "introGo")
    }, ProtocomSection);
    const commandcode = ctx.slots.register({
      name: "settings.section",
      id: COMMANDCODE.ns,
      order: 23,
      label: () => t("navCommandCode"),
      inject: injectedFor(COMMANDCODE, "titleCommandCode", "introCommandCode")
    }, ProtocomSection);
    const clinepass = ctx.slots.register({
      name: "settings.section",
      id: CLINEPASS.ns,
      order: 24,
      label: () => t("navClinePass"),
      inject: injectedFor(CLINEPASS, "titleClinePass", "introClinePass")
    }, ProtocomSection);
    const fusion = ctx.inject(["remote.session", "configForms"], (fusionCtx) => {
      fusionOperations = createFusionOperations(fusionCtx, t);
      return fusionCtx.slots.register({
        name: "settings.section",
        id: FUSION_NS,
        order: 22,
        label: () => t("navFusion"),
        inject: fusionInjected
      }, FusionSection);
    });
    return () => {
      protocom();
      go();
      commandcode();
      clinepass();
      void fusion.dispose();
    };
  });
}

// src/client/index.ts
var inject3 = [.../* @__PURE__ */ new Set([...inject2, ...inject, "remote.settings"])];
function apply3(ctx) {
  const key = Symbol.for("dsh-llm-fusion.client.applied");
  const marked = ctx;
  if (marked[key] === true) return;
  marked[key] = true;
  apply(ctx);
  apply2(ctx);
}
return module.exports; } });
