# NovelX 工作台可测量视觉规格

状态：前端骨架实施基线；尺寸为参考图测量值和第一轮实现变量，不替代尚未完成的产品确认

产品契约：[`2026-07-19-novelx-workspace-ui-contract.md`](./2026-07-19-novelx-workspace-ui-contract.md)

## 1. 参考图与目标视口

2026-07-19 的当前单一视觉基准更新为：

`C:\Users\16014\.codex\generated_images\019f7695-ddcf-7772-a15d-90d7e87efe96\exec-770f6d85-7ba1-4c6e-8899-cddbd6449532.png`

该图为 `1672 × 941`。本轮优先复刻其布局几何、符号密度、选中方式和主次关系；暖色数值不是本轮判断重点。仓库内六张工作面概念图继续约束各页内容组织，但不再覆盖这一统一网格。

六个工作面概念图均为 `1672 × 941`：

- `references/2026-07-19-six-surface-concepts/01-files.png`
- `references/2026-07-19-six-surface-concepts/02-world-primary.png`
- `references/2026-07-19-six-surface-concepts/03-characters.png`
- `references/2026-07-19-six-surface-concepts/04-graph.png`
- `references/2026-07-19-six-surface-concepts/05-story.png`
- `references/2026-07-19-six-surface-concepts/06-project-files-and-info.png`

OpenCode 单层外壳参考为 `2560 × 1600`，只用于外壳融合、折叠控制和桌面窗口行为，不复制 macOS 红绿灯。

第一目标视口采用 `1672 × 941 @ 1x`。旧回归的 `1619 × 972` 继续用于兼容性检查，但不再作为新六工作面的构图基准。

## 2. 目标几何

以当前视觉基准为六工作面共同网格。测量边界允许浏览器 1px 取整误差：

| 区域 | 目标边界 | 基线尺寸 |
| --- | --- | --- |
| 唯一顶栏 | `x 0–1672, y 0–62` | `1672 × 62` |
| 项目方块栏 | `x 0–56, y 62–941` | `56 × 879` |
| 小对话栏 | `x 56–399, y 62–941` | `343 × 879` |
| 资源导航器 | `x 399–633, y 135–941` | `234 × 806` |
| 主工作面 | `x 633–1314, y 135–941` | `681 × 806` |
| 条件式详情栏 | `x 1314–1604, y 135–941` | `290 × 806` |
| 六图标栏 | `x 1604–1672, y 62–941` | `68 × 879` |
| 资源页总标题 | `x 399–1604, y 62–135` | `1205 × 73` |

本轮使用以下可调变量：

```css
--novelx-titlebar-height: 62px;
--novelx-project-rail-width: 56px;
--novelx-project-sidebar-width: 300px;
--novelx-conversation-compact-width: 343px;
--novelx-resource-nav-width: 234px;
--novelx-inspector-width: 290px;
--novelx-resource-dock-width: 68px;
--novelx-compact-files-width: 324px;
```

Electron Windows 原生 caption overlay（标题栏覆盖层）必须与 `62px` 同步，不能只增高网页标题栏而让原生窗口按钮错位。

固定宽度总和不得再次挤压主编辑区。目标视口中主工作面约占总宽度 `40.7%`；当资源工作区不足以同时容纳三列时，详情栏改为可关闭的覆盖式检查器，资源导航和小对话再按既有状态收起，主编辑面保持可用。

## 3. 组件层级

```text
Titlebar
  left-panel-toggle
  centered-NovelX-home
  right-panel-toggle
  Windows-native-caption-buttons

Workspace
  ProjectNavigation
    collapsed-project-rail | expanded-project-session-tree
  ConversationSurface
    full-conversation | compact-conversation | status-strip
  ResourceSurface
    compact-files | expanded-resource
      resource-navigator
      primary-surface
      conditional-inspector
  ResourceDock
    files / world / characters / graph / story / package
```

顶栏是唯一外壳。页面内不再渲染第二个 `NovelXShellToolbar`，也不再用 CSS 伪元素伪造标题。Windows 原生最小化、最大化、关闭按钮继续由 Electron title bar overlay 提供。

## 4. 状态模型

每个项目持久化一个 UI Snapshot（界面快照）：

```text
left: expanded | rail
right: compact-files | icons-only | resource-expanded
resource: files | world | characters | graph | story | package | none
conversation: full | compact | collapsed
inspector: open | closed
project/session order and pinned shortcuts
```

关键转移：

