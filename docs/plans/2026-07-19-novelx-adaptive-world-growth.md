# NovelX Adaptive World Growth Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 让 `/growth` 先由模型注册题材自适应世界蓝图，再逐层注册并物化全部世界档案，在正式 NovelX 桌面闭合整个“世界”工作面；本批不生成图片。

**Architecture:** 新增独立 `NovelXWorld` 共享合同与两份内部权威清单，保留旧地理批次作为兼容读取路径。Growth 主编只能使用蓝图、阶段注册、世界档案准备/提交/停止/完成工具和固定 `novelx-world-writer` 子 Agent；Renderer（渲染器）只投影真实清单、真实子会话文本和正式文件。

**Tech Stack:** TypeScript、Effect Schema、OpenCode Session/Task/Tool、SolidJS、Bun、Playwright、Electron。

---

## Task 1：共享合同与世界蓝图编译器

**Files:**

- Create: `packages/schema/src/novelx-world.ts`
- Modify: `packages/schema/src/index.ts`
- Create: `packages/opencode/src/novelx/world-blueprint.ts`
- Test: `packages/opencode/test/novelx/world-blueprint.test.ts`

**Steps:**

1. 写失败测试覆盖自由层名、任意题材、前向依赖、规模上限、编号占位拒绝、幂等哈希和 Harness 稳定 ID。
2. 定义模型 `BlueprintProfile` 与持久 `BlueprintManifest`，不包含固定题材层枚举。
3. 编译并验证 `.novelx/growth/world-blueprint.json`，保留完整性哈希和来源身份。
4. 运行定向测试与 `packages/schema: bun typecheck`。

## Task 2：分层实体注册与通用物化状态机

**Files:**

- Create: `packages/opencode/src/novelx/world-materialization.ts`
- Test: `packages/opencode/test/novelx/world-materialization.test.ts`

**Steps:**

1. 写失败测试覆盖准备层、依赖层门禁、具体实体注册、同层关系、正式路径、租约、提交、停止、幂等和提前完成失败。
2. 实现 `prepareWorldStage`、`registerWorldStage`、`prepareWorldDocument`、`commitWorldDocument`、`abortWorldDocument` 与 `finishWorld`。
3. Context Pack 必须包含蓝图层合同、当前实体、同层关系和依赖实体的已提交注册事实。
4. 草稿校验使用固定 `事实依据`、`因果推演` 加蓝图层自定义章节，不允许占位内容。

## Task 3：Growth 主编与世界子 Agent 工具链

**Files:**

- Create: `packages/opencode/src/tool/novelx-world-runtime.ts`
- Create: `packages/opencode/src/tool/novelx-register-world-blueprint.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-world-stage.ts`
- Create: `packages/opencode/src/tool/novelx-register-world-stage.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-world-document.ts`
- Create: `packages/opencode/src/tool/novelx-commit-world-document.ts`
- Create: `packages/opencode/src/tool/novelx-abort-world-document.ts`
- Create: `packages/opencode/src/tool/novelx-finish-world.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-world-growth.txt`
- Create: `packages/opencode/src/agent/prompt/novelx-world-writer.txt`
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/tool/task.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Modify: `packages/opencode/src/novelx/growth-loop.ts`
- Test: `packages/opencode/test/tool/novelx-world-growth.test.ts`
- Modify: `packages/opencode/test/command/novelx-growth.test.ts`
- Modify: `packages/opencode/test/novelx/growth-loop.test.ts`

**Steps:**

1. 先写权限、真实子会话绑定、同 Call ID 重放、提前完成和错误子会话拒绝测试。
2. 注册新工具并把 Growth 权限收紧到新链路；旧地理工具保留注册但不再授予新 Growth 流程。
3. 新增只读叶节点 `novelx-world-writer`，扩展 Task 的所有权、重复调用和 Effect（副作用计算）幂等门禁。
4. 将 Growth 完成终态改为 `novelx_finish_world`。
5. 运行 OpenCode 定向测试与类型检查。

## Task 4：动态世界桌面投影

**Files:**

- Create: `packages/app/src/context/novelx-world-growth.ts`
- Create: `packages/app/src/context/novelx-world-growth.test.ts`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Modify: `packages/app/e2e/regression/novelx-workspace.spec.ts`

**Steps:**

1. UI 校验并监听世界蓝图与物化清单；新合同存在时优先投影，旧地理 Live 继续沿现有路径显示。
2. 左侧动态显示蓝图层和已注册实体，不写死国家、种族、宗教或科技分类。
3. 点击运行实体显示绑定子会话真实文本和只读锁；点击 committed 实体打开正式 Markdown。
4. 右侧详情显示层用途、推演重点、注册事实、依赖、关系、Agent 和锁。
5. 世界首页保持地图/星图未生成的诚实空状态，并显示世界总进度。
6. 运行投影单测、App 类型检查和定向 Playwright。

## Task 5：真实科技世界验收、留档与提交

**Files:**

- Create: `docs/status/2026-07-19-novelx-adaptive-world-growth-batch.md`
- Overwrite preview: `C:\Users\16014\Desktop\NovelX-正式预览.png`

**Steps:**

1. 在全新目录用真实 Provider 执行科技题材 `/growth`，让模型自行选择层面与数量，完成其注册的全部世界档案。
2. 核对每层、每实体、每子会话、正式文件、提交哈希和依赖；证明没有固定品类模板与图片副作用。
3. 使用生产构建启动正式 Electron 打开同一 Live，视觉检查动态层、流式/锁状态或其留存证据、正式档案和世界完成状态。
4. 运行 Schema/OpenCode/App/Desktop 的定向测试、类型检查和生产构建；没有运行的全量或发布测试必须明确记录。
5. 使用 `zhongyan` 完成声明核查，更新状态文档，审查暂存内容，按语义提交并保持工作树干净。
