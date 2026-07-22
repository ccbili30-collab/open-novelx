# NovelX Project Graph Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让任何含有可读项目文档的 NovelX 项目在打开图谱或点击刷新后，都能生成可交互的球形关系图，同时继续优先使用正式 NovelX 注册状态。

**Architecture:** 保留现有正式世界/地理/故事投影作为第一权威来源；当正式投影没有节点时，由新的只读项目索引 Controller（控制器）递归读取用户可见文档，生成“项目—目录—文档—显式链接”的展示图。刷新协调器同时重载正式 Controller 和文件索引，但不调用 Provider（模型服务）、不写项目文件、不重置球面坐标；已有文件事件只在索引首次生成后触发防抖增量重建。

**Tech Stack:** TypeScript、SolidJS、OpenCode SDK `file.list` / `file.editable`、现有 SSE（服务器推送事件）、Bun Test、Playwright。

---

## 产品边界与不变量

- 正式 `NovelXWorld`、`NovelXGrowth`、`NovelXStory` 注册状态有节点时，继续作为唯一图谱事实来源。
- 普通项目回退图只表达文件结构和正文中的显式链接，不把目录邻近、共同词汇或模型猜测冒充因果关系。
- 回退索引只读取已经保存到文件系统的内容；未保存编辑、流式草稿、`.novelx`、`.opencode`、`.git`、`node_modules`、密钥文件和忽略文件均不得进入。
- 刷新不调用 Growth、不调用模型、不生成正文、不写 `.novelx` 索引文件。
- 刷新保留现有 `localStorage` 球面显示缓存；“重新布局”不属于本批。
- 进入“图谱”必须稳定显示图谱，不得被此前遗留的 `activeFile` 覆盖。点击原文卡片时明确切换到“文件”页面并打开实际文档。
- 扫描必须有上限并显式报告截断：最多 200 个目录、300 份文档、目录深度 12；不得无界遍历大型代码仓库。
- 第一批可索引扩展名限定为 `.md`、`.markdown`、`.txt`、`.rst`、`.adoc`，不把 JSON、源码或二进制文件默认展示为世界节点。

## 目标代码框架

```text
NovelXResourceWorkspace
├─ structuredGraph = projectNovelXGraph(...正式 Controller 状态)
├─ projectGraph = createNovelXProjectGraphController()
├─ visibleGraph = structuredGraph.nodes.length ? structuredGraph : projectGraph.graph
├─ refreshGraph()
│  ├─ Promise.all(正式 Controller.reload())
│  └─ 正式图仍为空时 projectGraph.reload()
└─ NovelXGraphView
   ├─ graph={visibleGraph}
   ├─ refreshing / source / warning
   ├─ onRefresh={refreshGraph}
   └─ onOpenSource={切到 files 后 select(path)}

createNovelXProjectGraphController
├─ listProjectDocuments()   // 有界 BFS 递归 file.list
├─ readProjectDocuments()   // 并发上限 6 的 file.editable
├─ projectNovelXFileGraph() // 纯函数：项目、目录、文档、显式链接
├─ reload()                 // 版本号取消旧请求，失败关闭
└─ event.listen()           // 首次 ready 后对相关文件事件防抖刷新
```

建议的稳定类型：

```ts
export type NovelXProjectGraphDocument = {
  path: string
  content: string
}

export type NovelXProjectGraphResult = {
  graph: NovelXGraph
  documentCount: number
  truncated: boolean
}

export type NovelXProjectGraphState =
  | { status: "idle" }
  | { status: "loading"; previous?: NovelXProjectGraphResult }
  | { status: "ready"; result: NovelXProjectGraphResult; refreshedAt: number }
  | { status: "error"; message: string; previous?: NovelXProjectGraphResult }
```

节点和关系 ID 必须稳定：

```ts
project:${normalize(projectName)}
directory:${normalize(path)}
document:${normalize(path)}
contains:${parentId}:${childId}
links:${sourceDocumentId}:${targetDocumentId}
```

### Task 1: 纯文件图投影模型

**Files:**

- Create: `packages/app/src/pages/session/novelx-project-graph-model.ts`
- Create: `packages/app/src/pages/session/novelx-project-graph-model.test.ts`
- Reuse: `packages/app/src/pages/session/novelx-graph-model.ts`

**Step 1: 写失败测试**

覆盖以下行为：