```text
home + click(resource-X)
  -> left rail + compact conversation + resource-X expanded

resource-X + click(resource-X)
  -> home + default compact files

resource-X + click(resource-Y)
  -> resource-Y expanded; shell geometry and conversation instance remain stable

click(right-toggle)
  -> icons-only

icons-only + click(right-toggle)
  -> previous right state; if no previous resource, compact files
```

布局变化不得重建会话、清空 composer（输入草稿）、重置流式消息或丢失独立滚动位置。

## 5. 视觉令牌

从概念图和已确认的暖色低彩度方向抽取：

| 令牌 | 初始值 | 用途 |
| --- | --- | --- |
| `--nx-bg-shell` | `#f8f4ef` | 顶栏、项目栏、图标栏连续底色 |
| `--nx-bg-surface` | `#fbfaf8` | 对话和主要内容面 |
| `--nx-bg-subtle` | `#f4f0eb` | 选中行、弱层级 |
| `--nx-bg-editor` | `#fffdfa` | 编辑器和输入框 |
| `--nx-ink` | `#282522` | 主文字与图标 |
| `--nx-muted` | `#77716b` | 次要文字 |
| `--nx-faint` | `#aaa39b` | 辅助信息 |
| `--nx-line` | `#e4ded7` | 1px 分隔线 |
| `--nx-line-strong` | `#d8d0c8` | 输入和焦点边界 |
| `--nx-accent` | `#8e3f39` | 仅用于真实活动/错误状态点 |

- 字体：`"Microsoft YaHei UI", "PingFang SC", "Segoe UI", sans-serif`。
- 普通正文：`13–14px`，行高 `1.55–1.75`。
- 资源页总标题：`20px`；文档内容标题：`24–28px`；分区标题：`13–16px`。
- 图标：使用 `C:\Users\16014\Desktop\570+图标-v1.0.3` 中语义对应的 SVG，统一作为单色蒙版投影；常规 `16px`，资源栏占位 `24px`。只复制实际使用的资产，不引入整包。
- 六入口固定映射：文档→文件、地球→世界、角色→角色、连接→图谱、书→故事、背包→世界包。
- 图标默认不套描边按钮；仅当前入口使用克制的浅底、细边界或短强调线。六个入口的尺寸、对齐和选中方式必须一致。
- 主面板无投影；控件圆角 `4–6px`；输入框最大 `10px`。
- 不使用 Emoji 代替图标，不使用 Agent 专属彩色按钮，不添加装饰性渐变或漂浮卡片。

## 6. 各工作面主构图

### 文件

小对话栏、文件树、所见即所得文档面、文件信息/关联引用、资源图标栏。真实文件树可用；所见即所得编辑器和文件元数据未接入时必须明确显示“骨架/尚未接入”，不能展示虚构保存状态。

### 世界

小对话栏、世界分类树、Atlas 主画布、地点详情、资源图标栏。当前骨架可以显示真实 World 目录和空 Atlas 状态；不得用示例地图冒充项目地图。

### 角色

小对话栏、角色导航、连续文字档案、按需详情、资源图标栏。当前没有正式角色领域查询时只显示真实目录或诚实空状态。

### 图谱

小对话栏、图谱类别、局部图画布、节点详情、资源图标栏。没有真实图谱投影时显示缺少数据，不生成装饰性假节点。

### 故事

小对话栏、卷/章/场景导航、正文/事件链主面、故事详情、资源图标栏。没有正式故事对象时显示真实目录或空状态。

### 世界包

小对话栏、包目录、封面/简介/总览、校验与打包详情、资源图标栏。没有真实世界包元数据时不得显示“校验通过”或“可导出”。

## 7. 响应与恢复

- 所有折叠和资源切换立即更新 pressed/selected 状态。
- 同一资源图标重复激活执行返回，不创建重复页面。
- 折叠时若焦点位于被隐藏面板，焦点转移到对应恢复按钮。
- `Escape` 关闭资源页上的项目覆盖层；不丢失输入草稿。
- `prefers-reduced-motion` 下取消位移动画，但不取消状态变化。
- 当前尚未确认窄窗口阈值；实现先以容器可用宽度保护主工作面，并在不能满足最小宽度时依次折叠详情、小对话和资源导航。

## 8. 当前实现审计

2026-07-19 开工基线 `6b5e790`：

