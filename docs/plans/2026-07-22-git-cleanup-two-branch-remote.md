# NovelX OpenCode 工作树清理、双分支与远端提交计划

> 状态：Accepted（已批准）。公开远端与双分支职责均已确认。

## 当前证据

- 实际承载当前改动的仓库是 `D:\CodexW\NovelX_Desktop\work\opencode-novelx`，当前分支为 `novelx-ui`，基线为 OpenCode `v1.18.3`，其上已有 41 个 NovelX 提交。
- `D:\CodexW\NovelX_Desktop\work\worktree` 位于另一套旧 NovelX 仓库，`codex/hackathon-10day` 工作树干净并与其远端同步；它与 `codex/long-term-main` 已分别分叉 138/79 个提交，不纳入本批合并。
- OpenCode 改版仓库当前有 17 个真实 tracked（已跟踪）文件差异、28 个 untracked（未跟踪）文件和 3 个内容 Blob 与 `HEAD` 相同的假修改。
- 执行前的 `origin` 指向 `https://github.com/anomalyco/opencode.git`，且只抓取 `v1.18.3` 标签；执行中已将它改名为 `upstream`，禁止推送 NovelX 分支。
- GitHub 账号 `ccbili30-collab` 当前没有 OpenCode fork（派生仓库）。现有私有仓库 `ccbili30-collab/novex` 有独立历史，不得覆盖。
- 已创建空的公开仓库 `https://github.com/ccbili30-collab/open-novelx`，作为本批唯一目标远端。
- Story 正文已经有真实文本完成证据；生图代码和测试纳入提交，但本批不把上游 Provider（模型服务）失败描述成图片 Live（真实运行）通过。

## 目标与边界

### 当前目标

1. 在不丢失任何现有改动的前提下，将 dirty 工作树整理成可审计的语义提交。
2. 建立一个共同稳定点，并从该点准备两条后续开发分支和两个独立 worktree（工作树）。
3. 将共同稳定点、两条分支和恢复标签推送到用户所有的远端。
4. 最终保证所有受管工作树干净，未提交的本地启动脚本有明确归属。

### 明确不做

- 不合并旧 NovelX `codex/hackathon-10day` 与 `codex/long-term-main`。
- 不把 OpenCode 改版强行并入旧 `ccbili30-collab/novelx` 仓库。
- 不在清理批次升级 OpenCode 上游版本或处理大规模 rebase（变基）。
- 不继续修复生图 Provider；只保留代码、测试和诚实的未 Live 边界。
- 不使用 `git reset --hard`、`git clean -fd` 或覆盖未跟踪文件。

## 推荐分支图

```text
OpenCode v1.18.3
  └─ 41 个既有 NovelX 提交
      └─ 本批 6 个语义提交
          ├─ tag: novelx-story-growth-checkpoint-20260722
          ├─ codex/novelx-content-growth
          └─ codex/novelx-visual-runtime
```

- `codex/novelx-content-growth`：继续世界、故事、角色等文字与 Growth 编排，不在该分支主动修生图上游问题。
- `codex/novelx-visual-runtime`：继续地图、风貌、封面、个体图和 Provider 传输。
- 两条分支从完全相同的已验证提交起步；当前 `novelx-ui` 在确认后重命名为内容分支，避免再保留含义模糊的第三条开发线。

## 执行步骤

### 1. 冻结现状并确认无秘密

- 记录 `HEAD`、`git status --porcelain=v2`、真实 diff 文件清单和未跟踪文件清单。
- 只对当前 dirty 文件运行秘密扫描；禁止把 API Key、认证信息、运行数据库、日志或实际世界项目数据加入 Git。
- 保存清理前清单到本计划的执行记录；不通过删除来制造干净状态。

### 2. 处理 Git 元数据噪音

- 先再次运行 `git worktree prune --dry-run --verbose`，确认只涉及已经不存在的 `cosmic-cabin` 与 `lucky-planet` worktree 元数据，再执行 `git worktree prune`。
- 保留两个同名分支引用，不删除其唯一提交；清理范围只限失效 worktree 注册。
- 对以下 3 个 Blob 与索引完全相同的假修改只刷新索引，不提交换行变化：
  - `packages/opencode/src/cli/cmd/run.ts`
  - `packages/opencode/src/cli/cmd/run/session.shared.ts`
  - `packages/opencode/test/cli/run/session.shared.test.ts`