1. Frontmatter `title` 优先于一级标题，一级标题优先于文件名。
2. 摘要通过现有 `novelXGraphExcerpt` 清除 Markdown 并截断。
3. 有文档时生成一个项目根节点、必要的目录节点和文档节点。
4. `World/北境.md` 到 `World/王国.md` 的 Markdown 相对链接生成一条 `引用` 直线关系。
5. 断链不生成不存在端点；同一链接重复出现只生成一条边。
6. 文档节点保留真实 `sourcePath`，目录和项目节点没有伪造路径。

示例断言：

```ts
const result = projectNovelXFileGraph({
  projectName: "北境纪行",
  documents: [
    { path: "World/北境.md", content: "# 北境\n\n通往[河谷王国](./王国.md)。" },
    { path: "World/王国.md", content: "# 河谷王国\n\n沿河而建。" },
  ],
})

expect(result.graph.nodes.map((node) => node.id)).toContain("document:world/北境.md")
expect(result.graph.edges).toContainEqual(
  expect.objectContaining({
    source: "document:world/北境.md",
    target: "document:world/王国.md",
    label: "引用",
  }),
)
```

**Step 2: 运行失败测试**

Run from `packages/app`:

```powershell
bun test --preload ./happydom.ts ./src/pages/session/novelx-project-graph-model.test.ts
```

Expected: FAIL，因为投影函数尚不存在。

**Step 3: 实现最小纯函数**

- 使用 POSIX 风格 `/` 规范路径，Windows 输入先替换反斜杠。
- 只解析 Markdown 普通链接和 `[[Wiki Link]]`；第一批不做关键词相似度或语义推断。
- 相对链接使用来源文件父目录解析；移除 `#fragment` 和查询字符串。
- Wiki Link 只在文件名或标题唯一匹配时连接；歧义时失败关闭。
- 目录树只为包含合格文档的路径创建节点。

**Step 4: 运行测试并格式检查**

```powershell
bun test --preload ./happydom.ts ./src/pages/session/novelx-project-graph-model.test.ts
bunx prettier --check ./src/pages/session/novelx-project-graph-model.ts ./src/pages/session/novelx-project-graph-model.test.ts
```

Expected: PASS，且无格式差异。

**Step 5: 提交**

```powershell
git add packages/app/src/pages/session/novelx-project-graph-model.ts packages/app/src/pages/session/novelx-project-graph-model.test.ts
git commit -m "feat(novelx): project document graph"
```

### Task 2: 有界项目文件索引 Controller

**Files:**

- Create: `packages/app/src/context/novelx-project-graph.ts`
- Create: `packages/app/src/context/novelx-project-graph.test.ts`
- Reuse: `packages/app/src/context/novelx-project-files.ts`
- Reference: `packages/app/src/context/file.tsx`

**Step 1: 写失败测试**

使用最小假的 `DirectorySDK` 边界验证：

1. BFS（广度优先搜索）递归调用 `client.file.list`，跳过 `ignored` 和 `isNovelXHiddenProjectPath`。
2. 只读取允许的文本扩展名。
3. 文件读取并发不超过 6。
4. 达到目录、文档或深度上限时返回 `truncated: true`，不静默冒充完整图。
5. 第二次 `reload()` 会使第一次较慢请求失效，旧结果不得覆盖新结果。
6. 任一目录列表失败时进入 `error`，保留上一份可用结果但不标为刷新成功。

**Step 2: 运行失败测试**

```powershell
bun test --preload ./happydom.ts ./src/context/novelx-project-graph.test.ts
```

Expected: FAIL，因为 Controller 尚不存在。

**Step 3: 实现扫描与状态机**

Controller 对外只暴露：

```ts
return {
  state,
  reload: () => load(sdk()),
}
```

`reload()` 必须返回 `Promise<void>`，供刷新按钮准确控制忙碌状态。读取内容使用固定并发池，不使用无界 `Promise.all`。

**Step 4: 实现文件事件增量刷新**

- `status === "ready"` 之前不监听普通内容变化触发扫描，避免打开页面时重复构建。
- 首次生成后，只对允许扩展名、目录事件或删除/重命名事件安排 250ms 防抖重扫。
- 项目切换时增加版本号、清除定时器并回到 `idle`。
- 事件自动刷新保留上一份图，界面不闪回空白。

**Step 5: 运行测试**

```powershell
bun test --preload ./happydom.ts ./src/context/novelx-project-graph.test.ts
```

Expected: PASS，覆盖成功、上限、错误和过期请求路径。

**Step 6: 提交**

```powershell
git add packages/app/src/context/novelx-project-graph.ts packages/app/src/context/novelx-project-graph.test.ts
git commit -m "feat(novelx): index project documents for graph"
```

### Task 3: 统一刷新协调器与权威来源选择

