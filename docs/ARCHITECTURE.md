# dsh-llm-fusion 架构说明

本文说明合并包**是怎么装起来的**：一个 group 入口、两个 Host bundle、一个浏览器端 client bundle，以及两个引擎在路由、设置、发现、HTTP 面与凭据上的命名空间如何隔离。所有断言都能在本仓库的配置、源码或 `NOTICE` 中找到依据；关键位置在文末列出。

## 1. 目标与约束

- 合并两个独立维护的 DSH 插件：`dsh-opencode-go@0.2.1` 与 `dsh-protocom-api@1.4.0`。
- 用户视角是**一个包**：一次安装、一套 `@deepseek-ai/*` 依赖版本、一个浏览器端模块。
- 两个引擎的内部实现保持原样（除 `NOTICE` 的两处本地改动外逐字一致），因此各自的测试套件可以继续独立运行。
- 既有 profile 的设置、凭据引用与 provider 路由在切换安装方式后继续有效。

v0.1 **不**做源码级收敛，理由见第 11 节。

## 2. 包形状

`package.json` 的关键接入点：

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `main` | `./lib/opencode-go/index.js` | 默认 Host 入口（OpenCode Go） |
| `exports["./opencode-go"]` | `./lib/opencode-go/index.js` | 子项 `dsh-llm-fusion/opencode-go` |
| `exports["./protocom"]` | `./lib/protocom/index.js` | 子项 `dsh-llm-fusion/protocom` |
| `exports["./client"]` | `./lib/client.js` | 包的浏览器模块 |
| `dsh.bundle.patch` | `./cordis.patch.yml` | DSH 安装/组合时应用的 bundle patch |
| `dsh.client` | `platform: web` + 4 个 `inject` | 浏览器模块的平台与宿主依赖 |
| `types` | `null` | 不发布类型声明；`exports` 里也没有 `types` 条件 |
| `files` | `lib`、`cordis.patch.yml`、`NOTICE`、`README.md` | 发布物范围；`src/`、`scripts/`、`tests/` 不随包发布 |

`engines` 把兼容性写死在包里：`node: "^22.19.0 || >=24.0.0"`、`dsh: ">=0.2.1-rc.5"`。`@deepseek-ai/*` 的 dev 与运行时依赖固定为 `0.2.1-rc.5`，`peerDependencies` 写成 `>=0.2.1-rc.5 <0.3.0-0`，这样 profile 中只解析一份 DSH 运行时服务，同时允许宿主在 0.2.x 内升级；`undici`、`openai`、`@anthropic-ai/sdk` 作为两类 Host bundle 的 external 由包自身依赖提供。

## 3. 装配总览

```text
DSH profile / loader
│
└─ entry: llm-fusion                      (@deepseek-ai/cordis-plugin-group, group: true)
   ├─ entry: opencode-go                  → package subpath dsh-llm-fusion/opencode-go
   │  └─ lib/opencode-go/index.js         → name: llm-opencode-go, inject: ['llm']
   │     ├─ provider routes: dsh-opencode-go, dsh-opencode-free
   │     ├─ typert remotes (package dsh-opencode-go): opencodeGoModels / opencodeGoUsage /
   │     │   opencodeGoAccounts / opencodeGoAnalytics
   │     └─ host settings form keyed by entry id "opencode-go"
   │
   └─ entry: protocom-api                 → package subpath dsh-llm-fusion/protocom
      └─ lib/protocom/index.js            → name: protocom-api, inject: ['llm']
         ├─ provider routes: protocom-aggregate / -codex / -stepfun / -grok /
         │   opencode-go-sub / commandcode / clinepass
         ├─ fenced fetch routes: /api/protocom-api/balance, /api/opencode-go/usage,
         │   /api/commandcode/account（ClinePass 无）
         └─ host settings form keyed by entry id "protocom-api"（五个 Config 分段）

browser
└─ one client module per package: lib/client.js
   ├─ applyGo():      settings.opencode-go + 输入栏额度 + 侧边栏额度 + 用量历史
   └─ applyProtocom(): Protocom API / OpenCode Go / Command Code / ClinePass / Fusion 设置页
```

两个 Host bundle 与浏览器模块都由同一个包发布，但**运行期职责分离**：Host 半区负责 adapter、路由、凭据解析与 telemetry；client 半区只做界面、设置读写与 Remote 调用。

## 4. group 入口

`cordis.patch.yml` 是一个 `insert` patch，插入一个 id 为 `llm-fusion` 的分组项：