- 禁止为消除 LF/CRLF 警告做全仓换行重写。

### 3. 按依赖顺序形成 6 个语义提交

#### Commit 1：Story 权威合同与物化状态机

`feat(story): define story materialization and cover contracts`

- `packages/schema/src/novelx-story.ts`
- `packages/schema/src/novelx-story-visual.ts`
- `packages/opencode/src/novelx/story-materialization.ts`
- `packages/opencode/src/novelx/story-visual.ts`
- 对应 Story materialization/visual 测试与最小 fixture（测试夹具）。

#### Commit 2：Electron/Node 图片传输能力

`fix(images): support image transport in electron node runtime`

- `packages/opencode/src/novelx/world-image-queue.ts`
- `packages/opencode/test/novelx/world-image-queue.test.ts`

此提交包括可复用请求/校验、原生 HTTP/HTTPS、重定向、超时、长度验证与图片 URL 回取。提交说明必须注明尚无新的真实图片 Live 验收。

#### Commit 3：World → Story → Cover 单向 Growth 编排

`feat(growth): orchestrate one-way world to story to covers`

- Story Editor、Story Writer、Visual Editor 的 Agent 与 Prompt。
- Story Runtime、Cover Runtime、Growth 路由及所有 Story 工具。
- `registry.ts`、`task.ts` 的权限和分发门禁。
- Agent、Registry、Task 对应测试。

该组同时约束正文与封面权限、路由和恢复，不能强拆成中间不可编译或权限不一致的提交。

#### Commit 4：安全项目文件可见性规则

`feat(app): define safe project file visibility`

- `novelx-project-files.ts` 与测试。
- 文件面板的调用点与递归展开留在 Commit 5，避免对同一 TSX 文件做脆弱的交互式拆分。

#### Commit 5：Story 页面与导航

`feat(app): add story workspace and revised navigation`

- NovelX 窗口标题、Story/人物入口顺序。
- Story Controller、世界图册根节点、Story 树和正文/历史/文献/封面投影。
- 安全项目文件规则在正式文件面板中的接入与递归展开。
- 对应页面 TSX、CSS、workspace/world-growth 文件和现有测试。

#### Commit 6：架构决策与当前边界

`docs(story): record architecture and current live boundary`

- `docs/adr/0001-story-growth-is-one-way.md`
- `docs/plans/2026-07-21-novelx-story-growth-and-covers.md`
- `docs/status/2026-07-22-novelx-story-visual-orchestration-reset.md`
- 本计划及最终执行记录。

每次暂存都使用明确路径；`novelx-resource-workspace.tsx` 使用交互式 hunk staging。禁止 `git add -A`。

### 4. 单独处置本地 WebUI 启动脚本

`Start-NovelX-WebUI.ps1` 不混入产品提交。它当前会监听 `0.0.0.0`，并把 Basic Auth 派生 token 放入浏览器 URL。

推荐本批保留文件原位，仅加入本地 `.git/info/exclude`，使工作树干净但不删除用户可用脚本。若后续需要远端复现，再单开安全化任务，改为本机绑定默认值和显式 LAN 开关后独立提交。

### 5. 集中验收

代码冻结后执行一次集中验证，避免重复全量测试：

1. `packages/schema`: `bun typecheck`
2. `packages/opencode`: Story、Story Visual、World Image Queue、Agent、Registry、Task 定向测试
3. `packages/opencode`: `bun typecheck`
4. `packages/app`: 项目文件与 World Growth 定向单元测试、`bun typecheck`、`bun run build`
5. `packages/desktop`: `bun typecheck`、`bun run build`
6. 仓库根：`git diff --check`、暂存内容复核、秘密扫描、`git status`

验收报告区分：

- Story 文本已有真实 Provider 产物证据。
- 图片代码与自动测试通过不等于图片 Live；上游失败作为外部阻塞记录。
- 本批不是 OpenCode 上游升级验收，也不是整个 NovelX 产品全量验收。

