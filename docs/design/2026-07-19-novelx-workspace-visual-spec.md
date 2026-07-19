# NovelX 工作台可测量视觉规格

状态：前端骨架实施基线；尺寸为参考图测量值和第一轮实现变量，不替代尚未完成的产品确认

产品契约：[`2026-07-19-novelx-workspace-ui-contract.md`](./2026-07-19-novelx-workspace-ui-contract.md)

## 1. 参考图与目标视口

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

以 `01-files.png` 为六工作面共同网格，允许首轮截图测量后在 CSS 变量中校正：

| 区域 | 目标边界 | 基线尺寸 |
| --- | --- | --- |
| 唯一顶栏 | `x 0–1672, y 0–62` | `1672 × 62` |
| 项目方块栏 | `x 0–60, y 62–941` | `60 × 879` |
| 小对话栏 | `x 60–361, y 62–941` | `301 × 879` |
| 资源导航器 | `x 361–644, y 62–941` | `283 × 879` |
| 主工作面 | `x 644–1271, y 62–941` | `627 × 879` |
| 条件式详情栏 | `x 1271–1593, y 62–941` | `322 × 879` |
| 六图标栏 | `x 1593–1672, y 62–941` | `79 × 879` |

当前实现阶段使用以下可调变量，不将其宣称为最终产品数值：

```css
--novelx-titlebar-height: 48px;
--novelx-project-rail-width: 60px;
--novelx-project-sidebar-width: 300px;
--novelx-conversation-compact-width: 300px;
--novelx-resource-nav-width: 280px;
--novelx-inspector-width: 320px;
--novelx-resource-dock-width: 64px;
--novelx-compact-files-width: 324px;
```

顶栏先使用 `48px` 是为了兼容 Electron Windows 原生 caption overlay（标题栏覆盖层）和当前宿主；六工作面截图校正时再评估是否增至概念图的 `62px`。这一差异必须在最终保真报告中披露。

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
- 页面标题：`24–28px`；分区标题：`13–16px`。
- 图标：单色线性，常规 `16px`，资源栏 `20px`。
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

## 9. 截图验收

每个可提交阶段至少：

1. 在 `1672 × 941` 捕获真实 Chromium 页面。
2. 对照对应参考图检查主要竖线误差、顶栏高度、主工作面占比和信息密度。
3. 至少完成两轮视觉修正。
4. 在真实 Electron 中确认 Windows caption buttons、拖动、双击最大化和折叠控制。
5. 覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`，同时把阶段证据保存到 `tmp/visual-replica/`；临时证据不提交。
