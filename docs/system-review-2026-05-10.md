# Anya 系统审查与优化建议

审查日期：2026-05-10

## 范围

本报告基于当前仓库的源码、文档和本地命令验证，覆盖以下系统面：

- Agent 主循环、会话存储、工具调度、配置加载。
- Telegram 适配层、回调路由、分页、语音、图片、授权。
- bundled English skills、学习数据持久化、定时任务、CLI。
- `docs/qa.md`、`docs/architecture-diagrams.md`、`docs/token_optimization_analysis.md`、`docs/short-video-strategy.md` 等文档中暴露的产品问题。

本报告不覆盖真实 Telegram Bot 线上运行压测、真实供应商 API 账单核验、真实用户学习效果评估。

## 验证快照

已观察到的本地验证结果：

- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `ANYA_HOME=$(mktemp -d) pnpm start -- init --defaults`：通过。
- `ANYA_HOME=$(mktemp -d) pnpm start -- doctor`：通过。
- `pnpm test`：失败，原因是当前仓库没有测试文件，但 `package.json` 已声明 Vitest 测试脚本。

结论：当前系统能编译和完成基础 CLI 启动，但自动化回归覆盖基本为空，不能支撑复杂 Agent/Telegram/skill 行为的安全演进。

## 总体判断

Anya 已经不是一个简单聊天机器人，而是一个以 Telegram 为主要界面的英语学习 Agent 系统。它有比较清晰的分层：

- `Agent.run()` 负责统一 ReAct 循环、上下文加载、工具执行和会话保存。
- Provider 层抽象了 Codex 与 Gemini。
- Tool registry 统一管理 `tg_msg`、`persist`、`db`、`cron`、`tts`、`pron_assess` 等能力。
- Telegram adapter 负责命令、回调、消息渲染、图片/语音入口。
- Skill 系统把学习流程沉淀到 Markdown 指令和 reference 文档。
- SQLite 负责 session、messages、学习数据和计划任务。

这个方向是成立的：系统把“学习产品”所需的交互、记忆、练习、语音、定时触达都放进了一个统一运行时里。主要问题不在功能想象力，而在运行时边界、授权一致性、状态机可靠性和测试覆盖。

## 主要优势

1. **Agent 运行时边界清楚**

   `src/agent/Agent.ts` 已把 session、history、summary、tool dispatch、usage tracking 放在统一入口，后续优化可以集中治理，而不是散落在各个 skill 中。

2. **Telegram 工具收敛方向正确**

   `tg_msg` 已覆盖文本、键盘、quiz、语音、文件、分页、编辑、删除、reaction 等交互形式。对一个 Telegram-first 学习产品来说，这比多个碎片工具更容易控制输出一致性。

3. **学习数据开始结构化**

   `persist`、`study.db`、profile/task/practice/word 等表明系统已从纯聊天走向可度量学习路径，这是做 planner、复习、错题聚类、提醒的基础。

4. **上下文压缩和 token 优化已有意识**

   仓库内已有 context compression、skill reference 分层和 token 优化文档。系统规模继续增长时，这些机制是必要的。

5. **产品问题已经被文档化**

   `docs/qa.md` 中的真实 QA 记录非常有价值。它直接指出了用户体验层面的关键问题：过度 quiz、回复模板化、WakuWaku 过多、等待下一步时失控、planner 不够像教练。

## 高优先级问题

### P0：Telegram 授权不完整

`handleIncoming()` 内部有 `allowed_user_ids` 检查，但部分 Telegram command 和 callback 在进入 `handleIncoming()` 前就直接执行了。

风险点：

- `/model` 会展示模型配置：`src/adapters/telegram/TelegramAdapter.ts:307`。
- `/usage` 会展示用量统计：`src/adapters/telegram/TelegramAdapter.ts:337`。
- `model:*` callback 会直接修改配置并 `persistConfig()`：`src/adapters/telegram/TelegramAdapter.ts:730`。
- `/new`、`/kill` 会创建或清空会话：`src/adapters/telegram/TelegramAdapter.ts:290`、`src/adapters/telegram/TelegramAdapter.ts:299`。

影响：

- 未授权用户可能读取运行状态。
- 未授权用户可能切换模型后端并持久化配置。
- 未授权用户可能重置会话或干扰学习流。

建议：

- 在 `TelegramAdapter` 中抽出统一的 `isAuthorized(ctx)` / `guardAuthorized(ctx)`。
- 所有 `bot.command()`、所有 callback 分支、`poll_answer` 分支都先走统一 guard。
- 对只读 command 和写操作 command 区分日志等级，但不要区分授权策略。
- 增加覆盖 `/model`、`/usage`、`model:*`、`/new`、`/kill` 的单元测试或集成测试。

