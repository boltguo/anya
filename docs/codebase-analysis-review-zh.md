# Anya 项目代码库分析与审查报告

## 1. 项目概述

**Anya** 是一个高级、模块化且可扩展的个人 AI 代理（Agent）框架。其设计目标是提供跨平台的交互能力（目前主要深度集成了 Telegram），并重点强调 **持久化记忆**、**动态上下文管理** 和独特的 **文档驱动技能（Skill）系统**。

该项目不仅仅是一个简单的聊天机器人，而是一个具备自我进化能力、能管理长期记忆，并通过加载 Markdown 技能文档来动态扩展能力的个人助理系统。

## 2. 核心架构与模块化设计

项目采用了清晰的适配器（Adapter）模式和职责分离原则，主要包含以下核心模块：

### 2.1 核心代理层 (Core Agent - `src/agent/`)
这是整个系统的大脑。
*   **`Agent.ts`**: 实现了平台无关的 ReAct (Reasoning and Acting) 执行循环。它负责调度工具、处理 LLM 响应，并管理整个对话的生命周期。
*   **`promptBuilder.ts`**: 负责动态构建 System Prompt。它将系统规则（Rules）、用户画像（User Profile）、长期记忆（Memory）以及可用的技能索引（Skill Index）组合成最终的 Prompt。
*   **`contextCompressor.ts`**: **亮点功能**。当对话历史过长逼近 Token 限制时，该模块会利用 LLM 对对话的“中间部分”进行智能总结压缩，同时保留最近的对话上下文和核心指令，有效防止上下文丢失。

### 2.2 技能系统 (Skill System - `src/skills/`)
这是该项目最具特色的设计之一：**文档驱动的能力扩展**。
*   **Level-triggered 机制**: 技能并非硬编码的逻辑代码，而是定义在 Markdown 文件中（`SKILL.md`）。
*   **动态加载 (`loader.ts`)**: Agent 知道所有可用技能的目录，但只有在它明确决定执行某个特定任务时，才会通过专门的工具（如 `skill_view`）去“阅读”该技能的完整执行步骤。这极大地节省了上下文 Token，并使得添加新技能（例如项目中内置的大量 IELTS 备考技能）无需修改核心代码。

### 2.3 适配器层 (Adapters - `src/adapters/`)
处理与外部平台的交互。
*   **`TelegramAdapter.ts`**: 基于 `grammy` 库实现的健壮的 Telegram Bot 接口。它不仅仅处理文本，还负责：
    *   **并发控制**: 使用 `enqueuePerChat` 按聊天隔离队列，确保同一用户的消息按顺序处理，避免状态冲突。
    *   **多模态处理**: 集成了 Groq Whisper 进行语音转文本 (STT)，以及 Gemini Vision 进行图像分析，在消息交给核心 Agent 之前完成预处理。

### 2.4 提供商与工具层 (Providers & Tools)
*   **`src/providers/`**: 管理 LLM API 连接，包含了一个定制的 OpenAI "Codex Responses API" 集成，支持流式输出和 OAuth 设备代码认证。
*   **`src/tools/registry.ts`**: 集中管理 Agent 可调用的所有工具（如文件操作、网络搜索、数据库查询等），实现了工具的注册和分发。

### 2.5 存储与记忆系统 (Storage & Memory - `src/storage/`)
采用了**混合持久化**策略，平衡了性能和可读性：
*   **SQLite (`db.ts`)**: 用于存储高频、大容量的数据，如会话记录 (Sessions) 和消息日志。
*   **Markdown 文件**: 用于存储结构化、需要长期维护和人类可读的数据。通常位于用户的主目录下（如 `~/.anya/`），包括：
    *   `USER.md`: 用户画像。
    *   `MEMORY.md`: Agent 的长期笔记和关键信息。
    *   `RULES.md`: 系统的核心行为准则。
    Agent 被设计为可以通过工具动态更新这些文件，实现“自我进化”。

## 3. 关键工作流

1.  **消息接收与预处理**: 用户在 Telegram 发送消息/语音/图片 -> `TelegramAdapter` 接收并加入该用户的处理队列 -> 调用 STT 或 Vision API 进行多模态解析。
2.  **推理与执行 (ReAct Loop)**: 预处理后的消息传递给 `Agent` -> `Agent` 结合当前的 Memory 和 Skills 构建 Prompt -> LLM 决定是否调用工具 (如检索文档、加载技能细节) -> 循环执行直到得出最终结论。
3.  **状态保存与压缩**: 返回结果给用户 -> 更新 SQLite 历史记录 -> 如果历史过长，触发 `contextCompressor` 进行无损/有损压缩。

## 4. 构建、配置与依赖

*   **构建工具**: 使用 `tsup` (`tsup.config.ts`) 进行快速的 TypeScript 编译。
*   **依赖管理**: 使用 `pnpm` (Workspace)。
*   **核心第三方库**:
    *   `grammy`: Telegram Bot 框架。
    *   `better-sqlite3`: 同步 SQLite 驱动，性能优异。
    *   `@google/genai`, `openai`, `groq-sdk`: 各大 AI 模型 SDK。
    *   `zod`: 强大的运行时类型推断和 Schema 校验。
*   **CLI 初始化**: 提供 `bin/anya.ts`，用户可通过 `anya init` 初始化环境，系统会将模板配置和内置技能（如 IELTS 目录下的内容）拷贝到用户工作空间。

## 5. 总结与评价

**Anya** 是一个架构成熟、设计理念先进的 Agent 系统。其最大的亮点在于：
1.  **极强的可扩展性**：Markdown 驱动的技能系统使得非开发人员也能通过编写 Prompt 指南来赋予 Agent 新能力。
2.  **优秀的上下文管理**：结合了 SQLite 历史记录和 LLM 自动压缩机制，解决了长期对话带来的 Token 溢出问题。
3.  **高度拟人化的记忆系统**：通过维护独立的 `USER.md` 和 `MEMORY.md`，使得 Agent 能够真正“记住”用户的偏好和长期目标。

目前的实现主要集中在 Telegram 平台，但其底层的适配器架构为未来扩展到 Web、CLI 或其他 IM 平台留下了充足的空间。