```yaml
- insert:
    - id: llm-fusion
      name: "@deepseek-ai/cordis-plugin-group"
      group: true
      config:
        - id: opencode-go
          name: dsh-llm-fusion/opencode-go
        - id: protocom-api
          name: dsh-llm-fusion/protocom
```

为什么用 group 而不是两个平级 insert：

- 分组让「装/卸这个合并包」成为一个可整体启停的单元，同时保留两个子项各自的 Loader entry（生命周期、配置、日志、错误归属都仍按引擎区分）。
- 两个子项是**独立 entry**，任一 engine 的配置校验失败或服务缺失不会改动另一个 entry 的存在。

为什么保留上游 entry id（`opencode-go`、`protocom-api`）：

- DSH 1.7 以 Loader entry 作为设置表单的寻址键。`dsh-opencode-go` 的表单键是 `PROFILE_ENTRY_ID = 'opencode-go'`（`src/engines/opencode-go/contracts.ts`），`dsh-protocom-api` 的所有 family 都把读写落在 entry `protocom-api` 上（`src/engines/protocom/client/operations.ts` 的 `PROTOCOM_ENTRY_ID`，Host 侧 `PROTOCOM_NS`）。
- 沿用相同 id，既有 profile 的已存值、分区结构与凭据引用无需迁移；这也是 `cordis.patch.yml` 注释里写明的意图。

改名的代价：`cordis.patch.yml` 的子项名是**字面包名**，fork 后改名必须同步改 patch 并重新构建 `lib/`（client bundle 的模块 id 在构建时写入，见第 6 节）。

## 5. 两个 Host bundle

`scripts/build.mjs` 用 esbuild 产出两份 ESM Host bundle：

| 产物 | 入口 | 目标 | external |
| --- | --- | --- | --- |
| `lib/opencode-go/index.js` | `src/engines/opencode-go/index.ts` | `node22` | `@deepseek-ai/*`、`undici`、`openai`、`@anthropic-ai/sdk` |
| `lib/protocom/index.js` | `src/engines/protocom/index.ts` | `node22` | 同上 |
| `lib/free-http-worker.js` | `src/engines/opencode-go/free-http-worker.ts` | `es2022` | 无（独立产物） |

要点：

- **external 是刻意的**：`@deepseek-ai/*` 由 DSH 宿主提供，vendor SDK 由包依赖提供。这样 profile 里每个运行时服务只有一份实例，两个引擎看到的是同一个 `ctx.llm`、`ctx.credentials`、`ctx.settings`。
- bundle 顶部注入 `createRequire(import.meta.url)`，让 ESM 产物里可能保留的 CJS `require` 在 Node 下可用。
- `free-http-worker.js` 不由 Node 加载，而是由 `free-runtime.ts` 定位并用 Bun 执行；它单独产出，避免把 Bun 专用代码绑进 Host bundle。
- 开发态 `nodePaths` 指向并列的上游 checkout（`../dsh-opencode-go-main/node_modules` 等）；安装态直接走包自身的 `node_modules` 解析，两条路径互不依赖。

两个 Host 入口都只声明 `inject: ['llm']`，其余服务（`settings`、`credentials`、`typert`、`connection`）通过 scoped `ctx.inject` 取用。这一点是「服务缺失只降级某个面板、不整体停用插件」的关键：Protocom 的 `connection`、OpenCode Go 的 `settings`/`credentials` 都不在顶层 `inject` 里。

## 6. 单一 client bundle

DSH 每个包只加载**一个**浏览器模块（`package.json` → `dsh.client`）。因此合并后的 client 入口只有 `src/client/index.ts`：

1. 从两个引擎的 client 入口导入 `apply` 与 `inject`。
2. `inject` 取两个引擎的并集，再补上 `remote.settings`：

   ```ts
   export const inject = [...new Set([...protocomInject, ...goInject, 'remote.settings'])]
   ```

3. `apply(ctx)` 先 `applyGo(ctx)` 再 `applyProtocom(ctx)`，并用 `Symbol.for('dsh-llm-fusion.client.applied')` 做幂等守卫——一个包插入两个子 entry 时，client 模块可能被每个子项各请求一次，重复注册会把每个 slot 声明翻倍。

构建侧（`scripts/build.mjs`）：

