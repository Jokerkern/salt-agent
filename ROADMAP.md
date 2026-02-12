# Salt-Agent 开发路线图

## 项目定位

Salt-Agent 是一个本地部署的 AI 编程助手，核心能力：
- 与 LLM 对话，支持多种模型供应商
- 通过工具（读写文件、执行命令、搜索代码）操作本地文件系统
- 提供 Web UI 进行交互
- 提供 HTTP API，可被外部系统（IM 机器人等）集成
- 可集成到 Electron 应用

## 架构总览

```
┌─────────────┐     ┌──────────────────────────────────┐
│   Web UI    │────▶│         salt-agent               │
│  (React)    │ HTTP│                                  │
└─────────────┘     │  ┌────────┐  ┌────────┐         │
                    │  │ Server │  │ Agent  │         │
┌─────────────┐     │  │ (Hono) │  │  Loop  │         │
│  IM / 外部  │────▶│  └───┬────┘  └───┬────┘         │
└─────────────┘     │      │           │              │
                    │  ┌───▼───────────▼────┐         │
┌─────────────┐     │  │   Tools / Provider │         │
│  Electron   │────▶│  └───────┬────────────┘         │
└─────────────┘     │          │                      │
                    │  ┌───────▼────────────┐         │
                    │  │  Storage (JSON 文件) │         │
                    │  └────────────────────┘         │
                    └──────────────────────────────────┘
```

## 设计原则

- **单包架构**：所有代码在 `packages/salt-agent/` 内，不拆 core/server（学习 opencode）
- **JSON 文件存储**：不用数据库，数据存为 JSON 文件，好调试、零依赖
- **namespace 模式**：TypeScript namespace 组织代码（学习 opencode）
- **Node.js 运行时**：兼容 Electron，不依赖 Bun API

---

## 阶段划分

### 第一阶段：存储层 [已完成]

> 目标：建立可靠的文件存储基础设施。

- [x] 数据目录管理 `global/global.ts`
  - `SALT_DATA_DIR` 环境变量，默认 `~/.salt-agent`
  - 子目录：`storage/`, `log/`, `config/`, `workplace/`
  - getter 动态读取环境变量（支持测试时切换目录）
- [x] ID 生成器 `id/id.ts`
  - 带前缀的时间排序 ID（`ses_`, `msg_`, `prt_`）
  - `ascending()` 递增、`descending()` 递减
- [x] JSON 文件存储 `storage/storage.ts`
  - 5 个核心操作：read / write / update / remove / list
  - key 数组映射为目录路径
  - lazy 延迟初始化（首次操作时自动建目录）
  - 读写锁（防止并发读写冲突）
  - NamedError 错误处理
  - `reset()` 方法支持测试重置状态
- [x] 工具函数 `util/`
  - `lazy.ts` 延迟初始化
  - `lock.ts` 内存级读写锁
  - `error.ts` NamedError 错误工厂（带 Zod schema、isInstance、toObject）

---

### 第二阶段：基础设施 + 会话管理

> 目标：补齐基础设施，建立 Session -> Message -> Part 三层数据模型。

#### 2.0 基础设施 [已完成]

- [x] `util/fn.ts` - Zod 自动校验包装函数（`.force()` 跳过校验、`.schema` 暴露 schema）
- [x] `util/log.ts` - 日志系统
  - 级别控制 DEBUG/INFO/WARN/ERROR
  - 按 service 名缓存 Logger 实例
  - `.tag()` / `.clone()` / `.time()` (带 `Symbol.dispose`)
  - `Log.init()` 支持 stderr 输出和文件输出
  - Node.js 实现（对标 opencode，Bun API 替换为 fs/WriteStream）
- [x] `bus/bus-event.ts` - 事件类型定义
  - `BusEvent.define(type, zodSchema)` 注册类型安全的事件
  - `BusEvent.payloads()` 生成所有事件的联合 Zod schema（供 API schema 生成）
- [x] `bus/bus.ts` - 发布/订阅事件总线
  - `Bus.publish()` / `Bus.subscribe()` / `Bus.once()` / `Bus.subscribeAll()`
  - 模块级 Map（单项目设计，无需 Instance 多项目隔离）
  - 带日志记录