### P0：SQLite 写事务存在竞态和一致性风险

`saveMessages()` 在事务外读取 `MAX(seq)`，之后再 `BEGIN` 写入：

- `src/storage/sessionStore.ts:178`
- `src/storage/sessionStore.ts:182`
- `src/storage/sessionStore.ts:200`

另外多个写路径使用普通 `BEGIN`：

- `src/domain/helpers.ts:103`
- `src/tools/db.ts:269`

风险：

- 并发写同一个 session 时，两个写入者可能读到相同 `MAX(seq)`，产生重复或乱序。
- 普通 `BEGIN` 是 deferred transaction，锁获取时间较晚，竞争时更容易在写入阶段失败。
- 目前缺少 `(session_id, seq)` 唯一约束，无法在数据库层阻止重复序号。

建议：

- 将 `SELECT MAX(seq)` 移入事务内。
- 写事务统一使用 `BEGIN IMMEDIATE`。
- 给 `messages(session_id, seq)` 加唯一索引。
- 如果 insert 发生 constraint violation，明确重试整个 append 流程。
- 给 `saveMessages()` 写并发追加测试。

### P0：测试体系缺失

`package.json` 已声明 Vitest，但当前 `pnpm test` 因无测试文件失败。对于这个系统来说，缺测试不是小问题，因为核心风险集中在“LLM 输出 + 工具副作用 + Telegram 回调 + SQLite 状态”之间。

最小测试集建议：

- `sessionStore.saveMessages()`：顺序、并发、rollback。
- `config loader/schema`：默认配置、用户覆盖、未知字段、schema 同步。
- `ToolRegistry.dispatch()`：成功、超时、错误、日志脱敏。
- `TelegramAdapter`：授权 guard、callback 路由、分页 key。
- `tg_msg`：keyboard、quiz、paginate、edit/delete 的参数解析。
- `skills`：至少对 bundled skills 做 frontmatter、reference 链接、callback 名称存在性检查。

## 中高优先级问题

### P1：配置 schema 漂移

默认配置和校验文件已经不完全一致：

- 默认配置含 `provider.backend`、`gemini.vision_model`、`stt`、`tts`、`azure`、`security`、`ui` 等字段：`src/config/defaults.ts:143`。
- Zod schema 是 partial 且缺少部分默认字段，例如 `security`、`tts`、`ui`：`src/config/schema.ts:16`。
- JSON schema 仍包含旧的 `agent`、`user` 节点，并缺少部分新字段：`src/config/schema.json:15`。

影响：

- 编辑器提示和真实配置不一致。
- `anya init` 生成的配置、运行时解析、文档说明可能互相打架。
- 后续新增配置时容易绕过校验。

建议：

- 以 TypeScript/Zod 为单一事实来源，生成 JSON schema。
- 增加配置 schema snapshot 测试。
- 明确 unknown key 策略：生产环境建议 warn，严格模式建议 fail。
- `defaults.ts`、`schema.ts`、`schema.json` 的字段覆盖率要进入 CI。

### P1：Skill 流程依赖自然语言约束，缺少运行时状态机

当前 skill 主要靠 Markdown 指令约束模型行为。真实 QA 中已经出现这些问题：

- 应该等待用户点击或回答时，Agent 继续往下跑。
- 练习过早进入 quiz。
- 多轮互动记不住当前阶段。
- 某些模板化表达频率过高。

根因不是某一个 skill 写得不好，而是运行时没有足够的状态约束。

建议：

- 给 session 增加 `skill_state`，记录 active skill、stage、expected callback、last prompt id、attempt count。
- `tg_msg` 支持 `end_turn: true`，表示发出这条消息后 Agent 主循环应停止等待用户。
- `tg_msg` 支持 `expected_callback` 或 `expected_input_type`，由 adapter 在下一轮输入中注入结构化上下文。
- callback 分支把用户点击转换成标准事件，例如 `[/callback skill=planner action=start_mock]`。
- 对每个 bundled skill 增加最小静态检查：引用文件存在、callback 命名存在、禁止不存在的路由。

### P1：`tg_msg` 发出交互消息后缺少强制停轮机制

Agent 主循环只要模型继续返回 tool calls，就会继续执行：

- `src/agent/Agent.ts:256`

`tg_msg` 工具本身只返回 JSON 结果，不表达“这一轮应结束”：

