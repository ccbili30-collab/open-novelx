# NovelX 分层主编 Growth V2 Implementation Plan

> **For Codex:** 串行执行本计划；冻结 V1 后先写失败测试，再修改生产代码。Live 第一处关键断链必须停止。

**Goal:** 将 OpenCode NovelX 的世界 Growth 从“一个根主编直接注册并派发全部档案”升级为“总主编规划 → 阶段主编注册与审查 → 叶子 Agent 有界写作”，加入多对多上游来源和源锚定记忆压缩，并用真实 Provider 生成一个经典中世纪奇幻世界。

**Architecture:** 总主编只拥有世界蓝图、阶段派发、记忆检查点和最终完成工具；每个临时阶段主编在独立子会话中读取当前阶段的权威来源，注册本阶段实体并派发只读叶子 Agent。原文和确定性运行账本保持权威，模型摘要只作导航；OpenCode Session Compaction（会话压缩）在阶段检查点后开启新的 Context Epoch（上下文世代）。

**Tech Stack:** TypeScript、Effect Schema、OpenCode Session/Task/Tool/Compaction、SolidJS、Bun、Playwright、Electron。

---

## 固定边界

- 唯一代码目录：`D:\CodexW\NovelX_Desktop\work\opencode-novelx`。
- 分支：`novelx-ui`；V1 冻结标签：`novelx-world-growth-v1-20260720`。
- 不修改 `work\worktree`、`work\main` 或安装目录 `D:\NovelX`。
- V2 新运行覆盖旧科技 Live 项目；V1 代码和状态证据由 Git 标签保留，不迁移旧 Live 数据。
- 本批只完成世界面：自然、族群、人文结构、组织/制度/经济/文化/信仰等由模型选择的阶段。
- 不进入历史、故事、角色、图谱检索、世界包导出或图片生成。
- 不修改 OpenCode 公共 HTTP、Session V2 数据库 Schema 或 Provider 协议。

## 权威运行链

```text
/growth 用户种子
  → Growth 总主编注册题材自适应蓝图并冻结阶段 DAG
  → 总主编为下一个依赖就绪阶段创建 novelx-stage-editor
  → 阶段主编绑定唯一阶段，读取完整上游来源并注册本阶段实体
  → 阶段主编为每个实体创建 novelx-world-writer 叶子会话
  → 叶子仅依据注册事实、上游绑定和原文写一份档案
  → 阶段主编审查并提交正式文件
  → 阶段完成工具生成无损状态账本和带来源导航摘要
  → 总主编写入 Growth 记忆检查点并触发 OpenCode Compaction
  → 新 Context Epoch 从蓝图、账本、阶段交接和原文索引恢复
  → 下一阶段重复
  → 全部阶段完成后 novelx_finish_world
```

## Task 1：V2 共享合同与多对多上游绑定

**Files:**

- Modify: `packages/schema/src/novelx-world.ts`
- Modify: `packages/opencode/src/novelx/world-materialization.ts`
- Test: `packages/opencode/test/novelx/world-materialization.test.ts`

**Steps:**

1. 写失败测试：阶段必须绑定唯一阶段主编；国家可同时绑定多个自然实体；绑定必须包含关系、影响和约束。
2. 将裸 `dependencyEntityIds` 升级为版本化 `upstreamBindings`，保留源实体 ID、关系语义、影响、约束和来源哈希。
3. 为阶段增加 `editorSessionId`、来源读取覆盖、记忆检查点和显式 review/completed 门禁。
4. V2 新运行只写新合同；V1 读取保持原样，不在本批自动迁移。
5. 运行 world materialization 定向测试和 Schema/OpenCode typecheck。

## Task 2：总主编、阶段主编与叶子权限

**Files:**

- Modify: `packages/opencode/src/agent/agent.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-stage-editor.txt`
- Modify: `packages/opencode/src/agent/prompt/novelx-world-growth.txt`
- Modify: `packages/opencode/src/agent/prompt/novelx-world-writer.txt`
- Modify: `packages/opencode/src/tool/task.ts`
- Test: `packages/opencode/test/agent/agent.test.ts`
- Test: `packages/opencode/test/tool/task.test.ts`

**Steps:**

1. 写失败测试覆盖允许的唯一派发对：`growth → novelx-stage-editor → novelx-world-writer`。
2. NovelX 内部链允许最大深度 2；其他 Agent 继续遵守现有 `subagent_depth` 默认门禁。
3. 总主编移除阶段注册、文档准备和提交权限，只保留蓝图、阶段派发、检查点和世界完成。
4. 阶段主编只能操作绑定阶段、派发世界叶子和提交本阶段文件。
5. 叶子保持只读且不得派生、注册、提交或修改规则。

## Task 3：阶段绑定、来源读取和审查封存

**Files:**