- 当前由 `28px` CSS 伪标题栏、`47px` 页面工具栏和 `27px` 状态栏组成三层外壳，与单层要求冲突。
- `data-novelx-titlebar` 隐藏了标题栏真实 DOM，再用 `::before` 画出 `novelx`，无法承载左右折叠和中心返回。
- 右侧状态仅有组件局部的 `files | world`，无法在会话/新会话和项目切换后恢复六工作面状态。
- 左侧只展示当前项目，未使用已有的真实多项目列表和项目排序能力。
- 当前会话、文件树和草稿均有真实状态来源，应保留并迁移，不能换成静态概念页。

因此实施采用结构重建：将 NovelX 工作区状态放入持久化 Layout Context（布局上下文），用一个共享 Shell（外壳）投影真实会话和文件状态；不继续在旧三栏上叠加视觉补丁。

首次导航性能基线（run id `2026-07-18T22-29-39-305Z-11616`）：

| 路径 | 首次到达 | 稳定到达 | 空白/未知帧 |
| --- | ---: | ---: | ---: |
| 未访问会话 | `69.3ms` | `83.3ms` | `0 / 0` |
| 新会话 | `38.7ms` | `46.9ms` | `0 / 0` |
| 子会话 | `49.3ms` | `65.5ms` | `0 / 0` |

第一可提交批次的实际状态：

- 已删除页面内第二层 NovelX 工具栏和状态栏，标题栏改为真实 DOM；中心 `NovelX` 返回当前项目主页，不再误触发新建会话。
- 标题栏、项目栏和六图标栏统一使用 `#f8f4ef`；Windows 原生 caption overlay 高度同步为 `48px`。
- 六资源切换、同键返回、左右折叠、小对话完全折叠与恢复、详情栏关闭与重开均由每项目持久化状态驱动。
- 项目与会话来自真实项目/会话 Store（状态存储）；会话不会跨项目拖动，项目、同项目会话和置顶快捷方式分别排序。
- 文件、世界、角色、故事工作面只投影真实目录；图谱与世界包在没有领域 Runtime（运行时）数据时明确失败关闭，不生成假节点、假地图、假校验或假导出。
- 六工作面已经有不同的空画布构图，但仍属于前端骨架；所见即所得编辑器、Atlas、图谱投影和世界包校验没有因此变成已实现能力。

定向验收证据：

| 验收 | 结果 |
| --- | --- |
| `novelx-workspace.test.ts` | `5 passed`，覆盖资源状态转移、右栏恢复、持久化归一化、置顶和排序 |
| 两个 NovelX Playwright 回归 | `2 passed`，`1672 × 941 @ 1x` |
| App typecheck / E2E typecheck | 通过 |
| App production build | 通过，`2428` modules transformed |
| Desktop typecheck / production build | 通过；真实 Electron renderer（渲染进程）启动并连接真实本地 sidecar（伴随进程） |

Electron 实拍使用真实构建、隔离的 onboarding test root（首次启动测试目录）和实际 `oc://renderer/index.html`，渲染视口为 `1656 × 933 @ 1x`。`Page.captureScreenshot` 只能捕获 WebContents（网页内容），因此截图中 Windows 原生最小化/最大化/关闭按钮所在的 `137px` caption overlay 保留为空白；这不能替代对原生按钮点击、拖动和双击最大化的人工验收。

本批实现提交为 `d9d28ac`（`feat(app): build NovelX workspace shell`），设计基线提交为 `6b5e790`。冻结前执行的关键命令为：

- `bun test --preload ./happydom.ts ./src/context/novelx-workspace.test.ts`
- `bun run typecheck`
- `bun run typecheck:e2e`
- `bunx playwright test --config e2e/regression/playwright.config.ts e2e/regression/new-session-panel-corner.spec.ts e2e/regression/novelx-workspace.spec.ts`
- Desktop 包内 `bun run typecheck` 与 `bun run build`

上述均为前端状态、交互和构建验收；没有使用真实 Provider（模型服务），也没有把 Growth、领域写入、图谱投影或世界包导出标记为 Live（真实运行）。原生窗口按钮的人工交互仍是明确未完成项。

## 9. 截图验收

每个可提交阶段至少：

1. 在 `1672 × 941` 捕获真实 Chromium 页面。
2. 对照对应参考图检查主要竖线误差、顶栏高度、主工作面占比和信息密度。
3. 至少完成两轮视觉修正。
4. 在真实 Electron 中确认 Windows caption buttons、拖动、双击最大化和折叠控制。
5. 覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`，同时把阶段证据保存到 `tmp/visual-replica/`；临时证据不提交。