### 6. 建立共同稳定点和两个 worktree

- 六个提交全部通过后创建 annotated tag（附注标签）：`novelx-story-growth-checkpoint-20260722`。
- 将当前分支重命名为 `codex/novelx-content-growth`。
- 从同一提交创建 `codex/novelx-visual-runtime`。
- 当前目录保留内容分支；在相邻目录创建视觉分支 worktree，两个目录不得由 Agent 同时修改同一文件。

### 7. 远端保护与推送

- 将现有官方 `origin` 重命名为 `upstream`，保留其标签抓取规则。
- 将用户所有的公开仓库 `https://github.com/ccbili30-collab/open-novelx.git` 添加为新的 `origin`。
- 首先推送恢复标签，再分别 `push -u` 两条 `codex/` 分支。
- 推送后从远端回读两个分支和标签 SHA，必须与本地完全一致。

该远端是新的独立公开仓库，不是 GitHub fork。推送前必须先从 `upstream` 补全当前浅克隆缺失的 `v1.18.3` 祖先历史，否则空远端可能拒绝不完整对象链。首次 fetch/push 会比普通增量推送更大。

不得使用或覆盖已有 `ccbili30-collab/novex`，除非用户明确作出仓库迁移决定。

## 验收标准

- 6 个提交均能单独说明边界，最终构建和定向测试通过。
- 代码、文档、测试和 Live 状态陈述一致。
- 当前内容工作树和新视觉工作树都没有未解释的 tracked/untracked 变化。
- 两条远端分支和恢复标签存在，SHA 与本地一致。
- 官方上游只作为 `upstream`，用户远端才是 `origin`。
- 没有秘密、运行数据库、日志、世界项目数据或构建产物进入提交。

## 停止条件

遇到以下任一情况立即停止，不通过兼容垫片或强推绕过：

- 语义提交无法保持编译或测试绿色。
- 发现当前改动包含未知来源的用户文件或秘密。
- 远端仓库与本地历史不兼容，或目标可见性未确认。
- 需要强推、覆盖已有远端分支或改写 41 个既有 NovelX 提交。
- 两条分支职责被用户改为其他产品路线。

## 推送前执行记录

### 已形成的代码提交

- `444f03d` `feat(story): define story materialization and cover contracts`
- `6cf09a0` `fix(images): support image transport in electron node runtime`
- `527a1ca` `feat(growth): orchestrate one-way world to story to covers`
- `2944884` `feat(app): define safe project file visibility`
- `34ce3c5` `feat(app): add story workspace and revised navigation`

### 验收证据

- Story Materialization 与 Story Visual：7 项测试通过。
- World Image Queue：3 项测试通过。
- Agent、Tool Registry 与 Task：97 项测试通过。
- 项目文件可见性：1 项测试通过。
- World Growth 投影：4 项测试通过。
- 合计：112 项定向测试通过，0 失败。
- `packages/schema`、`packages/opencode`、`packages/app`、`packages/desktop` 类型检查通过。
- App 与 Desktop 生产构建通过；构建仍报告上游已有的动态/静态导入、chunk 大小和 `eval` 警告，但未导致构建失败。
- `git diff --check` 通过；dirty 文件秘密扫描未发现用户 API Key。
- 本批未重新调用真实 Provider。既有 Story 文本 Live 证据保留；图片传输通过自动测试，但真实图片仍受上游失败阻塞，不标记为 Live。

### Git 与远端

- 两个失效临时 worktree 注册已清理，分支引用保留。
- 本地 WebUI 启动脚本保留原位并通过 `.git/info/exclude` 本地排除，未删除、未提交。
- 仓库已从浅克隆补全为完整历史，`v1.18.3` 的父提交可读取。
- 官方 OpenCode 远端为 `upstream`；公开空仓库 `https://github.com/ccbili30-collab/open-novelx.git` 为 `origin`。
- 推送对象固定为恢复标签、`codex/novelx-content-growth` 与 `codex/novelx-visual-runtime`，禁止推送所有上游标签。