设计决策：
- 不需要 `GlobalBus`（opencode 用它做跨 Instance 事件冒泡，salt-agent 是单项目）
- 不需要 `Instance.state()`（无多项目隔离需求，整台电脑是一个工作空间）

#### 2.1 会话 (`session/session.ts`) [已完成]

- [x] Session.Info 类型定义（Zod schema）
  - id, title, time: { created, updated }
- [x] Session.Event 事件定义（Created, Updated, Deleted）
- [x] Session.create() - 创建会话
- [x] Session.get(id) - 获取会话
- [x] Session.list() - 列出所有会话（async generator）
- [x] Session.update(id, editor, options?) - 更新会话（支持 `touch: false` 跳过更新时间）
- [x] Session.remove(id) - 删除会话（级联删除消息和 Part）
- [x] Session.isDefaultTitle() - 判断是否为默认标题
- [x] Session.messages(sessionID) - 获取会话的所有消息（含 Part，支持 limit）
- [x] Session.updateMessage(msg) - 创建/更新消息
- [x] Session.removeMessage() - 删除消息
- [x] Session.updatePart(part) - 创建/更新 Part（支持 delta 增量）
- [x] Session.removePart() - 删除 Part

存储路径：`["session", sessionID]`

#### 2.2 消息与 Part (`session/message.ts`) [已完成]

- [x] Message 类型（Zod discriminatedUnion，对齐 opencode）
  - User: role, time, agent, model, system, tools, variant
  - Assistant: role, time, error, parentID, modelID, providerID, mode, agent, path, summary, cost, tokens, structured, variant, finish
- [x] Part 类型（3 种核心 Part）
  - TextPart: 文本内容（含 synthetic, ignored, metadata）
  - ToolPart: 工具调用（pending -> running -> completed/error 状态机，含 metadata）
  - ReasoningPart: 推理/思考（含 metadata）
- [x] 错误类型（6 种，对齐 opencode）
  - OutputLengthError, AbortedError, AuthError, APIError, ContextOverflowError, StructuredOutputError
- [x] Message 读取操作
  - MessageV2.get() / MessageV2.parts() / MessageV2.stream()
- [x] MessageV2.Event 事件定义（Updated, Removed, PartUpdated, PartRemoved）
- [x] MessageV2.WithParts 组合类型（消息 + 关联的所有 Part）
- [x] 测试覆盖（31 个测试：CRUD、事件、schema 校验、查询）

存储路径：
- 消息：`["message", sessionID, messageID]`
- Part：`["part", messageID, partID]`

**验收标准：** ✅ 能通过代码创建会话、添加用户消息、添加助手消息、添加 Part、查询历史、删除会话。所有 CRUD 操作发布对应的 Bus 事件。全部 86 个测试通过。

---

### 第三阶段：配置系统 [已完成]

> 目标：管理供应商 API key 和模型选择。

- [x] 配置文件：`{dataDir}/config/salt-agent.json`
- [x] Zod schema 定义（对齐 opencode 结构）
  - provider: `provider.*.options.apiKey / baseURL`（同 opencode）
  - provider: `provider.*.models` 为 record 格式（可扩展模型配置）
  - model: 默认模型（provider/model 格式）
  - Provider strict + options catchall（已知字段严格，options 可扩展）
- [x] Config.get() 加载并校验（lazy 缓存）
- [x] Config.save() 递归 mergeDeep 合并（对齐 opencode 的 remeda mergeDeep）
- [x] 首次运行创建默认配置
- [x] Config.Event.Updated 事件（通过 Bus 发布）
- [x] Config.InvalidError / Config.NotFoundError 错误类型
- [x] 测试覆盖（24 个测试：schema 校验、CRUD、深合并、事件、边界情况）

存储路径：`{dataDir}/config/salt-agent.json`

**验收标准：** ✅ 能读写配置文件，配置校验失败时抛出 ConfigInvalidError 含详细错误信息。save() 递归深合并现有配置并发布事件。全部 110 个测试通过。

---

### 第四阶段：LLM 供应商接入 [已完成]

