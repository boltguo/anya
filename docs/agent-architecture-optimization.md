# Anya Agent 架构优化建议

这份文档只评估 agent runtime、工具系统、平台适配器、配置与调度层，不讨论具体 English skills 的教学流程。

当前 Anya 的方向已经很清楚：它不是通用办公 Agent，而是一个 Telegram-first 的私人英语学习助手。这个定位会影响架构取舍：核心代码可以承认“英语学习”这个产品边界，但仍然要避免把每个练习流程、菜单分支、数据字段散落写死在 adapter 或 agent 主循环里。

## 总体判断

现有架构的底子是可继续演进的：

- `Agent.run()` 已经具备完整 ReAct 循环、历史记录、工具调用、上下文压缩和平台回复能力。
- `tg_msg` 把 Telegram 富交互压缩成一个工具，节省了大量函数声明 token。
- `persist` 统一承接学习数据，减少 skills 直接操作数据库造成的结构漂移。
- `SOUL.md`、`RULES.md`、`USER.md`、`MEMORY.md` 让人格、规则、用户画像和学习状态可以在 prompt 层迭代。
- Cron 已经让 Anya 从被动问答变成可主动触发的私人助手。

主要问题不是能力不够，而是几个核心文件承担了过多职责。短期继续堆功能会很快变成“能跑但难改”。优化重点应该是收口边界、拆分职责、减少 prompt 和工具循环中的无效消耗。

## 高优先级优化

### 1. 拆分 `Agent.run()`

现状：

`Agent.run()` 同时负责 session 创建、历史读取、prompt 构建、模型调用、工具循环、工具结果入库、Telegram 去重、错误处理和最终回复。这会导致任何新能力都倾向于往主循环里加条件分支。

建议拆成四层：

| 模块 | 职责 |
| --- | --- |
| `SessionRuntime` | 创建/读取 session，管理 history、message persistence、context compression。 |
| `PromptRuntime` | 组装 system prompt、用户输入、平台能力、当前 run policy。 |
| `ReactLoop` | 只处理 provider chat、tool call、tool result、loop limit。 |
| `RunPolicy` | 描述本次运行允许什么工具、平台、回复方式、是否无人值守。 |

这样以后新增 cron、测试 runner、CLI one-shot、Telegram callback，都不需要继续污染 `Agent.run()`。

### 2. 增加 per-run `toolPolicy`

现状：

工具是否启用主要依赖 `config.tools.enabled`，Cron 为了避免循环调用，会临时构造一个改过的 config，过滤掉 `cron`、`tg_msg`、`clarify`。这能跑，但属于运行时绕路。

建议在 `Agent.run()` 入参或运行上下文里加入：

```ts
type ToolPolicy = {
  allow?: string[];
  deny?: string[];
  platform?: 'telegram' | 'cli' | 'cron';
};
```

然后 `getToolSchemas()` 和 `dispatch()` 都基于 `config + toolPolicy` 判断。

收益：

- Cron 不需要复制配置。
- Telegram-only 工具不会出现在 CLI 或 Cron。
- 未来可以让某些 skill 使用更小工具集，减少 token。
- 工具权限从“全局配置”变成“本次运行策略”，更符合 agent runtime。

### 3. 给 Adapter 增加真实平台类型

现状：

目前更多是用 `isTelegram` 这种布尔值判断工具是否应该暴露。Cron 触发时也借用了 Telegram 风格的 adapter，语义不够干净。

建议：

```ts
type AdapterPlatform = 'telegram' | 'cli' | 'cron';
```

并让每个 adapter 明确声明：

```ts
adapter.platform
adapter.capabilities
```

收益：

- `tg_msg` 只在 Telegram platform 暴露。
- Cron 可以是无人值守 platform，不需要澄清、不直接发富消息。
- Prompt 可以按平台注入不同能力描述。

### 4. Prompt 分层和预算管理

现状：

`promptBuilder.ts` 会拼接 config personality、SOUL、RULES、USER、MEMORY、skills index、安全规则和平台能力。随着 skills 增多，system prompt 会越来越重。

建议引入 prompt budget：

| 层级 | 策略 |
| --- | --- |
| SOUL / RULES | 稳定层，尽量短，适合 prompt cache。 |
| USER / MEMORY | 压缩层，只保留近期对当前学习有用的信息。 |
| Skills Index | 索引层，只放 name、description、触发范围，不放流程细节。 |
| Active Skill | 按需通过 `skill_view` 拉取完整说明。 |
| Platform Capabilities | 按 adapter/platform 注入，不全局常驻。 |

目标不是无限压 prompt，而是避免每轮都把不相关的能力和长文档塞给模型。

## 中优先级优化

### 5. 拆分 `TelegramAdapter`

现状：

Telegram adapter 负责命令、文本、语音、图片、callback、approval、choice、session queue、gateway 生命周期、cron scheduler 启动等很多事情。

建议拆成：

| 模块 | 职责 |
| --- | --- |
| `TelegramCommandRouter` | `/new`、`/reset`、`/cancel` 等命令。 |
| `TelegramMediaHandler` | voice/photo/document 的下载、转写、metadata。 |
| `TelegramCallbackRouter` | approval、choice、custom callback 分发。 |
| `TelegramRunBridge` | 把 Telegram ctx 转成 `Agent.run()` 输入，并处理 reply queue。 |
| `TelegramLifecycle` | start/stop、scheduler start/stop、错误处理。 |

这样 Telegram 功能扩展不会继续把一个文件变成总控台。