- `format: cjs`、`platform: browser`、`target: es2022`、`jsx: automatic`。
- 输出包在 DSH 的模块加载器协议里：`window.__ModuleLoader__.load({ id: pkg.name, factory: (require) => { ... return module.exports } })`。因此模块 id 在构建时等于 `dsh-llm-fusion`，改名必须重建。
- external 固定为 `react`、`react/jsx-runtime`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`；构建末尾会检查 metafile，出现其它 external 直接失败。
- `.module.css` 由自定义插件在构建期用 lightningcss 编译成「哈希类名映射 + 一次性 `<style data-plugin="dsh-llm-fusion" data-plugin-css=...>` 注入」的 JS 模块。

## 7. 命名空间隔离表

两个引擎在同一进程、同一 client 上下文里共存，靠下面这些互不重叠的键位区分：

| 隔离层 | OpenCode Go 引擎 | Protocom 引擎 |
| --- | --- | --- |
| Loader entry id | `opencode-go` | `protocom-api` |
| 包内子路径 | `dsh-llm-fusion/opencode-go` | `dsh-llm-fusion/protocom` |
| Host bundle | `lib/opencode-go/index.js` | `lib/protocom/index.js` |
| Host 插件 `name` 导出 | `llm-opencode-go` | `protocom-api` |
| provider 路由 | `dsh-opencode-go`、`dsh-opencode-free` | `protocom-aggregate`、`protocom-codex`、`protocom-stepfun`、`protocom-grok`、`opencode-go-sub`、`commandcode`、`clinepass` |
| 设置表单寻址 | entry `opencode-go`（`PROFILE_ENTRY_ID`） | entry `protocom-api`（`PROTOCOM_ENTRY_ID`）；每 family 以 `sectionKey` 为路径根 |
| Config 顶层字段 | entry 自身即 schema | `protocom`、`opencodeGo`、`commandcode`、`clinepass`、`fusion` |
| 设置页 tab id（`settings.section`） | `opencode-go` | `protocom-api`、`opencode-go`、`commandcode`、`clinepass`、`model-fusion` |
| 模型发现名（`registerModelDiscovery`） | `llm-opencode-go` | 每 family 一个：`protocom-api`、`opencode-go`、`commandcode`、`clinepass` |
| 有围栏的 HTTP fetch 路由 | 无；浏览器侧走 typert typed remote（package `dsh-opencode-go`） | `/api/protocom-api/balance`（GET）、`/api/opencode-go/usage`（GET）、`/api/commandcode/account`（GET）；ClinePass 不挂 |
| 凭据引用 | `OPENCODE_API_KEY`（默认）、`DSH_OPENCODE_GO_ACCOUNT_*` | `PROTOCOM_<GROUP>_API_KEY`、`OPENCODE_GO_API_KEY`、`COMMANDCODE_API_KEY`、`CLINE_API_KEY` |
| locale namespace | `settings.opencode-go` | `settings.protocom` |
| 独有产物 | `lib/free-http-worker.js`（Bun 执行） | — |

几处容易混淆的命名，单独说明：

- `SETTINGS_NAMESPACE = 'llm-opencode-go'`（`src/engines/opencode-go/contracts.ts`）是引擎导出的诊断标识（`NS`），**不是**表单键；OpenCode Go 的设置表单以 entry id `opencode-go` 寻址。
- Protocom 的四个 family 和一个订阅 family 全部读写同一个 `protocom-api` entry（DSH 1.7 一插件一 Config），family 之间靠 `sectionKey`（`protocom` / `opencodeGo` / `commandcode` / `clinepass`）区分；`PROTOCOM_NS` 与 entry id 相同。
- 设置页 tab id 与设置寻址是两套键：Protocom 的 family tab 即使叫 `opencode-go`，写入的仍是 `protocom-api` entry 的 `opencodeGo` 段（`src/engines/protocom/client/operations.ts` 的 `rooted()`）。

单条 provider 路由的归属：

| Provider id | 引擎 | 端点 | 声明协议 |
| --- | --- | --- | --- |
| `dsh-opencode-go` | OpenCode Go | `https://opencode.ai/inference/go/v1` | pi-ai 多 wire（chat-completions / responses / anthropic-messages / google） |
| `dsh-opencode-free` | OpenCode Go | `https://opencode.ai/inference/v1` | 同上，Free 通道 + 公共兜底 |
| `protocom-aggregate` | Protocom | `https://relay.protocom.org` | chat-completions |
| `protocom-codex` | Protocom | `https://relay.protocom.org` | responses |
| `protocom-stepfun` | Protocom | `https://relay.protocom.org` | responses |
| `protocom-grok` | Protocom | `https://relay.protocom.org` | chat-completions |
| `opencode-go-sub` | Protocom | `https://opencode.ai/zen/go` | 默认 chat-completions，个别模型按 registry 声明 responses |
| `commandcode` | Protocom | `https://api.commandcode.ai/provider` | 以 chat-completions 为主，逐模型端点声明覆盖；Anthropic-only 模型排除 |
| `clinepass` | Protocom | `https://api.cline.bot/api/v1` | chat-completions，模型目录取内置 registry |