> 目标：能调通至少一个 LLM，拿到流式响应。

#### 4.1 静态模型注册表 (`provider/models.ts`) [已完成]

- [x] Models namespace — 内置静态模型列表（不依赖 models.dev）
- [x] Models.Model / Models.Provider Zod schema
- [x] 内置供应商：Anthropic（4 模型）、OpenAI（6 模型）、Google（3 模型）
- [x] 每个模型含 cost / limit / capabilities / modalities / status
- [x] Models.get() / Models.getProvider()

#### 4.2 供应商核心 (`provider/provider.ts`) [已完成]

- [x] Provider.Model — 内部标准化模型类型（Zod schema）
- [x] Provider.Info — 供应商信息类型（id, name, source, env, key, options, models）
- [x] Provider.list() — 列出所有可用供应商（合并静态 + Config + Auth）
- [x] Provider.getProvider(providerID) / Provider.getModel(providerID, modelID)
- [x] Provider.getLanguage(model) — 返回 AI SDK `LanguageModelV2` 实例（核心方法）
- [x] Provider.defaultModel() — 从 Config 解析默认模型
- [x] Provider.parseModel("provider/model") — 解析字符串格式
- [x] Provider.calculateCost() — token 用量费用计算
- [x] Provider.sort() — 按 status + name 排序
- [x] SDK 缓存管理（BUNDLED_PROVIDERS: OpenAI, Anthropic, Google, OpenAI-compatible）
- [x] API key 三级解析优先级：Config apiKey > Auth 持久化 > 环境变量
- [x] Provider.ModelNotFoundError / Provider.InitError 错误类型

#### 4.3 凭据持久化 (`provider/auth.ts`) [已完成]

- [x] Auth namespace — 磁盘持久化凭据存储（`{dataDir}/auth.json`，权限 0o600）
- [x] 两种凭据类型：Auth.Api（API key）、Auth.Oauth（access + refresh + expires）
- [x] Auth.get() / Auth.all() / Auth.set() / Auth.remove() — CRUD
- [x] Auth.extractKey() — 从任意凭据提取 key
- [x] Auth.isExpired() — OAuth 过期检测（含 buffer）
- [x] Auth.Event.Updated 事件（通过 Bus 发布）
- [x] Auth.NotFoundError / Auth.OauthMissingError / Auth.OauthCallbackFailedError

#### 4.4 消息转换 (`provider/transform.ts`) [已完成]

- [x] ProviderTransform.message() — 发送前的消息转换
  - Anthropic：空消息清理、空文本 Part 移除、toolCallId 规范化 `[a-zA-Z0-9_]`
  - Anthropic：cache control 标记（system + 最近 4 条 user 消息）
- [x] ProviderTransform.providerOptions() — 按 SDK key 映射（anthropic / openai / google）
- [x] ProviderTransform.maxOutputTokens() / temperature() — 模型参数
- [x] ProviderTransform.options() / smallOptions() — 基础 / 小任务选项

#### 4.5 错误解析 (`provider/error.ts`) [已完成]

- [x] ProviderError.parseAPICallError() — AI SDK `APICallError` 分类（context_overflow / api_error）
- [x] ProviderError.parseStreamError() — SSE 流式错误解析
- [x] ProviderError.isContextOverflow() — 13 种正则模式检测上下文溢出
- [x] isRetryable 判断、responseBody 提取

#### 4.6 Config schema 扩展 [已完成]

- [x] Config.Provider 新增：name / env / npm / api 字段
- [x] Config.Info 新增：small_model 字段

新增依赖：`ai`、`@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/google`、`@ai-sdk/openai-compatible`

存储路径：
- Auth 凭据：`{dataDir}/auth.json`

**验收标准：** ✅ 配置 API key 后能通过 Provider.getLanguage() 获取模型实例，可用于 streamText 流式调用。支持 OpenAI / Anthropic / Google / OpenAI 兼容协议四种供应商。token 用量可通过 calculateCost 计算。全部 211 个测试通过。

---

### 第五阶段：工具系统 [已完成]

> 目标：Agent 能通过工具操作本地环境。

