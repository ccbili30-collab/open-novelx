# NovelX Story Growth 与封面 Implementation Plan

> **For Codex:** 串行执行本计划；每个生产批次先写失败测试，再写最小实现。任何 Mock、Fixture 或静态 UI 都不能冒充真实 Story 或 Cover Live。

**Goal:** 在 OpenCode 内核 NovelX 中补全真实文件板块，并把已完成世界单向生长为具名历史书、关键文献、一部 6–8 章小说及三类真实封面，随后验证空项目一句话可贯通全部阶段。

**Architecture:** 新增独立 Story Materialization 与 Story Cover Manifest。Growth 根会话通过权威路由决定继续 World 或 Story；干净 Story Editor 注册全部作品结构并按依赖顺序派发只写一个文档的叶子，正文封存后由 Story Editor 分裂既有 `novelx-visual-editor` 工具分身。工具分身读取本阶段原文，为每个强制封面写一条最终 Prompt 并提交异步图片队列；Worker 只执行、验证和挂载，不参与内容判断或改写 Prompt。Renderer 只读取账本、文件和图片，不发明完成状态。

**Tech Stack:** TypeScript、Effect Schema、OpenCode Agent/Task/Tool、SolidJS、Bun、Electron、真实 OpenAI-compatible Provider 与 `gpt-image-2`。

---

## 固定边界

- 唯一代码目录：`D:\CodexW\NovelX_Desktop\work\opencode-novelx`，分支 `novelx-ui`。
- 保留当前工作树已有修改，不覆盖 `packages/app/index.html`、CLI session 文件或启动脚本。
- 继续使用 `D:\CodexW\NovelX_Desktop\work\NovelX-World-Tech-Live-20260719-1` 的完成世界作为第一轮真实上游。
- 文件板块显示全部用户项目文件，隐藏 `.git`、`node_modules`、`.novelx`、运行日志、缓存、数据库和凭据。
- 本批不生成角色卡、不扩展图谱、不回写世界、不做世界包排版。
- 缺少真实 Provider、来源漂移、身份错误、正文不完整或图片无效时失败关闭。

## Task 1：Story 合同与纯状态机

**Files:**

- Create: `packages/schema/src/novelx-story.ts`
- Create: `packages/schema/src/novelx-story-visual.ts`
- Create: `packages/opencode/src/novelx/story-materialization.ts`
- Create: `packages/opencode/src/novelx/story-visual.ts`
- Test: `packages/opencode/test/novelx/story-materialization.test.ts`
- Test: `packages/opencode/test/novelx/story-visual.test.ts`

**Steps:**

1. 写失败测试覆盖：至少一本历史书、2–5 份文献、一部小说、6–8 章、依赖顺序、具名路径、幂等注册和来源漂移。
2. 编译模型注册 Profile 为 Harness 拥有的稳定 IDs、路径、文档租约和完整性哈希。
3. 强制历史章节先于文献、文献先于小说章节；小说章节默认依赖前一章。
4. 按类型验证最小正文长度、标题、内部生产词泄漏和重复提交。
5. 写失败测试覆盖小说/历史书/主题三类必需封面、任务归属、来源哈希和队列终态。
6. 运行：`bun test test/novelx/story-materialization.test.ts test/novelx/story-visual.test.ts`（`packages/opencode`）。

## Task 2：Story 工具、Agent 与续跑路由

**Files:**

- Create: `packages/opencode/src/tool/novelx-inspect-growth-route.ts`
- Create: `packages/opencode/src/tool/novelx-story-runtime.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-story.ts`
- Create: `packages/opencode/src/tool/novelx-read-story-sources.ts`
- Create: `packages/opencode/src/tool/novelx-register-story.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-story-document.ts`
- Create: `packages/opencode/src/tool/novelx-commit-story-document.ts`
- Create: `packages/opencode/src/tool/novelx-abort-story-document.ts`
- Create: `packages/opencode/src/tool/novelx-finish-story.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-story-editor.txt`
- Create: `packages/opencode/src/agent/prompt/novelx-story-writer.txt`
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/tool/task.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Test: `packages/opencode/test/tool/novelx-story-growth.test.ts`
- Test: `packages/opencode/test/agent/agent.test.ts`
- Test: `packages/opencode/test/tool/task.test.ts`

**Steps:**

1. 写失败测试证明新 Growth 会话可接续完成世界，但不能接管未完成的异会话世界。
2. Story Editor 准备并读取玩家世界文稿来源，注册完整 Story 结构。
3. 每个文档依次 lease → `novelx-story-writer` → review → commit；失败和用户停止保留明确状态。
4. 固定派发为 `growth → novelx-story-editor → novelx-story-writer`，其他 Agent 不得调用内部工具。
5. 运行 Story 工具、Agent 权限和 Task 深度测试。