**Files:**

- Modify: `packages/app/src/context/novelx-growth-skeleton.ts`
- Modify: `packages/app/src/context/novelx-geography-materialization.ts`
- Modify: `packages/app/src/context/novelx-world-growth.ts`
- Modify: `packages/app/src/context/novelx-story-growth.ts`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Test: `packages/app/src/pages/session/novelx-workspace-model.test.ts` 或新增 `packages/app/src/pages/session/novelx-graph-source.test.ts`

**Step 1: 写来源选择失败测试**

新增纯函数：

```ts
selectNovelXVisibleGraph({ structured, project })
```

断言：

- `structured.nodes.length > 0` 时永远返回正式图。
- 正式图为空且项目图 ready 时返回项目图。
- 两者都为空时返回空图，而不是伪造项目节点。

**Step 2: 让正式 Controller 的 `reload()` 返回 Promise**

把当前 `void load(sdk())` 改为 `load(sdk())`。调用方可以忽略 Promise，但刷新协调器可以等待全部正式状态重读结束；不改变公开服务器协议。

**Step 3: 在 Workspace 创建项目图 Controller**

```ts
const projectGraph = createNovelXProjectGraphController()
const structuredGraph = createMemo(() => projectNovelXGraph(...))
const visibleGraph = createMemo(() =>
  selectNovelXVisibleGraph({
    structured: structuredGraph(),
    project: projectGraph.state().status === "ready" ? projectGraph.state().result.graph : undefined,
  }),
)
```

**Step 4: 实现打开即生成与手动刷新**

- 图谱首次激活后等待正式 Growth Controller 离开 `loading`。
- 正式图为空且项目索引仍为 `idle` 时自动调用一次 `projectGraph.reload()`。
- 手动 `refreshGraph()` 先并行重载四个正式 Controller；完成后正式图仍为空，才重建项目文件图。
- 同时点击刷新时复用同一个 in-flight Promise，避免并发扫描。

**Step 5: 修正文件与图谱页面切换**

- `resource === "graph"` 时，图谱视图优先级必须高于全局 `document.state()`。
- `onOpenSource(path)` 先通过现有未保存文档门禁，再 `view.activateResource("files")`，最后 `select(path)`。
- 不通过清空全局文件状态来规避问题，避免丢失用户编辑位置。

**Step 6: 运行定向测试与类型检查**

```powershell
bun test --preload ./happydom.ts ./src/pages/session/novelx-graph-source.test.ts
bun typecheck
```

Expected: PASS。

**Step 7: 提交**

```powershell
git add packages/app/src/context/novelx-*.ts packages/app/src/pages/session/novelx-resource-workspace.tsx packages/app/src/pages/session/novelx-graph-source.test.ts
git commit -m "feat(novelx): coordinate graph refresh sources"
```

### Task 4: 刷新按钮、生成状态和错误反馈

**Files:**

- Modify: `packages/app/src/pages/session/novelx-graph-view.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Test: `packages/app/e2e/regression/novelx-project-graph.spec.ts`

**Step 1: 扩展视图合同**

```ts
export function NovelXGraphView(props: {
  graph: Accessor<NovelXGraph>
  storageKey: string
  refreshing: Accessor<boolean>
  source: Accessor<"structured" | "project" | "empty">
  warning: Accessor<string | undefined>
  onRefresh: () => Promise<void>
  readSource: (path: string) => Promise<string | undefined>
  onOpenSource: (path: string) => void
})
```

**Step 2: 在顶部工具栏加入刷新按钮**

- 放在节点/关系计数旁边，使用现有符号图标，不新增彩色按钮。
- `aria-label="刷新图谱"`，同时提供 `title`。
- 刷新期间禁用按钮，图标旋转，文案显示“正在生成图谱”或“正在刷新图谱”。
- 成功后不弹成功 Toast（提示气泡），只更新计数；失败使用现有错误 Toast 并保留旧图。
- `truncated` 时在工具栏显示“仅显示前 300 份文档”，不得伪装完整。

**Step 3: 保持球面布局**

刷新只替换 `graph` 数据；继续把旧 `layout` 传给 `evolveNovelXSphereLayout`。相同 ID 节点位置必须保持完全一致，新节点才增密。

**Step 4: 添加键盘和降动效验证**

- 刷新按钮可用 Tab 聚焦并通过 Enter/Space 激活。
- `prefers-reduced-motion` 下刷新图标不旋转，但忙碌状态仍有文字和 `aria-busy`。

**Step 5: 运行类型检查与 lint**

```powershell
bun typecheck
bunx oxlint ./src/pages/session/novelx-graph-view.tsx ./src/context/novelx-project-graph.ts ./src/pages/session/novelx-project-graph-model.ts
```

Expected: 0 error，新增文件 0 warning。

### Task 5: 普通项目真实浏览器闭环

**Files:**

- Create: `packages/app/e2e/regression/novelx-project-graph.spec.ts`
- Modify only if fixture support is missing: `packages/app/e2e/utils/mock-server.ts`

**Step 1: 建立没有 `.novelx` 状态的项目 Fixture**

项目只包含：

```text
README.md
World/
  北境.md
  河谷王国.md