#### 5.0 基础设施 [已完成]

- [x] `util/wildcard.ts` — 通配符匹配（`*`, `?`）
- [x] `util/abort.ts` — AbortSignal 组合工具（超时 + 外部信号）
- [x] `workspace/workspace.ts` — 项目目录管理（替代 opencode 的 Instance）
- [x] `shell/shell.ts` — Shell 工具（shell 检测、进程树杀死）
- [x] `ripgrep/ripgrep.ts` — ripgrep 二进制路径解析 + 文件列举

#### 5.1 权限系统 (`permission/permission.ts`) [已完成]

- [x] Permission.Action（allow / deny / ask）、Rule、Ruleset 类型
- [x] Permission.evaluate() — 通配符规则匹配（最后匹配的规则生效）
- [x] Permission.ask() / Permission.reply() — Promise 挂起等待用户响应
- [x] Permission.Event（Asked, Replied）通过 Bus 发布
- [x] RejectedError / CorrectedError / DeniedError 错误类型

#### 5.2 工具核心框架 [已完成]

- [x] `tool/tool.ts` — Tool.define() 工厂函数、Tool.Context、Tool.Info 接口
  - 自动 Zod 参数校验
  - 自动输出截断（2000 行 / 50KB）
  - 权限请求集成 ctx.ask()
- [x] `tool/truncation.ts` — Truncate.output() 截断 + 磁盘保存 + 清理
- [x] `tool/external-directory.ts` — 外部目录权限检查

#### 5.3 内置工具（19 个）

文件操作：
- [x] `read` — 读取文件/目录（分页、二进制检测、图片/PDF 附件）
- [x] `write` — 写入文件（diff 生成、权限检查）
- [x] `edit` — 编辑文件（9 种 replacer 策略：Simple, LineTrimmed, BlockAnchor, WhitespaceNormalized, IndentationFlexible, EscapeNormalized, TrimmedBoundary, ContextAware, MultiOccurrence）
- [ ] `apply_patch` — **占位** ⚠️ 需要 Patch 解析模块（`parsePatch` / `deriveNewContentsFromChunks`），当前调用会抛错

搜索发现：
- [x] `grep` — 正则搜索（调用 ripgrep，按修改时间排序，100 结果限制）
- [x] `glob` — 文件模式匹配（ripgrep --files，按修改时间排序）
- [x] `list` — 目录树列表（ripgrep，忽略 node_modules 等常见目录）

Shell：
- [x] `bash` — Shell 执行（超时机制、abort 信号、进程树杀死、元数据流）
  - [ ] **未实现**：tree-sitter 命令解析（opencode 用它分析命令提取路径做细粒度权限检查）

Web：
- [x] `webfetch` — HTTP 内容抓取（5MB 限制、HTML→Markdown 转换、Cloudflare 重试）
- [x] `websearch` — Web 搜索（Exa MCP API、SSE 响应解析）

辅助：
- [x] `todowrite` / `todoread` — 待办事项管理（Session 级别 JSON 存储）
- [x] `question` — 用户交互提问（Bus 事件驱动，需要 UI 层接入 `Question.Event.Answered` 才能实际工作）
- [x] `batch` — 并行工具执行（最多 25 个，禁止递归）
- [x] `invalid` — 无效工具占位

高级（**占位 stub**，调用会抛错）：
- [ ] `task` — **占位** ⚠️ 子 Agent 委派，需要 Phase 6 Agent 系统
- [ ] `skill` — **占位** ⚠️ 技能加载，需要 Skill 发现/加载系统
- [ ] `lsp` — **占位** ⚠️ LSP 操作，需要 LSP 客户端集成
- [ ] `plan_enter` / `plan_exit` — **占位** ⚠️ 计划模式切换，需要 Agent 系统 + Question 系统

#### 5.4 工具注册表 (`tool/registry.ts`) [已完成]

- [x] ToolRegistry.tools() — 返回所有可用工具（按模型过滤）
- [x] ToolRegistry.register() — 动态注册自定义工具
- [x] ToolRegistry.ids() — 返回所有工具 ID
- [x] 模型适配：apply_patch 仅限 GPT 系列，edit/write 用于其他模型