`opencode-go-sub` 的命名是刻意的：DSH 自带 `dsh-llm-pi-ai` 已经无条件声明了 `opencode-go` 这个目录名，再注册同名路由会触发 `DUPLICATE_DIRECTORY` 启动失败（依据见 `src/engines/protocom/family.ts` 的 `GO_PROVIDER` 注释）。因此 Protocom 的订阅路由用 `-sub` 后缀，而 OpenCode Go 引擎自己的路由 id 是 `dsh-opencode-go`。

## 8. 一次请求的流向

1. **发现/上架**：Host 启动时，两个引擎分别调用 `ctx.llm.registerAdapter([providerIds], adapter)` 或 `ctx.llm.registerConfigurableProviders(...)`，把路由暴露给模型选择器；Protocom 的路由集合随 `enabled` 分组集合变化，用 `handle.replace(routes)` 原地更新，避免「先销毁再注册」造成空窗。
2. **选择**：客户端把 provider id + model 交给 `ctx.llm`；Fusion 若启用，会在主会话/子代理请求上把 model 改写成 Leader/Coder 座位。
3. **解析连接事实**：adapter 在每次请求时读取 live settings（不缓存跨请求状态），解析 baseURL、协议、key 池选中的凭据引用、代理与超时；一次流内冻结这一组事实。
4. **发请求**：OpenCode Go 引擎经 pi-ai 的 api 模块与自研 transport（可选 SOCKS/HTTP 代理；Free 走 Bun worker）；Protocom 引擎按 family 的 wire 实现发 chat-completions / responses / messages，并附上 `sessionHeader`（订阅 family 为 `x-opencode-session` + `x-deepseek-harness-session-id`）。
5. **遥测**：Protocom 的余额/额度/账户面板走 `connection.fetch.register` 注册的有围栏路由（Web 载体自带 Host/Origin + cookie 校验，桌面走 IPC 边界）；OpenCode Go 引擎走 typert typed remote。两者都不自我注册 `webServer` 精确路由。
6. **设置写回**：client 通过 `remote.settings` 写 entry 配置；Host 收到 `loader/volatile-update` 后同步路由集合与面板缓存。

## 9. 生命周期与降级

- 每个 Host 引擎在 `ctx.effect` 中释放 adapter 注册句柄、discovery 注册与 fetch 路由；分组整体卸载时两个子项各自清理。
- 可选服务缺失是**局部降级**：Protocom 没有 `connection` 时不挂 telemetry 路由（面板隐藏），没有 `attachments` 时拒绝图片输入而不是丢弃；OpenCode Go 没有 `credentials` 时回退到启动环境变量。
- 客户端同理：`remote.session` / `configForms` 只被 Fusion 页 scoped inject，缺任何一个只少 Fusion 页，不会带走四个 provider 页。

## 10. 设置页注册顺序

Protocom client 在一个 `slots.inject('settings.section', ...)` 回调里依次注册 `protocom-api`(20)、`opencode-go`(21)、`commandcode`(23)、`clinepass`(24)，并在同一回调里通过 scoped `ctx.inject(['remote.session', 'configForms'])` 注册 `model-fusion`(22)；可见顺序由各自的 `order` 决定。OpenCode Go 引擎的 client 另在自己的 `mountSettings` 里注册 `opencode-go`(20)。

## 11. 为什么 v0.1 不做源码级收敛

`NOTICE` 最后一节给出的理由，原文要点：

> 两个引擎的 wire 层实现方式不同：`dsh-opencode-go` 委托给 `pi-ai` SDK 并自带转换/传输层，`dsh-protocom-api` 自己实现 chat-completions、Responses、Anthropic Messages 三套 wire，并通过通用的 `ProviderFamily` 抽象驱动。把一方折叠进另一方意味着重写约 12k 行源码、为每一侧重新验证约 9k 行测试，然后还要在合并树里同时追两个上游。

因此 v0.1 的合并边界是：**打包、路由、设置、client**。两个引擎在 `src/engines/<name>` 下保持独立，Host 侧只在 entry/分组层并列，浏览器侧只在模块加载层合并。这样做的代价是保留两份实现与两套测试；收益是任何一侧的上游修复都可以按文件替换回来，且两套测试仍可独立运行、独立定位失败。

## 12. 设置页 tab id 冲突（已修复）

**问题**：两个 client 半区最初都注册了 `settings.section` 的 tab id `opencode-go`：

