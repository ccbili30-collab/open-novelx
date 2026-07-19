# NovelX Growth 自动骨架注册实施计划

> 执行依据：`docs/plans/2026-07-19-novelx-growth-skeleton-design.md`

## 当前目标

实现 OpenCode 内核上的真实 `/growth` 首阶段闭环：Provider（模型服务）输出受限规格，专用工具注册单一权威清单，六个 NovelX 工作面读取并展示待填充骨架。

允许修改：`packages/schema`、`packages/opencode`、`packages/app` 中与该闭环直接相关的新模块、注册点、测试、中文/英文文案和状态文档。

明确不做：正文填充、多 Agent 调度、图片生成、旧 Runtime 接线、骨架修订和公开 HTTP 协议扩展。

## Task 1：共享合同与确定性编译器

文件：

- Create: `packages/schema/src/novelx-growth.ts`
- Modify: `packages/schema/src/index.ts`
- Create: `packages/opencode/src/novelx/growth-skeleton.ts`
- Create: `packages/opencode/test/novelx/growth-skeleton.test.ts`

实现：

- 定义模型输入规格和持久 Manifest 的不同 Schema。
- 实现标签、数量、总规模、同级唯一和无环校验。
- 由 Harness 生成 ID、标准章节名、文件规划和世界包规划。
- 对相同输入生成确定性结果与内容哈希。

验收：

```powershell
Set-Location packages\opencode
bun test test\novelx\growth-skeleton.test.ts
Set-Location ..\schema
bun typecheck
```

## Task 2：幂等注册工具

文件：

- Create: `packages/opencode/src/tool/novelx-growth-skeleton.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Create: `packages/opencode/test/tool/novelx-growth-skeleton.test.ts`
- Modify: `packages/opencode/test/tool/registry.test.ts`

实现：

- 新增唯一终态工具 `novelx_register_growth_skeleton`。
- 工具只写 `.novelx/growth/skeleton.json`。
- 首次创建、完全相同重放、不同规格冲突和损坏既有清单均有明确结果。
- 发布文件更新事件，确保 UI 可刷新。

验收：

```powershell
Set-Location packages\opencode
bun test test\tool\novelx-growth-skeleton.test.ts test\tool\registry.test.ts
```

## Task 3：内置 Growth Agent 与 `/growth`

文件：

- Create: `packages/opencode/src/agent/prompt/novelx-growth-skeleton.txt`
- Create: `packages/opencode/src/command/template/novelx-growth.txt`
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/command/index.ts`
- Create: `packages/opencode/test/command/novelx-growth.test.ts`

实现：

- 注册隐藏的专用 Growth Agent。
- 权限只允许必要读取和 `novelx_register_growth_skeleton`。
- 注册 `/growth`，绑定 Growth Agent，并把用户参数作为明确目标传入。
- Prompt 要求内部自询，不输出思维链，只显示最终规格摘要并唯一调用注册工具。

验收：

```powershell
Set-Location packages\opencode
bun test test\command\novelx-growth.test.ts test\tool\registry.test.ts
bun typecheck
```

## Task 4：六工作面投影

文件：

- Create: `packages/app/src/context/novelx-growth-skeleton.ts`
- Create: `packages/app/src/context/novelx-growth-skeleton.test.ts`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Modify: relevant locale files under `packages/app/src/i18n`
- Modify: `packages/app/e2e/regression/novelx-workspace.spec.ts`

实现：

- 使用现有 `/file/edit` 读取隐藏清单，不新增公共协议。
- 监听清单文件更新并刷新。
- 六页分别显示待创建、待填充、空图谱视图、标准空章节和世界包规划。
- 清单缺失、损坏和未知版本使用不同空/错状态。
- 选中计划槽位只显示规划信息，不打开不存在的真实文件。

验收：

```powershell
Set-Location packages\app
bun test --preload .\happydom.ts .\src\context\novelx-growth-skeleton.test.ts
bun typecheck
bun typecheck:e2e
bunx playwright test e2e\regression\novelx-workspace.spec.ts --project=chromium --workers=1
```

## Task 5：冻结验收与留档

执行：

```powershell
Set-Location packages\schema
bun typecheck
Set-Location ..\opencode
bun typecheck
Set-Location ..\app
bun typecheck
bun typecheck:e2e
bun run build
Set-Location ..\desktop
bun typecheck
bun run build
```

然后：

- 用真实 Provider 在临时项目执行一次 `/growth`。
- 验证清单、六页投影、重开持久性和无模板降级。
- 若无真实 Provider 配置，停止在明确的 Live 缺口，不用 Fixture 替代。
- 覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`。
- 新增 `docs/status/2026-07-19-novelx-growth-skeleton-batch.md`。
- 只暂存当前任务文件，检查后提交。