## Task 3：Story 视觉工具分身与真实图片 Worker

**Files:**

- Create: `packages/opencode/src/novelx/image-provider.ts`
- Create: `packages/opencode/src/novelx/story-image-queue.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-story-covers.ts`
- Create: `packages/opencode/src/tool/novelx-read-story-cover-sources.ts`
- Create: `packages/opencode/src/tool/novelx-register-story-covers.ts`
- Modify: `packages/opencode/src/agent/prompt/novelx-visual-editor.txt`
- Modify: `packages/opencode/src/novelx/world-image-queue.ts`
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/tool/task.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Test: `packages/opencode/test/novelx/story-image-queue.test.ts`
- Test: `packages/opencode/test/tool/novelx-story-growth.test.ts`

**Steps:**

1. 提取现有图片 Provider 请求与媒体验证，不改变地图/风貌语义。
2. Story Editor 在正文封存后分裂既有视觉工具分身；工具分身读取已提交正文，为小说、每本历史书和主题封面各写一条最终 Prompt 并提交队列。
3. Worker 使用竖向/横向尺寸真实生图，原样使用已冻结 Prompt，失败最多重试两次，不调用模型重写 Prompt。
4. 成功任务原子写入 `Stories/Media/covers`；全部成功为 ready，耗尽重试为 partial。
5. 运行 World 旧图片队列回归与 Story Cover 定向测试。

## Task 4：Growth 一句话编排

**Files:**

- Modify: `packages/opencode/src/agent/prompt/novelx-world-growth.txt`
- Modify: `packages/opencode/src/command/template/novelx-growth.txt`
- Modify: `packages/opencode/test/command/novelx-growth.test.ts`

**Steps:**

1. Growth 开始时调用权威路由，不再盲目重复注册世界。
2. 完成 World Publication 后自动派发 Story Editor；Story Editor 自己分裂视觉工具分身，不把封面上交给 Growth 重新派发。
3. 当前完成世界直接从 Story 开始；正文完成而封面缺失时恢复 Story Editor，由其恢复自己的视觉工具分支。
4. 全部完成时幂等报告真实文件数和图片状态，不进入人物、图谱或世界包。

## Task 5：文件板块、入口顺序与 Story 正式界面

**Files:**

- Modify: `packages/app/src/context/novelx-workspace.ts`
- Create: `packages/app/src/context/novelx-story-growth.ts`
- Create: `packages/app/src/context/novelx-story-growth.test.ts`
- Create: `packages/app/src/pages/session/novelx-story-growth-view.tsx`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Modify: `packages/app/src/i18n/zh.ts`
- Modify: `packages/app/e2e/regression/novelx-workspace.spec.ts`

**Steps:**

1. 右栏顺序改为文件、世界、故事、图谱、人物、世界包，只改变视觉顺序。
2. 文件板块默认展开用户项目根目录，显示所有非内部文件，保留选择、滚动和编辑状态。
3. Story Controller 校验账本完整性并读取真实正文和封面资产。
4. Story 首屏显示小说主封面、历史书和文献；树结构为小说 → 主题 → 章节、历史 → 书 → 章节、文献。
5. 未提交文档显示真实子 Agent 流式输出并锁定；提交后使用现有排版编辑器。
6. 宽屏、窄窗、返回上次位置、错误和部分封面状态均有真实 UI 投影。
7. 运行 App 定向测试、typecheck、生产构建和 Playwright。

## Task 6：真实续跑与一句话首跑

**Files:**

- Create: `docs/status/2026-07-21-novelx-story-growth-and-covers-batch.md`
- Overwrite: `C:\Users\16014\Desktop\NovelX-正式预览.png`

**Steps:**

1. 在当前完成世界启动新的 `/growth`，使用真实 `openai-compatible/gpt-5.6-luna` 续跑 Story。
2. 验证至少一本具名历史书、2–5 份文献、一部 6–8 章小说全部提交。
3. 验证小说、每本历史书和主题封面由真实 `gpt-image-2` 生成并挂载。
4. 用正式桌面读取同一项目；不得重启用户当前运行中的应用或服务器，按仓库规则使用独立验证入口。
5. 创建干净项目，用一句话从 World 自动继续至 Story 与 Cover；任何人工修复都必须记录，不能标为无人介入首跑。
6. 运行 `git diff --check`、相关包 typecheck/构建和冻结后的定向测试；审查暂存范围后按语义提交。

## 停止条件

- Story 需要修改或接管未完成的异会话 World。
- 叶子能够注册结构、派生 Agent、提交正式文件或修改上游。
- 小说章节可以在前一章未提交时开始。
- 图片使用 Fixture、SVG、静态占位或本地模板冒充真实 Cover。
- Provider 缺失却生成确定性替代内容。
- 正式界面显示的完成状态与磁盘账本不一致。