- `src/tools/telegram.ts:109`
- `src/tools/telegram.ts:145`

这会把“等待用户”变成 prompt 约束，而不是运行时约束。对于学习产品，这是高频 UX 风险。

建议：

- 在 `ToolDispatchResult` 中增加 `endTurn?: boolean`。
- `tg_msg` 参数增加 `end_turn`，对 keyboard、quiz、paginate、countdown 默认可设置为 true。
- `Agent.run()` 检测到 `endTurn` 后保存消息并返回，不继续请求模型。
- 在 skill 指令中从“请等待用户”改为“发送 end_turn 消息”。

### P1：Tool timeout 不会取消底层副作用

`dispatch()` 使用 `Promise.race()` 做超时：

- `src/tools/registry.ts:173`

这只能让调用方得到 timeout error，不能取消正在执行的工具。对于写文件、发 Telegram 消息、数据库写入、TTS 生成等副作用工具，底层 Promise 仍可能继续完成。

建议：

- Tool interface 增加 `AbortSignal`。
- `dispatch()` 用 `AbortController`，timeout 后 `abort()`。
- 网络、文件、长任务工具逐步适配 signal。
- 对不能取消的工具标记 `cancellable: false`，并在日志中明确。
- 对副作用工具引入 idempotency key，避免 timeout 后重试造成重复发送或重复写入。

### P1：分页消息 key 只用 `message_id`

分页状态当前 key 是 Telegram `message_id`：

- `src/adapters/telegram/TelegramAdapter.ts:94`
- `src/adapters/telegram/TelegramAdapter.ts:643`

Telegram 的 `message_id` 在单个 chat 内唯一，但不是全局唯一。当前 Map value 中保存了 `chatId`，但查找 key 没有包含 chatId。

风险：

- 多 chat 使用同一个 bot 时，分页状态可能互相覆盖。
- callback 查询时可能编辑错误 chat 的消息。

建议：

- key 改为 `${chatId}:${messageId}`。
- callback data 改为 `page:<chatId>:<messageId>:<pageIndex>` 或使用短 id 映射。
- 为分页状态增加 TTL 清理，避免长期运行内存增长。

## 中优先级问题

### P2：Planner reference 中存在不可达 callback

`planner/references/triggers.md` 中 `exam_close` 使用：

- `src/skills/bundled/english/planner/references/triggers.md:61`

该按钮是 `[看 2 周冲刺计划|coach]`，但系统中没有明确的 `coach` skill 或 callback 路由。这会导致用户点击后进入 generic callback，最终由模型猜测含义，体验不稳定。

建议：

- 改成已有路由，例如 `nav:plan`、`planner:sprint_2w` 或真实存在的 skill slug。
- 增加 skill reference callback lint，禁止未知 callback 进入主分支。

### P2：多模态抽象还没有打通

系统已经有 `MessageFile` 和 Telegram 图片入口，但 Telegram 图片当前更像“先做 vision-to-text，再把文本交给 Agent”。Provider 层没有统一把 `files` 作为模型输入的一部分处理。

影响：

- 图片理解依赖 adapter 特例，不利于扩展到文档、截图批改、作文批注。
- Skill 无法稳定声明“本轮输入包含图片/音频/文件”。

建议：

- Provider interface 统一支持 `messages + files`。
- Telegram 图片、音频、文件都转换成统一 attachment metadata。
- Skill prompt 中通过结构化上下文描述附件，而不是混进自然语言。
- 对不支持多模态的 provider 做显式 fallback。

### P2：日志中包含用户内容片段，缺少脱敏策略

多处日志记录了用户输入或转写文本片段：

- Telegram incoming：`src/adapters/telegram/TelegramAdapter.ts:201`。
- STT transcript：`src/lib/stt.ts:136`。
- TTS text：`src/lib/tts.ts:138`。
- Tool dispatch 会记录完整 args：`src/tools/registry.ts:171`。

风险：

- 学习内容、语音转写、搜索 query、配置参数可能进入日志。
- 如果日志长期保存或上传，会带来隐私和密钥泄露风险。

建议：

- 增加统一 `redactForLog()`。
- 默认只记录长度、hash、类型、sessionId、tool name。
- 对 API key、token、file path、用户原文做脱敏。
- 提供 `advanced.log_payloads: false` 默认关闭；开发调试时显式开启。

## 产品体验问题

### 回复风格过度模板化

`docs/qa.md` 中已经指出 WakuWaku、固定夸奖、过度鼓励影响体验。英语学习产品应更像稳定教练，而不是每轮都兴奋反馈。

