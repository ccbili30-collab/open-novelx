# NovelX 地理内容生长实施计划

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 在现有 `/growth` 地形注册之后，由世界主编通过 OpenCode 原生子会话逐项派发地理写作任务，审核后提交每个地理对象的真实详细文档，并在正式桌面展示项目树生长、子 Agent 流式草稿、文件锁与完成进度；地图保持空白且明确未生成。

**Architecture:** `.novelx/growth/skeleton.json` 继续只保存已注册地形事实；新增独立的地理物化状态文件保存目标路径、租约、子会话、草稿与主编审核/提交状态。Growth 主编只能注册、准备地理任务、调用固定的地理子 Agent、提交/中止草稿和结束地理阶段；地理子 Agent 只能读取已提交事实并返回一个地理文档，不能写正式文件、派生 Agent 或进入国家阶段。Renderer 只投影真实状态文件、真实子会话消息流和已提交文档。

**Tech Stack:** TypeScript、Effect Schema、OpenCode Session/Task/Tool、SolidJS、Bun、Playwright、Electron。

---

## 当前边界

- 唯一仓库为 `D:\CodexW\NovelX_Desktop\work\opencode-novelx`；不接入旧 NovelX Runtime。
- 只处理一个主大陆及周边海域的地理文档；不注册或生成国家、文明、种族、组织、角色、故事和图片。
- 地图保持诚实空状态，不再从注册坐标画示意大陆，也不生成图片。
- 子 Agent 是执行叶节点，只向主编返回；子 Agent 之间没有派发或直接依赖边。
- 主编审核通过前，流式内容只是草稿，目标正式文件保持未创建或保持上一版本。
- 用户停止某一任务后，只暂停该文件和未派发的依赖路线；其他完全独立的执行叶继续。
- 不修改公共 HTTP 路径、数据库 Schema、Session V2 或 Provider 协议。

## Task 1：冻结地理物化合同

**Files:**

- Modify: `packages/schema/src/novelx-growth.ts`
- Create: `packages/opencode/src/novelx/geography-materialization.ts`
- Test: `packages/opencode/test/novelx/geography-materialization.test.ts`
- Modify: `docs/design/2026-07-19-novelx-workspace-ui-contract.md`

**Steps:**

1. 先写失败测试，覆盖确定性目标路径、父级/相邻/水系上下文、状态迁移、同一地形租约幂等、跨会话抢占拒绝和损坏状态失败关闭。
2. 定义独立 `GeographyMaterialization` 合同，记录 skeleton 哈希、Growth 主会话、地形记录、目标路径、状态、租约、子会话、草稿引用和提交哈希。
3. 状态只允许 `registered -> leased -> drafting -> submitted -> reviewing -> committed`；失败、取消和等待用户是显式分支，不能冒充 committed。
4. 将已确认的叶节点返回规则、主编审核锁和独立分支继续规则补入 UI 合同。

## Task 2：实现主编与地理子 Agent 工具链

**Files:**

- Create: `packages/opencode/src/tool/novelx-prepare-geography.ts`
- Create: `packages/opencode/src/tool/novelx-commit-geography.ts`
- Create: `packages/opencode/src/tool/novelx-abort-geography.ts`
- Create: `packages/opencode/src/tool/novelx-finish-geography.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Modify: `packages/opencode/src/agent/agent.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-geography-writer.txt`
- Modify: `packages/opencode/src/agent/prompt/novelx-growth-skeleton.txt`
- Modify: `packages/opencode/src/novelx/growth-loop.ts`
- Test: `packages/opencode/test/tool/novelx-geography-materialization.test.ts`
- Test: `packages/opencode/test/novelx/growth-loop.test.ts`
- Test: `packages/opencode/test/command/novelx-growth.test.ts`

**Steps:**

1. 写失败测试证明注册完成后 Growth 不能终止，且不能在注册前派发地理任务。
2. 新增不可被项目覆盖的隐藏 `novelx-geography` 子 Agent；仅允许读取必要项目事实，不允许 edit/write/apply_patch/task 或下游注册。
3. `novelx_prepare_geography` 从真实 skeleton 组装 Context Pack（上下文包）并取得目标文件租约。
4. 主编只允许调用 `task(subagent_type=novelx-geography)`；子 Agent 输出固定 Markdown，包含事实依据、推演结论、地貌细节、气候生态、资源通行、风险与关系。
5. `novelx_commit_geography` 只接受当前主编子会话的最终输出，校验名称、长度、必需章节、禁止占位内容和来源范围，再原子写入正式文档并释放锁。
6. `novelx_abort_geography` 保存子会话草稿引用并进入等待用户；`novelx_finish_geography` 仅在所有注册节点 committed 后成功。
7. Growth 完成门禁从“注册工具完成”改为“地理阶段完成工具成功”，避免再次停在骨架。

## Task 3：实现桌面实时投影

**Files:**

- Create: `packages/app/src/context/novelx-geography-materialization.ts`
- Modify: `packages/app/src/context/novelx-document.ts`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Test: `packages/app/src/context/novelx-geography-materialization.test.ts`
- Test: `packages/app/e2e/regression/novelx-workspace.spec.ts`

**Steps:**

1. UI 读取并校验真实物化状态，监听文件与子会话事件；不存在状态时保持“已注册、未开始”。
2. 世界标题显示真实进度；地形树投影注册、组装、推演、写作、待主编审核、返工、提交、用户介入和失败。
3. 点击运行中的地形时，中央文档面读取绑定子会话的真实文本增量；Provider 没有文本时只显示“正在等待模型”，不伪造内容。
4. 点击已提交地形时读取正式 Markdown；右侧显示负责 Agent、输入事实、推演摘要、锁和提交状态。
5. 目标文件处于 leased/drafting/submitted/reviewing 时，所有 NovelX 编辑入口只读；主编提交成功后才解锁。
6. Atlas 区改为“地图尚未生成”的空画布；注册坐标只保留为内部空间事实，不绘制假地图。
7. 覆盖加载、真实增量、提交、失败、停止、恢复、重复激活和切换页面保持状态的 E2E。

## Task 4：真实 Provider 与正式桌面验收

**Files:**

- Create: `docs/status/2026-07-19-novelx-geography-materialization-batch.md`

**Steps:**

1. 在全新目录使用真实 Provider 运行 `/growth`，要求注册最小而完整的经典大陆地形并完成全部地理档案。
2. 证明至少一个真实 `task` 子会话属于 `novelx-geography`，每个文档来自子会话输出并由主编提交。
3. 证明每个注册节点有一个非空正式 Markdown；没有国家、角色、故事、图片或地图资产。
4. 在运行中捕获一次锁定/流式状态，在完成后捕获世界进度和详细档案；覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`。
5. 运行 Schema/OpenCode/App/Desktop 定向测试、类型检查、生产构建和真实 Electron；没有全仓测试时明确标注。
6. 审查暂存差异并提交，记录分支、哈希、Live 目录、Provider、子会话和未完成边界。

## 停止条件

- OpenCode 原生 `task` 不能在不修改公共 Session/Provider 协议的情况下提供可绑定子会话。
- 必须用前端动画、Fixture 或本地模板替代真实 Provider 子会话才能继续。
- 目标文件无法在正式提交前保持稳定，或其他 Agent 可以绕过租约写入而没有明确限制。
- Provider 配置不可用，无法形成真实子 Agent 与正式文档证据。
- 需要进入国家、文明、角色、故事、图片或地图生成才能让本阶段通过。