### 6. 把 onboarding hint 从 adapter 移到 agent 层

现状：

Telegram adapter 里会读取用户信息并决定是否注入 onboarding hint。这属于业务 prompt 逻辑，不应该放在平台适配层。

建议：

- adapter 只提供 platform input。
- agent preprocessor 根据 `USER.md`、session 状态和输入内容决定是否注入 onboarding。
- onboarding 的话术和条件最好写在 RULES 或 support skill 中。

收益：

- CLI、Cron、Telegram 都可以共享同一套用户状态判断。
- Telegram adapter 更轻。

### 7. 历史消息 sanitizer 更严格

现状：

`history.ts` 的目标是生成 provider-safe history，但需要确保真的处理了连续同角色、孤立 tool result、空消息、无效 function call 等情况。

建议：

- 明确 provider 消息协议。
- 对历史做 deterministic normalization。
- 加测试覆盖：
  - 连续 user message。
  - 连续 assistant message。
  - tool result 没有对应 tool call。
  - 空 content。
  - 压缩摘要插入后仍合法。

这类问题平时不显眼，但一旦 provider 报错，会直接中断对话。

### 8. 工具超时改成 per-tool 配置

现状：

工具超时在 registry 里统一硬编码为 120 秒。

建议：

```ts
type ToolDefinition = {
  name: string;
  timeoutMs?: number;
  ...
};
```

不同工具合理超时不一样：

- `memory` / `persist`：5-15 秒。
- `web_search`：30-60 秒。
- `tts` / `pron_assess`：60-120 秒。
- `cron run`：可更长，但应该受无人值守策略限制。

收益是错误更快暴露，也减少 Telegram 会话卡住。

### 9. 清理配置命名和说明

现状：

部分注释和 README 里还残留 Gemini / Google 作为主 provider 的旧描述，而现在主 LLM 更偏 Codex OAuth / OpenAI provider，Gemini 更多用于视觉能力。

建议：

- `config.ts` 顶部注释更新。
- `schema.json` 和 README 对 provider 的表述统一。
- `tools.enabled` 的默认列表和 config wizard 保持一致。
- 把“开发期配置”和“长期自用推荐配置”分开。

## 低优先级优化

### 10. 抽象 outbound message 去重和状态显示

现状：

Telegram 的 typing/status、`tg_msg` 已发送后的纯文本去重、消息编辑等逻辑分散在 adapter 和 agent 循环中。

建议做一个小的 outbound runtime：

```ts
type OutboundState = {
  richMessageSent: boolean;
  finalTextSent: boolean;
  statusMessageId?: string;
};
```

这样可以避免以后新增平台或 cron 推送时重复处理“已经发过了还要不要再发”的问题。

### 11. 改进 prompt cache key

现状：

promptBuilder 已经注意到 timestamp 不放 system prompt，以提高缓存命中。但如果 skills index、RULES、MEMORY 频繁变化，仍会破坏稳定性。

建议：

- 稳定层和动态层分离得更明显。
- MEMORY 更新不要过频，学习证据优先在 `study.db`。
- Skills index 只保留短索引，详细流程按需读取。

### 12. 增加 agent runtime 测试

建议优先补这些测试：

| 测试 | 目标 |
| --- | --- |
| tool loop limit | 模型连续调用工具时不会无限循环。 |
| toolPolicy filtering | Cron 不暴露 `cron` / `tg_msg` / `clarify`。 |
| tg_msg dedupe | 工具已发 Telegram 富消息时，不重复发纯文本。 |
| history sanitizer | 历史消息永远满足 provider 输入协议。 |
| callback session | Telegram callback 能正确回到同一个 session。 |
| cron unattended run | Cron job 能运行、落盘 output、失败写 last_error。 |

## 推荐落地顺序

### 第一阶段：先收工具边界

1. 引入 `AdapterPlatform`。
2. 引入 `ToolPolicy`。
3. 改 `getToolSchemas()` 和 `dispatch()`，支持 platform/allow/deny。
4. Cron 不再修改 config，只传 `toolPolicy`。
5. 补 toolPolicy 单元测试。

这是最值得先做的，因为它能直接降低 agent、cron、adapter 之间的耦合。

### 第二阶段：拆 Telegram adapter

1. 先抽 callback router。
2. 再抽 command router。
3. 最后抽 media handler。
4. 保持外部行为不变，只做结构整理。

这一步会让 Telegram 新增菜单、按钮、语音流程时更稳。

### 第三阶段：拆 Agent runtime

1. 先抽 `ReactLoop`，保持行为完全一致。
2. 再抽 `SessionRuntime`。
3. 最后抽 `PromptRuntime`。
4. 每一步都跑 typecheck/build，避免大重构一次性失控。

### 第四阶段：优化 prompt 成本

1. 缩短 skills index。
2. 把平台能力按 adapter 注入。
3. USER/MEMORY 由 learner-state 控制更新频率。
4. 对高频固定 prompt 层做缓存友好设计。

## 结论

Anya 现在不缺功能，缺的是进一步把“私人英语学习助手”的边界固化到 runtime 里。最重要的不是把它重新抽象成通用 Agent 框架，而是让核心路径更短、更稳定、更少 token、更少循环。

优先级最高的切入点是 `ToolPolicy + AdapterPlatform`。它能同时解决 Cron 解耦、工具暴露、Telegram-only 能力、无人值守任务和未来测试的问题，是后续拆分 agent 与 adapter 的前置地基。