新增依赖：`diff`、`turndown`、`@types/diff`、`@types/turndown`

存储路径：
- Todo 数据：`["todo", sessionID]`
- 截断输出：`{dataDir}/tool-output/`

**验收标准：** ✅ 工具框架完整，19 个内置工具已定义。权限系统支持 allow/deny/ask 三级。所有工具通过 Tool.define() 统一定义，自动 Zod 校验和输出截断。全部 211 个测试通过，TypeScript 类型检查通过。

**待补齐项（3 个占位 stub + 2 个未完成功能）：**
| 项目 | 状态 | 依赖 | 预计补齐阶段 |
|------|------|------|-------------|
| `apply_patch` | 占位，调用抛错 | Patch 解析模块 | 可独立实现 |
| ~~`task`~~ | ✅ Phase 6 已实现 | ~~Agent 系统~~ | ~~Phase 6~~ |
| `skill` | 占位，调用抛错 | Skill 发现系统 | 后续增强 |
| `lsp` | 占位，调用抛错 | LSP 客户端 | 后续增强 |
| ~~`plan_enter/exit`~~ | ✅ Phase 6 已实现 | ~~Agent + Question~~ | ~~Phase 6~~ |
| `bash` tree-sitter 解析 | 未实现，命令直接执行 | tree-sitter-bash | 可独立实现 |
| `question` UI 接入 | 框架就绪，缺 UI 响应 | Server / Web UI | Phase 7-8 |

---

### 第六阶段：Agent 循环 [已完成]

> 目标：完整的对话-思考-行动循环。

#### 6.0 Agent 定义 (`agent/agent.ts`) [已完成]

- [x] `Agent.Info` Zod schema（name, mode, permission, model, temperature, steps 等）
- [x] 4 个内置代理：
  - `build` — 默认代理，全功能，允许 question / plan_enter
  - `plan` — 计划模式，禁用 edit / write / bash，仅允许 plan_exit
  - `general` — 通用子代理，禁止 todoread / todowrite
  - `explore` — 只读探索代理，仅允许 grep / glob / list / bash / read / webfetch / websearch
- [x] 权限默认合并：`*:allow`, `doom_loop:ask`, `external_directory:ask`, `.env:ask`
- [x] `Agent.get()` / `Agent.list()` / `Agent.defaultAgent()`

#### 6.1 LLM 流式调用 (`session/llm.ts`) [已完成]

- [x] `LLM.stream()` — 封装 AI SDK `streamText()`，集成代理配置
- [x] `LLM.environmentPrompt()` — 生成环境系统提示词（平台、Shell、工作目录、日期）
- [x] 自动按权限规则过滤被拒绝的工具
- [x] `experimental_repairToolCall` — 修复大小写错误的工具名（降级为 invalid）
- [x] Provider 消息变换中间件（Anthropic 空消息、缓存控制、toolCallId 规范化）

#### 6.2 流式事件处理器 (`session/processor.ts`) [已完成]

- [x] `SessionProcessor.create()` — 创建处理器实例
- [x] 事件处理：
  - `reasoning-start/delta/end` → ReasoningPart
  - `text-start/delta/end` → TextPart（增量推送）
  - `tool-input-start` → ToolPart（pending）
  - `tool-call` → ToolPart（running）+ 死循环检测
  - `tool-result` → ToolPart（completed）
  - `tool-error` → ToolPart（error）+ 权限拒绝检测
  - `finish-step` → token 用量计算 + 费用统计
- [x] 死循环检测：连续 3 次相同工具 + 相同参数触发 `doom_loop` 权限询问
- [x] 错误重试：429 / 500 / 502 / 503 / 504 / 529 状态码，指数退避 + 抖动
- [x] 未完成工具 Part 自动标记为 error
- [x] 返回 `"continue"` | `"stop"` | `"compact"`

#### 6.3 Agent 主循环 (`session/prompt.ts`) [已完成]

