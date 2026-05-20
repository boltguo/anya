# Anya 英语学习系统 · 审计与整改记录

> 本文档已经压缩为操作性的执行摘要。完整的诊断推理过程见 git 历史。

## Schema reset 路径（dev 阶段）

```bash
# 1. Stop anya / kill the running process
# 2. Drop the local store
rm -f ~/.anya/data/store/study.db ~/.anya/data/store/study.db-shm ~/.anya/data/store/study.db-wal

# 3. Restart — db.ts auto-applies src/storage/study/study.sql on open
npm run dev
```

`db.ts` 在 schema apply 失败时立刻 throw；stack trace 会指出 study.sql 的语法 / FK / seed 问题。

需要 drop 的情形：改列类型、删列、改约束、新增 NOT NULL、新增 FK。
不需要 drop 的情形：新增表 / 索引（用 `IF NOT EXISTS`）、`error_keys` seed 增补（`INSERT OR IGNORE` 幂等）。

## 整改清单（截至 2026-05-20）

P0/P1/P2 共 21 项已完成。最终落地形态（v3）：

- 11 张表（从 15 张）：删除 `band_trend`、`activity_log`、`daily_tasks`、`skill_runs`，统一由 `samples` + `study_sessions` JOIN 派生。
- 21 个 samples 字段（从 33 个）：移除 `band_task/coherence/lexical/grammar/pronunciation`、`translation/image_path/source_url`、`load_score/duration_seconds/ui_feedback/domain/redo_count/attempt_no`；保留 `band_overall` + `assistance_level` + `parent_sample_id` + `prompt_hash` + `metadata`。
- 22 个 skills（从 28 个）：`listening-shadowing` + `speaking-shadowing` 合并为 `shadowing`，`daily-article` + `material-discussion` 并入 `reading-deepdive`，`listening-numberdrill` 并入 `listening-dictation`。`skill:mode` callback 后缀路由不同 mode。
- 17 个 persist actions（从 22 个）：删除 `skill_run_*` / `task_*` / `due_tasks`。
- 9 个 tools（从 10 个）：删除 `clarify`。

具体改动见 git 历史。

## 关键设计点（执行规则）

- **prompt_hash**：所有 skill 统一使用 `sha1(normalized_prompt)` 的前 12 个 hex 字符。
- **subcap_scores**：canonical 0–10 标尺；写入 `value` 字段；`learner-state` 服务端 EMA 由 TypeScript 计算，不由 LLM 心算。
- **SRS**：`nextSrsState` 从首次复习起就使用 ease，`mastered` 可回退至 `known` → `learning` → `queued_new`。
- **i+1**：`recent_practice` 支持 `scope: 'session' | 'global'`，跨 session 取难度信号走 global。
- **`study_session_id`**：`logPractice` 未传时自动通过 `ensureActiveStudySession(sessionKey, 24h)` 解析。
- **`error_keys` 白名单**：DB 表 + `errors.recurrence_key` 外键 + 启动时缓存；未知 key 落入 `metadata.unknown_error_keys`。
- **Active skill 锁**：故意不做。LLM 从历史判断流程切换。