- Create: `packages/opencode/src/tool/novelx-finish-world-stage.ts`
- Create: `packages/opencode/src/tool/novelx-read-world-sources.ts`
- Modify: `packages/opencode/src/tool/novelx-prepare-world-stage.ts`
- Modify: `packages/opencode/src/tool/novelx-register-world-stage.ts`
- Modify: `packages/opencode/src/tool/novelx-prepare-world-document.ts`
- Modify: `packages/opencode/src/tool/novelx-commit-world-document.ts`
- Modify: `packages/opencode/src/tool/novelx-abort-world-document.ts`
- Modify: `packages/opencode/src/tool/novelx-world-runtime.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Test: `packages/opencode/test/tool/novelx-world-growth.test.ts`

**Steps:**

1. 阶段主编首次 prepare 时由 Harness 验证其父会话是 Growth 根会话并原子绑定阶段。
2. prepare 返回来源索引和已有读取覆盖，不把无限上游全文一次塞入工具结果。
3. 受控来源工具按注册实体 ID 分批返回完整原文，并持久记录准确文件哈希和读取覆盖。
4. 注册实体必须引用已读取的上游来源；每个声明依赖阶段必须真实使用。
5. 叶子 Context Pack 只装配该实体的多对多上游绑定和精确原文。
6. 最后一个档案提交后进入 reviewing；阶段主编显式审查并调用 finish stage 生成阶段交接。

## Task 4：源锚定压缩与恢复

**Files:**

- Create: `packages/opencode/src/tool/novelx-checkpoint-growth-memory.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Modify: `packages/opencode/src/agent/prompt/novelx-world-growth.txt`
- Test: `packages/opencode/test/tool/novelx-world-growth.test.ts`
- Test: `packages/opencode/test/session/compaction.test.ts`

**Steps:**

1. 阶段交接只接受已封存阶段；Harness 确定性写入阶段、实体、文件哈希、依赖、未决问题和任务状态。
2. 模型导航摘要必须引用实体 ID，不能替代原文或账本。
3. 检查点成功后调用 OpenCode `SessionCompaction` 为 Growth 根会话创建真实 compaction 输入。
4. 新 Context Epoch 从世界蓝图、物化账本、最近阶段交接和原文索引恢复，不继承阶段工具日志。
5. 测试压缩后继续下一阶段、重复检查点幂等、摘要缺项不丢任务、来源哈希漂移失败关闭。

## Task 5：桌面阶段层级和压缩状态投影

**Files:**

- Modify: `packages/app/src/context/novelx-world-growth.ts`
- Modify: `packages/app/src/context/novelx-world-growth.test.ts`
- Modify: `packages/app/src/pages/session/novelx-world-growth-view.tsx`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Modify: `packages/app/e2e/regression/novelx-workspace.spec.ts`

**Steps:**

1. 世界树显示总主编、阶段主编、叶子 Agent 的真实层级与状态。
2. 详情显示多对多上游绑定、来源读取覆盖、阶段审查、检查点和压缩恢复状态。
3. 运行文件继续显示真实流式草稿并锁定；正式提交后解锁。
4. 1920×1080 保持四区并排，窄窗保持既有覆盖规则。
5. 不显示图片任务、故事、角色或未实现图谱。

## Task 6：经典中世纪真实 Live 与覆盖交付

**Files:**

- Create: `docs/status/2026-07-20-novelx-editorial-growth-v2-batch.md`
- Overwrite Live project: `D:\CodexW\NovelX_Desktop\work\NovelX-World-Tech-Live-20260719-1`
- Overwrite preview: `C:\Users\16014\Desktop\NovelX-正式预览.png`

**Steps:**

1. 完成定向单元、权限、恢复、类型检查、App/Desktop 构建和 Playwright。
2. 验证旧 Live 目录绝对路径后覆盖旧科技产物，使用全新 Growth 会话输入经典中世纪奇幻种子。
3. 使用真实 Provider 完成模型选择的全部世界阶段，保存根会话、阶段主编、叶子会话、文件哈希和检查点证据。
4. 必须观察至少一次真实 Growth 根会话 Compaction，并证明之后继续完成下一阶段。
5. 核对图片任务、故事、角色和历史副作用均为零。
6. 用生产 Electron 打开同一项目，覆盖桌面正式预览并人工检查四区、阶段层级、正文、来源和完成状态。
7. 更新状态文档，运行 `git diff --check`，审查暂存内容，按语义提交；若无可写远端，明确记录仅本地提交。

## Live 停止条件

- 正式 `/growth` 仍由根主编直接注册或提交实体。
- 阶段主编继承了父级工具日志，或无法在压缩后从权威账本恢复。
- 叶子可以创建规则、派生 Agent 或修改不属于它的文件。
- 人文实体无法绑定多个自然实体，或绑定没有精确来源。
- 缺失 Provider、来源哈希漂移、状态损坏、压缩失败或任务身份漂移。
- 任何图片、历史、故事或角色副作用被启动。