- [x] `SessionPrompt.prompt()` — 入口函数：创建用户消息 → 进入循环
- [x] `SessionPrompt.loop()` — 核心 `while(true)` 循环：
  1. 收集消息历史
  2. 查找 lastUser / lastAssistant / lastFinished
  3. 终止检查（finish 不是 tool-calls/unknown 且用户消息更早）
  4. 获取模型 + 代理
  5. 创建 assistant 消息
  6. `resolveTools()` 包装注册工具为 AI SDK 格式
  7. 调用 `processor.process()` 流式处理
  8. 根据结果决定 continue / stop
- [x] `resolveTools()` — 为每个工具创建 `Tool.Context`（sessionID, abort, callID, metadata, ask）
- [x] `createUserMessage()` — 构建并持久化用户消息
- [x] `SessionPrompt.cancel()` — 中断正在运行的循环
- [x] `SessionPrompt.assertNotBusy()` — 断言会话未忙碌
- [x] 终止条件：纯文本响应 / 最大轮次 / 错误 / 权限拒绝 / 用户取消

#### 6.4 补齐占位工具 [已完成]

- [x] `task` 工具 — 子代理委派：
  - 按权限过滤可用子代理
  - 创建子 Session（`parentID` 关联父会话）
  - 限制权限：禁止 todowrite / todoread / 嵌套 task
  - 调用 `SessionPrompt.prompt()` 在子会话中运行完整循环
  - 返回文本包装在 `<task_result>` 标签中
  - 支持 `task_id` 恢复先前子代理会话
  - abort 信号传播
- [x] `plan_enter` / `plan_exit` 工具 — 计划模式切换：
  - 通过 `Question.ask()` 弹出确认框
  - 创建合成用户消息切换代理（`agent: "plan"` / `agent: "build"`）
  - plan_exit 附带"执行计划"提示文本
  - 模式切换通过插入合成用户消息实现，循环每轮从 `lastUser.agent` 读取当前代理

#### 6.5 基础设施改动 [已完成]

- [x] `Session.Info` 新增 `parentID`（子会话关联）、`permission`（会话级权限覆盖）
- [x] `Session.BusyError` — 会话忙碌异常
- [x] `Session.Event.Error` — 会话错误事件
- [x] `Session.getUsage()` — 根据模型价格计算 token 费用
- [x] `Session.touch()` — 更新时间戳
- [x] `MessageV2.toModelMessages()` — 内部消息 → AI SDK ModelMessage 格式
  - 处理 user text/file、assistant text/tool/reasoning
  - pending/running 工具自动转为 error（防止悬空 tool_use）
  - 调用 `convertToModelMessages()` 生成最终格式
- [x] `MessageV2.fromError()` — 异常分类（AbortedError, AuthError, APIError, ContextOverflowError）
- [x] `Truncate.GLOB` — 工具输出目录权限通配符
- [x] `ToolRegistry` 注册 `PlanEnterTool` / `PlanExitTool`
- [x] `index.ts` 新增导出：`Agent`, `SessionPrompt`, `SessionProcessor`, `LLM`

**验收标准：** ✅ Agent 循环框架完整。4 个内置代理已定义，核心循环支持消息构建→LLM 调用→工具执行→结果回传。流式事件处理覆盖 text/reasoning/tool-call/tool-result/tool-error/finish-step。终止条件支持纯文本响应、最大轮次、错误、权限拒绝、用户取消。task 工具支持子代理委派，plan 工具支持模式切换。全部 211 个测试通过，TypeScript 类型检查通过。

---

### 第七阶段：HTTP Server

> 目标：通过 HTTP API 暴露 Agent 能力。

- [ ] Hono 应用 + SSE 流式传输
- [ ] 会话 CRUD API
- [ ] 聊天 API（发送消息 + 流式响应）
- [ ] 供应商/设置 API
- [ ] IM webhook 集成入口

**验收标准：** curl 能创建会话、发送消息、通过 SSE 接收流式响应。

---

### 第八阶段：Web UI

> 目标：可用的聊天界面。

- [ ] Vite + React + Tailwind
- [ ] 聊天面板（Markdown 渲染、流式输出）
- [ ] 工具调用卡片（可折叠）
- [ ] 会话列表（创建/删除/切换）
- [ ] 设置面板（供应商配置）
- [ ] 暗色/亮色主题