- OpenCode Go 引擎：`src/engines/opencode-go/client/index.ts` 中 `id: 'opencode-go'`。
- Protocom 引擎：`src/engines/protocom/client/index.ts` 原用 `OPENCODE_GO.ns` 注册，而 `OPENCODE_GO.ns === 'opencode-go'`（`src/engines/protocom/family.ts`）。

DSH 的 `settings.section` 是 list slot，`register()` 要求同一 `priority` 下 id 唯一，重复会抛
`list slot "settings.section" already has an entry with id "opencode-go"`（实现见
`@deepseek-ai/dsh-client-ui-slots` 的 `register()`）。两个注册都没设置 `priority`，所以真实部署里第二个注册会失败：若失败发生在 Protocom 的注册回调内，同一回调后续的 `commandcode`、`clinepass`、`model-fusion` 三个 tab 也会因异常中断而丢失。

**修复**：Protocom 侧改为

```ts
const GO_SECTION_ID = 'opencode-go-sub' as const
```

即 tab id 与它实际编辑的 provider 路由同名（`family.ts` 的 `GO_PROVIDER = 'opencode-go-sub'`），并把该页标题改成「OpenCode Go（订阅）」/「OpenCode Go (subscription)」，与 OpenCode Go 引擎的 `opencode-go` 页区分。Host 侧的模型发现名称仍为 `opencode-go`（那是 `ctx.llm.registerModelDiscovery` 的键，不是 UI 槽位键）。

**为什么只改 UI 键是安全的**：Protocom 的设置读写始终落在 Loader entry `protocom-api` 的 section key 上（`src/engines/protocom/client/operations.ts` 的 `rooted()`），tab id 只是 `settings.section` 的槽位键。改 id 不迁移、不丢失任何已存值。

**回归覆盖**：`tests/protocom/client-bundle.spec.ts` 断言四个早期 section id 为
`['protocom-api', 'opencode-go-sub', 'commandcode', 'clinepass']`，并在晚握手后断言 `model-fusion` 出现；合并 client bundle 的实际注册顺序由 `tests/opencode-go/plugin.spec.ts` 与 `scripts/smoke-load.mjs` 两侧共同约束。

**遗留观察点**：本仓库的测试 harness 不渲染真实 DSH 页面，断言的是「注册成功」而非「渲染正确」。完整渲染验证需要在装有 DSH 0.2.x 的实例上人工确认一次。
## 13. 发布检查清单

- `lib/` 必须与 `src/` 一致并随包提交；修改源码后运行 `npm run build` 再提交。
- `package.json` 的 `files` 包含 `lib`、`cordis.patch.yml`、`NOTICE`、`README.md` 与两份上游许可证（`LICENSE-opencode-go`、`LICENSE-protocom`）。`NOTICE` 引用这两份文件，发布前请确认 `npm pack --dry-run` 的清单里都在。
- 仓库暂无 lockfile：CI 使用 `npm install --no-audit --no-fund`；引入 lockfile 后再切换 `npm ci`。
- 版本以 `lib/build-info.json` 记录构建信息，发布前确认它与 `package.json` 的 `version` 一致。

## 14. 关键文件索引

| 主题 | 文件 |
| --- | --- |
| 分组入口 | `cordis.patch.yml` |
| 包元数据 / 脚本 / 依赖 | `package.json` |
| vendored 版本、两处本地改动、合并理由 | `NOTICE` |
| 合并 client 入口 | `src/client/index.ts` |
| 构建流水线 | `scripts/build.mjs`、`lib/build-info.json` |
| OpenCode Go 路由与设置 | `src/engines/opencode-go/index.ts`、`contracts.ts`、`config.ts`、`catalog.ts` |
| OpenCode Go 凭据与账号 | `src/engines/opencode-go/accounts.ts`、`adapter.ts` |
| Protocom family 描述符 | `src/engines/protocom/family.ts`、`commandcode.ts`、`clinepass.ts`、`groups.ts` |
| Protocom Host 组合 | `src/engines/protocom/index.ts` |
| Protocom 三套 wire | `src/engines/protocom/protocol/chat-completions.ts`、`responses.ts`、`messages.ts` |
| Protocom client 页注册 | `src/engines/protocom/client/index.ts`、`operations.ts` |
| OpenCode Go client 页注册 | `src/engines/opencode-go/client/index.ts` |
| Fusion | `src/engines/protocom/fusion.ts`、`fusion-host.ts`、`client/FusionSection.tsx` |
| 测试 | `scripts/test.mjs`、`scripts/smoke-load.mjs`、`vitest.opencode-go.config.ts`、`vitest.protocom.config.ts`、`tests/opencode-go/`、`tests/protocom/` |
