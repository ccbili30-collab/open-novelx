# 世界包展览与导出 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 NovelX 工作台提供一个沉浸式世界包展览视图，并将同一份公开数据导出为可离线打开的 `.zib` 世界包。

**Architecture:** 以现有 NovelX 结构化投影为唯一数据源，新增一个纯展示层 ViewModel，把封面、世界概览、地图/泰森网格、出版文本、故事、角色和图谱转换为公开展览数据。工作台和导出器共享同一份序列化数据与静态 HTML 模板；导出包不携带 Prompt、Agent、工具调用、会话内部消息或凭据。`.zib` 使用标准 ZIP 容器，内部包含自包含 `index.html`、`data/world.json` 与可选 `assets/`。

**Tech Stack:** SolidJS、TypeScript、现有 NovelX Context/Graph 投影、浏览器 Blob/下载 API、标准 ZIP store 编码（无压缩，避免引入运行时依赖）。

---

### Task 1: 定义公开世界包合同与投影

**Files:**
- Create: `packages/app/src/novelx/world-package.ts`
- Test: `packages/app/src/novelx/world-package.test.ts`

**Steps:**
1. 写失败测试：从世界、出版物、故事、角色、泰森网格和图谱投影生成公开数据；断言内部 Prompt/工具/会话字段不会出现。
2. 运行定向测试确认失败。
3. 实现版本化 `NovelXWorldPackage` 合同、固定展览章节顺序、缺失内容的 `pending` 状态和安全文本截断。
4. 运行测试确认通过。
5. 提交 `feat: define public world package projection`。

### Task 2: 实现工作台沉浸式展览

**Files:**
- Create: `packages/app/src/pages/session/novelx-world-package-view.tsx`
- Create: `packages/app/src/pages/session/novelx-world-package.css`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Test: `packages/app/src/pages/session/novelx-world-package-view.test.tsx`

**Steps:**
1. 写失败测试：章节导航、封面进入、地图区域选择/放大、缺失内容占位和键盘返回行为。
2. 运行定向测试确认失败。
3. 实现固定顺序的展览视图：星空背景、封面、总览、地图、出版文本、故事、角色、图谱；使用 CSS/`requestAnimationFrame` 做低频漂浮、镜头推进和节点动画，并支持 `prefers-reduced-motion`。
4. 将现有真实 graph、地图网格和文档打开回调接入，不复制另一套事实数据。
5. 运行定向测试和类型检查。
6. 提交 `feat: add world package exhibition view`。

### Task 3: 实现独立静态 HTML 导出器

**Files:**
- Create: `packages/app/src/novelx/world-package-export.ts`
- Test: `packages/app/src/novelx/world-package-export.test.ts`
- Modify: `packages/app/src/pages/session/novelx-world-package-view.tsx`

**Steps:**
1. 写失败测试：生成自包含 HTML、固定资源路径、数据 JSON 转义和 `.zib` 文件名。
2. 运行定向测试确认失败。
3. 实现单文件 HTML 模板和无压缩 ZIP store 编码，生成 `index.html`、`data/world.json`、`README.txt`。
4. 通过浏览器下载触发保存，不写入项目目录、不覆盖用户文件。
5. 运行测试并在浏览器中打开导出 HTML 验证。
6. 提交 `feat: export world package as portable zib`。

### Task 4: 接入工作台入口与文案

**Files:**
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/i18n/zh.ts`
- Modify: `packages/app/src/i18n/en.ts`
- Test: `packages/app/e2e/regression/novelx-world-package.spec.ts`

**Steps:**
1. 写 E2E：进入“世界包”资源、打开展览、点击导出并确认下载文件扩展名。
2. 运行 E2E 确认失败。
3. 接入入口、导出按钮、状态提示和中文/英文文案。
4. 运行 E2E、类型检查和相关单元测试。
5. 提交 `feat: expose world package export from workspace`。

### Task 5: 文档与验收

**Files:**
- Create: `docs/status/2026-07-23-world-package-exhibition.md`

**Steps:**
1. 记录真实实现范围、导出内容、未包含的内部数据和验证命令。
2. 运行 app 定向测试、E2E、typecheck 和生产构建。
3. 手工验证 `.zib` 是标准 ZIP，可解压并直接打开 `index.html`。
4. 提交 `docs: record world package exhibition acceptance`。

