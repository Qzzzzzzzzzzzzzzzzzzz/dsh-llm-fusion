# dsh-llm-fusion

把两个独立维护的 DeepSeek Harness LLM provider 插件合并成一个可安装包：

- **dsh-opencode-go**（上游 [Duskriver/dsh-opencode-go](https://github.com/Duskriver/dsh-opencode-go)，vendored 0.2.1）——OpenCode Go 订阅路由（`dsh-opencode-go`）与可免 key 使用的 Free 通道（`dsh-opencode-free`）、多账号池、额度与用量、分析面板。
- **dsh-protocom-api**（上游 [AIMFllyYS/dsh-protocom-api](https://github.com/AIMFllyYS/dsh-protocom-api)，vendored 1.4.0）——Protocom 官方 API 四组（aggregate / codex / stepfun / grok）、OpenCode Go 订阅路由（`opencode-go-sub`）、Command Code、ClinePass，以及 Fusion 双模型路由。

一次安装得到**一个 npm 包、一个 cordis group 入口（`llm-fusion`）、一个浏览器端 client bundle**。两个 host 引擎各自保留独立的 Loader entry、settings 寻址、provider 路由与凭据命名空间。

> 0.1.0 是**打包级合并**：不改写任何一个引擎的实现。除 [NOTICE](./NOTICE) 记录的两处本地改动外，`src/engines/` 下的代码与各自的 vendored 上游版本逐字一致。

---

## 目录

- [这是什么](#这是什么)
- [为什么要合并](#为什么要合并)
- [安装](#安装)
- [安装后你会看到什么](#安装后你会看到什么)
- [兼容性](#兼容性)
- [相对上游的本地改动](#相对上游的本地改动)
- [故障排查](#故障排查)
- [开发与仓库结构](#开发与仓库结构)
- [许可与归属](#许可与归属)
- [English summary](#english-summary)

---

## 这是什么

两个引擎装进一个包里，各自仍是完整的 DSH Host 插件 + Web client 插件：

| | OpenCode Go 引擎 | Protocom 引擎 |
| --- | --- | --- |
| 上游 | [Duskriver/dsh-opencode-go](https://github.com/Duskriver/dsh-opencode-go) | [AIMFllyYS/dsh-protocom-api](https://github.com/AIMFllyYS/dsh-protocom-api) |
| vendored 版本 | 0.2.1 | 1.4.0 |
| Host bundle | `lib/opencode-go/index.js` | `lib/protocom/index.js` |
| Loader entry id | `opencode-go` | `protocom-api` |
| 贡献的 provider 路由 | `dsh-opencode-go`、`dsh-opencode-free` | `protocom-aggregate`、`protocom-codex`、`protocom-stepfun`、`protocom-grok`、`opencode-go-sub`、`commandcode`、`clinepass` |
| 设置入口 | `opencode-go`（账号池、额度、代理、用量历史） | `protocom-api`（五段 Config：四组、订阅、Command Code、ClinePass、Fusion） |
| 传输实现 | `pi-ai` SDK + 自研转换/传输层 | 自研 chat-completions / Responses / Anthropic Messages 三套 wire + `ProviderFamily` 抽象 |

两条引擎的入口在同一个 cordis group 下并列，见 [`cordis.patch.yml`](./cordis.patch.yml)：

```yaml
- insert:
    - id: llm-fusion
      name: "@deepseek-ai/cordis-plugin-group"
      group: true
      config:
        - id: opencode-go      # 保留上游 Loader entry id
          name: dsh-llm-fusion/opencode-go
        - id: protocom-api     # 保留上游 Loader entry id
          name: dsh-llm-fusion/protocom
```

保留这两个 entry id 是刻意的：DSH 以 Loader entry 作为 settings 表单的寻址键，id 不变，既有 profile 里的设置值、分区和已存凭据引用都不需要迁移。

## 为什么要合并

两个上游解决的是同一类问题（把第三方 LLM provider 接进 DSH 的模型选择器与对话链路），但实现路线完全不同，合并的价值在于**一次安装、一套依赖版本、一个 client bundle**，而不是把代码合成一份：

- **dsh-opencode-go** 把请求交给 `pi-ai` SDK（依赖里以 `opencode-go-pi-ai` 别名固定到 `@earendil-works/pi-ai@1.5.0`），自己实现 transcript 转换层（`src/engines/opencode-go/conversion.ts`）、传输与代理层（`transport.ts`、`free-transport.ts`、`free-socks-tunnel.ts`）以及 OpenCode Go / Free 两条通道的账号、额度与分析语义。Free 通道还带一个由 Bun 执行的独立 HTTP worker（`src/engines/opencode-go/free-http-worker.ts` → `lib/free-http-worker.js`）。
- **dsh-protocom-api** 自己实现三套 wire 协议（`src/engines/protocom/protocol/chat-completions.ts`、`responses.ts`、`messages.ts`），并用 `ProviderFamily` 描述符（`src/engines/protocom/family.ts`）把「四组 + 订阅 + Command Code + ClinePass」收敛成同一套 adapter、key pool、重试、模型注册表与 telemetry 代码。

把其中一个折叠进另一个，意味着重写约 12k 行源码、重新验证约 9k 行测试，并且从此在一个合并树里同时追两个上游。v0.1 因此只在**打包、路由、设置、client** 四个边界上合并，两个引擎的内部保持原样；详细取舍见 [`NOTICE`](./NOTICE) 最后一节和 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 安装

### 前置条件

| 项 | 要求 | 依据 |
| --- | --- | --- |
| DSH | `>= 0.2.1-rc.5` | `package.json` → `engines.dsh` |
| Node.js | `^22.19.0 || >=24.0.0` | `package.json` → `engines.node` |
| Bun | 可选，仅 Free 通道需要（`bun@1.4.4`） | `package.json` → `optionalDependencies` |
| 依赖 | `@deepseek-ai/*` 的 dev/运行时依赖固定为 `0.2.1-rc.5`，peer 范围为 `>=0.2.1-rc.5 <0.3.0-0` | `package.json` → `peerDependencies` / `dependencies` / `devDependencies` |

protocom 上游原本按 `0.2.0-rc.2` 构建，合并包把它对齐到 `0.2.1-rc.5`，因此一个 profile 里只解析一份 DSH 运行时服务。

### 从 GitHub 安装（当前推荐）

```bash
npm i github:Qzzzzzzzzzzzzzzzzzzz/dsh-llm-fusion
```

仓库提交了预构建产物（`package.json` 的 `files` 包含 `lib`），git 安装**不会**触发构建，装完即用。

### 在 DSH 里作为插件来源安装

把本包加入 profile 的插件来源（插件市场的**自定义索引**，或**本地路径**安装）。DSH 读取 `package.json` 的 `dsh.bundle.patch` → [`cordis.patch.yml`](./cordis.patch.yml)，把 group 入口插进组合；浏览器端经 `dsh.client` 加载 `lib/client.js`。

> 包名必须保持 `dsh-llm-fusion`：patch 里的子项名写死为 `dsh-llm-fusion/opencode-go` 与 `dsh-llm-fusion/protocom`。改名安装（或 fork 后改名）必须同步改 patch 并重新构建，否则入口解析不到。

### 尚未发布到 npm registry

0.1.0 目前**没有**发布到 npm，`npm i dsh-llm-fusion` 不可用；请使用上面的 GitHub 形式，或本地路径安装。发布后本段会更新。

### 从源码构建

```bash
npm install --no-audit --no-fund   # 仓库暂不提交 lockfile
npm run build                      # 产出 lib/opencode-go/index.js、lib/protocom/index.js、lib/free-http-worker.js、lib/client.js
npm test                           # 两个引擎的 vitest 套件 + 跨引擎加载 smoke
npm run smoke                      # 只跑 lib/ 的跨引擎加载检查
npm run verify                     # build + test
```

脚本名以 [`package.json`](./package.json) 的 `scripts` 为准（当前为 `build` / `test` / `smoke` / `verify`）。`test` 由 `scripts/test.mjs` 驱动：分别用 `vitest.protocom.config.ts` 与 `vitest.opencode-go.config.ts` 跑两套 spec，最后执行 `scripts/smoke-load.mjs` 验证两个 Host bundle 能在同一份 `@deepseek-ai/*` 运行时上加载。

## 安装后你会看到什么

### 设置页

设置 → Plugins 下会出现两个引擎贡献的设置页（`settings.section` 标签页）：

**OpenCode Go 引擎页**

- 启用开关（同时控制 Go 与 Free 两条路由）。
- 账号池：最多 20 个账号，默认引用 `OPENCODE_API_KEY`，其余为 `DSH_OPENCODE_GO_ACCOUNT_*`；可自动切换。
- `baseURL` / `freeBaseURL` 与 HTTP(S)/SOCKS5 代理；额度在对话输入栏（徽章/精简两种样式）与侧边栏的显示开关。
- 模型可见性与单模型上限。
- 用量历史：今天 / 7 天 / 30 天 / 90 天，按天趋势、按模型排行与明细、缓存命中率、金额，可导出 CSV；额度条显示滚动 5 小时 / 每周 / 每月窗口。

**Protocom 引擎页**

同一个 Loader entry（`protocom-api`）下按 Config 分段渲染：

- **Protocom API**：aggregate / codex / stepfun / grok 四组卡片，各自开关、API key、协议、上下文长度、密钥池策略，以及余额与倍率。
- **OpenCode Go**（订阅路由 `opencode-go-sub`）：一个 `go` 分组，额度条显示同样的滚动窗口。
- **Command Code**：一个 `cc` 分组，账户页显示 credits、滚动窗口与用量汇总。
- **ClinePass**：一个分组；该 family 没有账号/余额端点，因此不挂 telemetry 面板。
- **Fusion 双模型**：Leader / Coder 两个座位，以及是否把 Leader 应用为默认模型、是否同时约束 fork 出来的子代理。

> **已修复的装配冲突**：两个引擎的 client 半区原本都注册 id 为 `opencode-go` 的 `settings.section`，而 DSH 的 list slot 拒绝同 priority 下的重复 id。合并包把 Protocom 订阅页的 tab id 改成 `opencode-go-sub`（与它编辑的 provider 路由同名），标签文字改为「OpenCode Go（订阅）」，OpenCode Go 引擎的页面保持 `opencode-go` 不变。存储路径不受影响：Protocom 始终按 Loader entry `protocom-api` + section key 读写。经过与复现方式见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#12-设置页-tab-id-冲突已修复)。

### 路由清单

| Provider id | 归属引擎 | 上游端点 | 协议 / 能力 |
| --- | --- | --- | --- |
| `dsh-opencode-go` | OpenCode Go | `https://opencode.ai/inference/go/v1` | 订阅推理；pi-ai 三套 wire（chat-completions / responses / anthropic-messages）+ Google；账号池、额度、分析 |
| `dsh-opencode-free` | OpenCode Go | `https://opencode.ai/inference/v1` | Free 通道；Bun HTTP worker + SOCKS/HTTP 代理；无可用账号时走公共访问兜底 |
| `protocom-aggregate` | Protocom | `https://relay.protocom.org` | chat-completions |
| `protocom-codex` | Protocom | `https://relay.protocom.org` | responses |
| `protocom-stepfun` | Protocom | `https://relay.protocom.org` | responses |
| `protocom-grok` | Protocom | `https://relay.protocom.org` | chat-completions |
| `opencode-go-sub` | Protocom | `https://opencode.ai/zen/go` | 以 chat-completions 为主，部分模型只在 Responses 面提供；每条请求带 `x-opencode-session` |
| `commandcode` | Protocom | `https://api.commandcode.ai/provider` | 以 chat-completions 为主（按端点逐模型声明覆盖）；Anthropic-only 的 Claude 模型排除 |
| `clinepass` | Protocom | `https://api.cline.bot/api/v1` | chat-completions；模型目录来自内置 registry，而非该端点的 listing |

Fusion 不新增 provider id：它在上述路由之上改写请求的模型/路由（Leader 座位用于主会话默认与当前模型，Coder 座位强制用于子代理请求）。

### 凭据引用

| 引擎 / family | 默认凭据引用 |
| --- | --- |
| OpenCode Go 引擎（Go 与 Free 共用账号池） | `OPENCODE_API_KEY`，其余账号 `DSH_OPENCODE_GO_ACCOUNT_*` |
| Protocom 四组 | `PROTOCOM_<GROUP>_API_KEY`（如 `PROTOCOM_AGGREGATE_API_KEY`） |
| Protocom 的 OpenCode Go 订阅 | `OPENCODE_GO_API_KEY` |
| Command Code | `COMMANDCODE_API_KEY` |
| ClinePass | `CLINE_API_KEY` |

密钥存放在 DSH credentials 服务（或启动环境变量）里：设置页按需写入密钥、展示引用名，不回显已存密钥的字面量；运行时按引用解析。

## 兼容性

### 与分别安装两个上游插件相比

| 维度 | 合并包 | 分别安装上游 |
| --- | --- | --- |
| 安装 | 一次 `npm i` / 一个来源 | 两次，且要对齐 DSH 版本 |
| Loader entry id | `opencode-go`、`protocom-api`（与上游相同） | 同上 |
| settings 迁移 | 不需要：entry id 与 section 路径未变 | — |
| 浏览器端 | 一个 client bundle（`lib/client.js`） | 两个 bundle，各自注册一次 |
| 更新 | 跟随合并仓库 | 跟随各自上游 |
| 依赖 | `@deepseek-ai/*` 的 dev/运行时依赖固定为 `0.2.1-rc.5`，peer 范围为 `>=0.2.1-rc.5 <0.3.0-0` | protocom 上游是 `0.2.0-rc.2`，需要自行对齐 |
| 并装 | — | **不要**同时安装上游同名包：同一批 provider id 会被注册两次，DSH 的 Loader/路由目录会拒绝（例如 `DUPLICATE_DIRECTORY`），表现为启动失败或路由被抢占 |

从上游切换到合并包时，既有 profile 的设置与凭据引用原样生效；反过来卸载合并包、装回两个上游也按同样的键位读取。切换前请停止会话，避免同一 provider 路由在运行时被重复注册。

### 已验证的宿主版本

本仓库的验证基线是 **DSH `0.2.1-rc.5` 的 `@deepseek-ai/*` 包集合 + Node 24**（两个引擎的 devDependencies 都对齐到该版本，`engines.dsh` 与 peer 范围也以它为下限）。在这套版本上：Protocom 633 条、OpenCode Go 886 条测试全绿，`scripts/smoke-load.mjs` 通过。

本机实际安装的桌面端是 **`0.2.2-rc.1`**（比验证基线新）。在同一台机器上用 `0.2.2-rc.1` 的包集合跑移植后的测试，OpenCode Go 有 4 条失败、Protocom 全绿；这 4 条都指向宿主侧契约变化而不是本包代码：

- `cordis-plugin-loader` 1.1.0 把 `entry.fiber` 换成带 `ctx.fiber` / `effectiveConfig` 的结构（`@deepseek-ai/dsh-settings` 的 `entry.fiber.ctx.fiber`、`entry.fiber.effectiveConfig`）；
- `settings.update()` 对非法值不再同步 reject（两条设置校验断言因此变成"resolved"）。

因此 `0.2.2-rc.1` 下的验证是**待办项**：升级验证基线后需要复核这 4 条，并按需适配。peer 范围 `>=0.2.1-rc.5 <0.3.0-0` 允许 `0.2.2-rc.1`，但当前 CI 覆盖的是 `0.2.1-rc.5`。
## 相对上游的本地改动

共三处改动（两处请求行为 + 一处设置页槽位键），全部记录在 [`NOTICE`](./NOTICE)：

1. **OpenCode Go 的 adapter 回退会话身份**（`src/engines/opencode-go/adapter.ts`）：没有 Session id 的请求（标题生成、探测、压缩）不再每次生成新 UUID，而是每个 adapter 实例使用一个稳定身份；同时每条请求在 `x-opencode-session` 之外再带 `x-deepseek-harness-session-id`。这样网关会把非对话流量记在同一个 session 下，而不是每次调用新建 session 与 prompt-cache key。这是一个有意的行为变化，对应的两条上游测试也随之上调。
2. **Protocom 的 session 头取值裁剪**（`src/engines/protocom/adapter.ts`）：写入会话作用域头的值被压缩为合法的有界 wire 值——可见 ASCII id 原样通过；非 ASCII、控制字符、已落在保留映射命名空间内的值、或超过 64 字符的值，改用 UTF-16LE 上的 SHA-256 + base64url 表示。上游直接发送 `String(sessionId)`，可能把非 ASCII 或超长内容塞进 HTTP 头。
3. **Protocom 的 OpenCode Go 订阅页槽位键**（`src/engines/protocom/client/index.ts` + `client/locale.ts`）：tab id 由 `opencode-go` 改为 `opencode-go-sub`（与它编辑的 provider 路由同名），标题改为「OpenCode Go（订阅）」/「OpenCode Go (subscription)」。上游单独发布时不会撞键；合并后 OpenCode Go 引擎已占用 `opencode-go` 这个 `settings.section` id，而该 slot 拒绝同 priority 的重复 id，会让 Protocom 后半组页面一并注册失败。只改 UI 槽位键与文案，存储路径不变。

除这两处外，两个引擎的源码、测试与资源与各自上游版本一致。

## 故障排查

### `400 MissingSessionID`

含义：OpenCode Go 网关在某些模型路径上要求请求携带 `x-opencode-session`。本包的两个 adapter 都会发送它，并同时发送 `x-deepseek-harness-session-id`：

- Protocom 的订阅路由：`src/engines/protocom/adapter.ts`（`family.sessionHeader === 'x-opencode-session'`，定义见 `src/engines/protocom/family.ts`）。
- OpenCode Go 引擎：`src/engines/opencode-go/adapter.ts`（Go 与 Free 两组请求头都在这里构造）。

如果仍然收到这个错误，说明请求没有经过本包的 adapter，或者 session 头在途中被剥掉了：

- 检查该 family 的 `baseURL` 是否被改成了非官方地址（Protocom 的 `baseURL` 只有在打开 `allowCustomBaseURL` 时才允许离开 shipped origin）。
- 检查是否同时安装了上游 `dsh-opencode-go` / `dsh-protocom-api`，或别的会声明同名 provider id 的插件——路由被抢先注册时，请求会落到另一个 adapter 上。
- 检查中间代理是否改写或丢弃自定义请求头；Free 通道的代理由包内实现承载（`free-socks-tunnel` / `free-transport`），而第三方反向代理不在本包控制范围内。

没有 Session id 的请求属于正常流量（标题生成、探测、压缩）：Go adapter 使用上面「本地改动 1」的稳定回退身份，Protocom adapter 使用每个 adapter 的 `fallbackSession`；它们都仍会带上会话头，只是值不是某个真实对话。

### 安装时 registry 不稳定（`pnpm` 报 `UND_ERR_DESTROYED`）

本机访问 `registry.npmjs.org` 不稳定时，pnpm 可能在下载依赖中断开并报 `UND_ERR_DESTROYED` / 超时。建议：

1. 直接重试；这类错误通常是瞬时的。
2. 改用 npm：`npm install --no-audit --no-fund`。本仓库暂不提交 lockfile，因此 `npm ci` 不可用，用 `npm install`。
3. 仍然失败时切换镜像源（例如 `npm config set registry https://registry.npmmirror.com`），或在 CI/本地配置代理后重试。
4. GitHub 形式的安装还依赖 GitHub 可达性；若 `github:` 拉取失败，可改为下载仓库压缩包后以本地路径安装。

### 只想启用其中一组 provider

- Protocom 的每个分组默认 `enabled: false`，在设置页逐组打开即可；全部关闭时该 family 不注册任何路由（注册是惰性的，第一次出现启用分组才注册）。
- OpenCode Go 引擎的启用开关会同时撤下 Go 与 Free 两条路由；Free 不需要有效 key（无可用账号时会走公共访问兜底），Go 则需要至少一个能解析到的 key。
- 想让整个引擎都不加载：从 profile 里移除对应的 group 子项，或只保留一个子项（两个子项是独立的 Loader entry，互不依赖）。

### Free 通道报 `MISSING_BUN_RUNTIME`

Free 通道需要一个由 Bun 执行的 HTTP worker。合并包把 `bun@1.4.4` 放在 `optionalDependencies` 里；如果安装时禁用了 optional dependencies（或 Bun 的平台包缺失），就会得到 `MISSING_BUN_RUNTIME`。请重新安装并保留 optional dependencies（错误文案里提到的包名来自上游 `dsh-opencode-go` 时期，含义相同）。

### 设置页缺失或重复

先确认没有并装上游同名插件；再确认 DSH 版本满足 `>= 0.2.1-rc.5`。若是 OpenCode Go 标签页只剩一个，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#12-已知装配冲突v01) 中记录的 v0.1 已知冲突。

## 开发与仓库结构

```text
.
├─ cordis.patch.yml          # group 入口：llm-fusion → 两个子 entry
├─ package.json              # dsh.bundle.patch / dsh.client / exports / scripts
├─ lib/                      # 预构建产物（随包提交，勿忽略）
│  ├─ opencode-go/index.js
│  ├─ protocom/index.js
│  ├─ free-http-worker.js
│  ├─ client.js
│  └─ build-info.json
├─ src/
│  ├─ engines/opencode-go/   # 引擎一（host + client）
│  ├─ engines/protocom/      # 引擎二（host + client + protocol）
│  └─ client/index.ts        # 合并后的单一 client 入口
├─ scripts/                  # build / test / smoke-load 等开发脚本
├─ tests/                    # 两个引擎各自的 vitest 套件
├─ docs/ARCHITECTURE.md
└─ NOTICE / LICENSE-*
```

- 构建：`node scripts/build.mjs`（esbuild；Host 产物保持 `@deepseek-ai/*`、`undici`、`openai`、`@anthropic-ai/sdk` 为 external）。
- 测试：两个引擎各自拥有 spec 树（`tests/opencode-go/`、`tests/protocom/`），分别由根部的 `vitest.opencode-go.config.ts` / `vitest.protocom.config.ts` 驱动；`scripts/test.mjs` 依次跑两套并追加 `scripts/smoke-load.mjs` 的跨引擎加载检查。
- 修改 `src/` 后必须重新构建并提交 `lib/`，因为 npm 包与 git 安装都直接使用 `lib/`。
- 详细装配说明见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 许可与归属

- 合并包本身以 **MIT** 发布（`package.json` → `license: "MIT"`）。
- 两个引擎分别来自各自的上游项目，均为 MIT：
  - [`LICENSE-opencode-go`](./LICENSE-opencode-go)：Copyright (c) 2026 DeepSeek；Copyright (c) 2026 dsh-opencode-go contributors。
  - [`LICENSE-protocom`](./LICENSE-protocom)：Copyright (c) 2026 AIMFllyYS。
- vendored 版本、本地改动与合并理由见 [`NOTICE`](./NOTICE)。
- 上游地址：[Duskriver/dsh-opencode-go](https://github.com/Duskriver/dsh-opencode-go)、[AIMFllyYS/dsh-protocom-api](https://github.com/AIMFllyYS/dsh-protocom-api)。

## English summary

**dsh-llm-fusion** packages two MIT-licensed DeepSeek Harness provider plugins — `dsh-opencode-go` 0.2.1 (OpenCode Go / Free subscription routing, account pools, quota and usage analytics, a Bun-based Free-channel worker) and `dsh-protocom-api` 1.4.0 (the four Protocom groups, an `opencode-go-sub` subscription route, Command Code, ClinePass, and Fusion dual-model routing) — into a single installable package. One `dsh.bundle.patch` inserts one cordis group entry (`llm-fusion`) whose two children keep their original loader entry ids (`opencode-go`, `protocom-api`), so existing settings, credentials and provider routes carry over unchanged; one merged browser module (`lib/client.js`) serves both settings surfaces while each engine keeps its own host bundle and namespaces.

It is a packaging merge, not a rewrite: apart from the two behavior changes recorded in [`NOTICE`](./NOTICE) (a stable fallback session identity plus an extra `x-deepseek-harness-session-id` header in the OpenCode Go adapter, and a bounded/hashed session-header value in the Protocom adapter), both engines are vendored byte-for-byte from their upstream releases. All `@deepseek-ai/*` dependencies are aligned to `0.2.1-rc.5`; DSH `>= 0.2.1-rc.5` and Node `^22.19.0 || >=24.0.0` are required.

Install with `npm i github:Qzzzzzzzzzzzzzzzzzzz/dsh-llm-fusion` (not yet published to npm), or add it as a local/custom-index plugin source. Do not install the two upstream packages alongside this bundle: the same provider routes would be registered twice. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the assembly model, namespace isolation table and known v0.1 limitations.