**验收标准：** 浏览器能正常聊天，工具调用过程可视化。

---

### 后续增强

- [ ] 补齐 Phase 5 占位：`apply_patch` 工具（需实现 Patch 解析模块）
- [ ] 补齐 Phase 5 占位：`skill` 工具（需实现 Skill 发现/加载系统）
- [ ] 补齐 Phase 5 占位：`lsp` 工具（需实现 LSP 客户端集成）
- [ ] 补齐 Phase 5 未完成：`bash` tree-sitter 命令解析（细粒度权限检查）
- [ ] MCP 协议支持
- [ ] IM 集成（Telegram / 微信 / 飞书）
- [ ] 文件上传
- [ ] Token/费用追踪
- [ ] 自定义 System Prompt
- [ ] 工具扩展机制（自定义工具目录扫描、插件系统）
- [ ] 认证鉴权
- [ ] Docker 部署
- [ ] Electron 集成

---

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 语言 | TypeScript | ES2022, strict mode |
| 运行时 | Node.js | 兼容 Electron |
| LLM SDK | Vercel AI SDK (`ai`) | streamText, 工具调用 |
| HTTP 框架 | Hono | 轻量、类型安全 |
| 存储 | JSON 文件 | 零依赖、好调试 |
| 前端 | React + Vite | |
| 样式 | Tailwind CSS | |
| 校验 | Zod | 参数/配置校验 |

## 目录结构

```
salt-agent/
├── packages/
│   └── salt-agent/            # 唯一的包，所有代码在这里
│       └── src/
│           ├── index.ts       # 统一导出
│           ├── global/        # 数据目录路径
│           ├── id/            # ID 生成器
│           ├── storage/       # JSON 文件存储
│           ├── bus/           # 事件总线（BusEvent + Bus）
│           ├── util/          # 工具函数（lazy, lock, error, fn, log, wildcard, abort）
│           ├── session/       # 会话 + 消息 [已完成]
│           ├── config/        # 配置系统 [已完成]
│           ├── provider/      # LLM 供应商 [已完成]
│           │   ├── models.ts  #   静态模型注册表
│           │   ├── provider.ts #  Provider namespace（核心）
│           │   ├── auth.ts    #   凭据持久化（API key / OAuth）
│           │   ├── transform.ts # 消息转换（供应商差异适配）
│           │   └── error.ts   #   错误解析（溢出检测）
│           ├── workspace/     # 项目目录管理 [已完成]
│           ├── permission/    # 权限系统（allow/deny/ask） [已完成]
│           ├── shell/         # Shell 工具（检测、进程管理） [已完成]
│           ├── ripgrep/       # ripgrep 集成 [已完成]
│           ├── tool/          # 工具框架 + 19 个内置工具 [已完成]
│           │   ├── tool.ts    #   核心框架（Tool.define / Context / Info）
│           │   ├── truncation.ts #  输出截断（2000 行 / 50KB）
│           │   ├── registry.ts #  工具注册表
│           │   ├── read.ts / write.ts / edit.ts / apply-patch.ts  # 文件操作
│           │   ├── grep.ts / glob.ts / ls.ts  # 搜索
│           │   ├── bash.ts    #   Shell 执行
│           │   ├── webfetch.ts / websearch.ts  # Web
│           │   ├── todo.ts / question.ts / batch.ts / invalid.ts  # 辅助
│           │   └── task.ts / skill.ts / lsp.ts / plan.ts  # 高级（框架）
│           ├── agent/         # Agent 定义 + 循环
│           └── server/        # HTTP API + 路由
└── web/                       # 前端
    └── src/
        ├── App.tsx
        ├── components/
        ├── hooks/
        ├── lib/
        └── types/
```

## 开发建议

1. **按阶段推进**：每个阶段完成后验收，确认没问题再进入下一阶段
2. **最小可用**：每个阶段只做必要的东西，不要提前优化
3. **保持类型安全**：不用 `any`，利用 TypeScript 的类型系统减少 bug
4. **对标 opencode**：遇到设计决策时参考 opencode 的做法