建议：

- 把高频口头禅从全局 personality 中移除，只在少量 milestone 使用。
- 建立 tone policy：纠错时短、明确、具体；鼓励时低频；解释时优先例句。
- 在 skill QA 中加入“连续 5 轮不得重复同一开场模板”的检查。

### Quiz 使用过早、过多

Telegram native quiz 适合“验证”，不适合所有教学步骤。真实用户更常需要先理解、跟读、填空、对比，再进入 quiz。

建议：

- 把 quiz 作为 learning loop 的后半段，而不是默认第一步。
- placement、dictation、pronunciation、planner 分别定义允许 quiz 的阶段。
- 对初次讲解和错题讲解优先使用 inline keyboard 或普通文本互动。

### Planner 应更像计划系统，而不是一次性菜单

当前 planner 有触发模板、任务、短练习入口，但运行时状态不足，容易变成“列菜单”。理想行为应是：

- 基于 profile 和最近 practice 数据给出一条最小下一步。
- 用户完成后写回 task/practice。
- cron 根据 streak、考试日期、错题聚类推送。
- planner 的每次输出都能解释“为什么现在做这个”。

## 建议路线图

### 阶段一：安全与可靠性

目标：先堵住会造成误操作、数据竞争、无法回归的问题。

任务：

- 统一 Telegram 授权 guard，覆盖所有 command/callback/poll。
- 修复 SQLite 写事务：`BEGIN IMMEDIATE`、事务内读 seq、唯一索引、并发测试。
- 建立最小 Vitest 测试目录，先覆盖 session/config/tool/telegram callback。
- 统一配置 schema 来源，修复 JSON schema 漂移。
- 增加日志脱敏默认策略。

验收：

- 未授权用户无法执行 `/model`、`/usage`、`/new`、`/kill`、`model:*`。
- 并发追加同一 session 不产生重复 seq。
- `pnpm test` 有真实测试并通过。
- `pnpm typecheck && pnpm build` 通过。

### 阶段二：交互状态机

目标：让“等待用户”成为运行时能力，而不是 prompt 约束。

任务：

- `tg_msg` 增加 `end_turn`。
- `ToolDispatchResult` 增加 `endTurn`。
- session 增加 `skill_state` 或独立 skill runtime 表。
- callback 统一标准事件格式。
- pagination key 改成 chat scoped，并加 TTL。
- 对 bundled skills 做 callback/reference lint。

验收：

- 发出选择题、菜单、分页、等待输入后，Agent 不会继续自说自话。
- 点击按钮后能恢复到正确 skill stage。
- stale callback 有清晰提示，不会误入其他流程。

### 阶段三：学习产品质量

目标：提升英语教练体验，减少“机器人感”和误练习。

任务：

- 重写 placement/planner/pronunciation 的关键路径，减少早期 quiz。
- 把 planner 输出绑定到真实 profile、task、practice 数据。
- 建立 tone regression 样例，限制重复口头禅。
- 增加学习数据 dashboard 或 `/usage` 的学习版统计：近 7 天练习、错题类型、复习建议。

验收：

- 新用户 onboarding 后能得到一条明确学习路径。
- 单次练习能保存结果，并影响下一次 planner 建议。
- 回复风格稳定、少模板、少无意义夸奖。

## 可直接落地的改动清单

建议按以下顺序拆 issue：

1. `TelegramAdapter`: add global auth guard for all commands and callbacks.
2. `sessionStore`: make message append transaction-safe with unique `(session_id, seq)`.
3. `tests`: add Vitest bootstrap and first regression tests.
4. `config`: generate JSON schema from Zod or enforce schema parity test.
5. `tools`: add `endTurn` result path and `tg_msg.end_turn`.
6. `tools`: add AbortSignal to tool execution and idempotency guidance for side-effect tools.
7. `telegram`: scope pagination state by chat id and add TTL cleanup.
8. `skills`: add static lint for reference files and callback targets.
9. `planner`: replace unknown `coach` callback with a real route.
10. `logging`: add redaction layer and disable payload logging by default.

## 最小架构目标

Anya 下一阶段应从“LLM 按 Markdown 指令调用工具”升级成“LLM 在受控学习运行时里做决策”。核心变化是：

- LLM 负责生成解释、题目、反馈和计划建议。
- 运行时负责授权、状态、停轮、路由、持久化、去重、超时取消。
- Skill 负责教学策略，但不能独自承担状态机和安全边界。

这样系统会更稳，也更容易继续扩展到口语批改、作文批改、短视频学习、考试计划和跨平台入口。
