# NovelX 世界 UI 与地形注册实施计划

> **For Codex:** 按任务顺序串行实施；UI 截图冻结前不得进入地形注册。

**Goal:** 以 `02-world-variant.png` 为视觉合同重构 NovelX 世界工作面，并把 `/growth` 第一阶段改为真实 Provider 规划和注册一个主大陆及周边海域的具名语义地形。

**Architecture:** SolidJS Renderer 只投影真实会话、项目文件和 `.novelx/growth/skeleton.json` 中经过完整性校验的注册结果。模型决定具名地形、空间关系和简要地貌事实；Harness 生成 ID、路径、哈希并原子写入单一清单。缺少 Provider、非法结果或损坏清单均失败关闭。

**Tech Stack:** SolidJS、TypeScript、Effect Schema、Bun、Playwright、OpenCode Session/Agent/Tool。

---

## 当前边界

- 只实现世界工作面的视觉复刻与地形注册。
- 地形范围固定为一个主大陆及周边海域；不注册国家、文明、组织、角色、图谱事实、故事或图片。
- 不修改 OpenCode 公共 HTTP、数据库 Schema、Session V2 或旧 NovelX Runtime。
- 不把参考图文字和地图写入生产状态；E2E 可使用明确的地形 Fixture 验证布局。
- 旧 `schemaVersion: 1` 空骨架只作为历史数据读取边界，不得继续作为新 `/growth` 的成功结果。

## Task 1：冻结世界工作面视觉规格

**Files:**

- Modify: `docs/design/2026-07-19-novelx-workspace-visual-spec.md`
- Test: `docs/design/references/2026-07-19-six-surface-concepts/02-world-variant.png`

**Steps:**

1. 记录 `1672 × 941` 的 `55/60/351/223/666/304/68px` 主要几何。
2. 记录参考内容为视觉样例，不得进入生产状态。
3. 保存第一轮当前页面截图，作为叠图比较基线。

## Task 2：重构世界工作面

**Files:**

- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Modify: `packages/app/src/components/titlebar.css`
- Modify: `packages/desktop/src/main/windows.ts`
- Test: `packages/app/e2e/regression/novelx-workspace.spec.ts`

**Steps:**

1. 先把 E2E 几何与世界页语义断言改为新视觉合同并验证失败。
2. 将顶栏、项目栏、紧凑会话、世界导航、主 Atlas、地点详情和六图标栏改成参考结构。
3. 世界页只渲染真实地形清单；无数据时显示诚实空态。
4. 保留折叠、同图标返回、草稿、文件编辑和检查器恢复语义。
5. 在 `1672 × 941` 捕获候选截图并完成至少两轮坐标/叠图校正。
6. 运行：
   - `packages/app: bun run typecheck`
   - `packages/app: bun run typecheck:e2e`
   - `packages/app: bunx playwright test e2e/regression/novelx-workspace.spec.ts --project=chromium --workers=1`
   - `packages/app: bun run build`
   - `packages/desktop: bun run typecheck`
   - `packages/desktop: bun run build`

## Task 3：定义具名地形注册合同

**Files:**

- Modify: `packages/schema/src/novelx-growth.ts`
- Modify: `packages/opencode/src/agent/prompt/novelx-growth-skeleton.txt`
- Modify: `packages/opencode/src/command/template/novelx-growth.txt`
- Test: `packages/opencode/test/novelx/growth-skeleton.test.ts`

**Steps:**

1. 先增加失败测试：拒绝 `地形01`、`待填充`、空摘要、无效父子索引、越界坐标和断裂关系。
2. 新输入要求模型提交世界名、设计摘要、具名地形节点、类型、父子关系、相对坐标、地貌摘要、形成/空间作用和节点关系。
3. 模型不能提交 ID、文件路径、哈希、完成声明或其他题材对象。
4. Harness 验证一个主大陆、周边水域、有限无环层级、名称唯一性和连通性。

## Task 4：编译、持久化和投影地形

**Files:**

- Modify: `packages/opencode/src/novelx/growth-skeleton.ts`
- Modify: `packages/opencode/src/tool/novelx-growth-skeleton.ts`
- Modify: `packages/app/src/context/novelx-growth-skeleton.ts`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Test: `packages/opencode/test/tool/novelx-growth-skeleton.test.ts`
- Test: `packages/app/src/context/novelx-growth-skeleton.test.ts`
- Test: `packages/app/e2e/regression/novelx-workspace.spec.ts`

**Steps:**

1. 编译稳定 ID、Windows 安全路径、树顺序、关系端点和整体哈希。
2. 继续使用独占首次写入、同规格重放幂等、不同规格冲突和损坏清单失败关闭。
3. 世界导航显示真实名称；Atlas 按注册坐标投影；详情显示真实摘要和关系。
4. 不创建大量空文件，不把内部 JSON 暴露到默认文件页。
5. 运行 Schema、OpenCode、App 的定向测试和类型检查。

## Task 5：Live、桌面预览与提交

**Files:**

- Update: `docs/status/2026-07-19-novelx-growth-skeleton-batch.md`
- Create: `docs/status/2026-07-19-novelx-terrain-registration-batch.md`

**Steps:**

1. 在全新项目中使用真实 Provider 执行 `/growth`，只输入经典中土式大陆幻想目标。
2. 验证只发生一次注册工具终态；清单包含具名地形且没有编号空槽。
3. 重开正式 Electron，检查世界树、Atlas 和详情来自同一清单。
4. 验证不存在 Provider 时文件数为零，损坏清单显示错误。
5. 覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`。
6. 审查暂存文件，按“UI 复刻”和“地形注册”两个语义提交；记录哈希和未完成边界。

## 停止条件

- 必须修改公共 HTTP、数据库 Schema 或 Session V2 才能继续。
- 无法在不破坏旧清单的情况下引入新注册语义，需要用户决定迁移策略。
- 真实 Provider 配置不可用，无法完成 Live；此时保留确定性证据但不得宣称真实注册完成。
- 截图主要边界与参考图仍有超过约 `2%` 的结构误差。