```

`北境.md` 明确链接 `河谷王国.md`。所有 NovelX Growth manifest 请求返回 404。

**Step 2: 验证打开即生成**

- 点击右侧“图谱”。
- 等待 `aria-busy` 从 true 变为 false。
- 断言项目、World 目录、三份文档节点出现。
- 断言至少存在一条 `.novelx-neural-graph-edges line`。
- 断言页面没有内部 Prompt、工具名或 `.novelx` 路径。

**Step 3: 验证手动刷新和稳定布局**

- 记录 `document:world/北境.md` 的 SVG transform。
- Fixture 新增 `World/边境城.md` 并让 `file.list` 返回新文件。
- 点击“刷新图谱”。
- 断言节点数增加，北境节点 transform 不因刷新被重置。

**Step 4: 验证卡片跳转**

- 点击 `北境` 节点，等待它聚焦到球面中央。
- 断言卡片显示截断原文。
- 点击卡片后断言资源切到 `files`，并打开 `World/北境.md`。

**Step 5: 验证失败保持旧图**

- 下一次目录列表返回服务器错误。
- 点击刷新，断言出现明确错误提示，旧节点仍在，计数没有清零。

**Step 6: 运行浏览器回归并检查截图**

```powershell
bunx playwright test e2e/regression/novelx-project-graph.spec.ts --workers=1
```

Expected: PASS，并产出普通项目球形图谱截图。

### Task 6: 冻结验收、状态文档和提交

**Files:**

- Modify: `docs/status/2026-07-22-novelx-spherical-graph-batch.md`

**Step 1: 运行最终定向测试**

```powershell
bun test --preload ./happydom.ts `
  ./src/pages/session/novelx-graph-model.test.ts `
  ./src/pages/session/novelx-project-graph-model.test.ts `
  ./src/context/novelx-project-graph.test.ts `
  ./src/context/novelx-growth-skeleton.test.ts `
  ./src/context/novelx-world-growth.test.ts `
  ./src/context/novelx-workspace.test.ts
```

Expected: 全部 PASS。

**Step 2: 运行构建与真实页面回归**

```powershell
bun typecheck
bun run typecheck:e2e
bun run build
bunx playwright test e2e/regression/novelx-project-graph.spec.ts e2e/regression/novelx-workspace.spec.ts --workers=1
```

Expected: 类型检查、生产构建和两个浏览器回归均通过。

**Step 3: 记录全量测试基线**

```powershell
bun run test:unit
```

当前已知基线是 689 项中 688 项通过、1 项既有 i18n parity 失败。若失败数量或失败用例变化，停止提交并诊断，不得把新增回归归入既有债务。

**Step 4: 更新状态文档**

记录：

- 正式来源优先与普通项目回退边界。
- 文件类型、目录/文档数量和深度上限。
- 无 Provider、无项目写入、无语义因果推断。
- 定向、全量、浏览器和构建结果。
- 已知 i18n 基线失败是否保持不变。

**Step 5: 最终提交**

```powershell
git add docs/status/2026-07-22-novelx-spherical-graph-batch.md packages/app
git diff --cached --check
git commit -m "feat(novelx): refresh graphs for existing projects"
```

## 验收标准

1. 有正式世界注册状态的项目刷新后继续显示正式实体图，不降级成文件图。
2. 没有任何 NovelX 状态、但含合格文档的项目，第一次打开图谱即可生成节点。
3. 点击刷新后新增文件进入图谱，相同节点位置不变。
4. 刷新失败不会清空上一份可用图，也不会显示假成功。
5. 卡片跳到真实文件页面；图谱入口不再被旧 `activeFile` 覆盖。
6. 不读取隐藏目录、密钥、JSON、源码、二进制和未保存草稿。
7. 不调用 Provider、不写项目、不生成因果或语义关系。
8. 正式图、项目图、刷新状态、截断状态和错误状态都有自动化测试与真实浏览器证据。
