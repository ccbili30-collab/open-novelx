# NovelX 排版与图标批次状态

## 来源与边界

- 分支：`novelx-ui`。
- 单一视觉基准：`C:\Users\16014\.codex\generated_images\019f7695-ddcf-7772-a15d-90d7e87efe96\exec-770f6d85-7ba1-4c6e-8899-cddbd6449532.png`，尺寸 `1672 × 941`。
- SVG 来源：`C:\Users\16014\Desktop\570+图标-v1.0.3`；只复制六个资源入口所需资产。
- 本批只调整 NovelX 单层外壳、区域几何、资源页结构、标题栏和六类入口符号；没有修改 Growth、Provider（模型服务）、领域协议、持久化格式或文件编辑语义。

## 已实现

- 唯一标题栏增至 `62px`，中间只保留 `NovelX`，左右折叠按钮改为较清晰的中号布局符号；Electron Windows 原生 caption overlay（标题栏覆盖层）同步为 `62px`。
- 资源展开态使用同一套可测网格：项目方块栏 `56px`、小对话栏 `343px`、资源导航 `234px`、条件式详情栏 `290px`、六图标栏 `68px`、资源页总标题 `73px`。
- `1672px` 目标宽度下，文件页主编辑面实际落在 `x 634–1314`，与视觉基准的 `x 633–1314` 只有浏览器边框取整差异。
- 资源页总标题跨越导航、主面和详情三列；资源导航从标题下方开始，不再用多个相互抢层级的标题栏切碎页面。
- 窄资源工作区不足以同时容纳三列时，详情栏改为可关闭的覆盖式检查器，主编辑面不再被固定宽度继续压缩。
- 六类资源入口改用本地图标库的文档、地球、用户、连接、书和背包 SVG；去除原始滤镜后作为单色 CSS mask（蒙版）投影，六个入口统一尺寸、间距和激活态。
- 资源展开时，小对话栏输入区使用 `24px` 左右内边距，和视觉基准中的紧凑会话列对齐。
- 文档工具栏压缩到 `42px`，正文顶距从 `58px` 调整到 `36px`，把垂直空间还给编辑内容。
- 正式预览已覆盖：`C:\Users\16014\Desktop\NovelX-正式预览.png`。

## 验收证据

- `packages/app: bun run typecheck`：通过。
- `packages/app: bun run typecheck:e2e`：通过。
- `packages/app: bun test --preload ./happydom.ts ./src/context/novelx-workspace.test.ts`：6 个测试、19 个断言通过。
- `packages/app: bunx playwright test e2e/regression/new-session-panel-corner.spec.ts e2e/regression/novelx-workspace.spec.ts --project=chromium --workers=1`：最终 2/2 通过；固定视口 `1672 × 941`，明确断言 `62/73/56/343/234/290/68px` 关键几何，并覆盖主页、六入口切换、对话收起恢复、真实文件编辑、详情栏和项目覆盖层。
- 上述浏览器测试使用确定性的 Mock Server（模拟服务），证明前端行为与真实文件编辑请求契约，不标记为真实 Provider 或完整 Electron Live（真实运行）。
- `packages/app: bun run build`：通过，2527 个模块转换完成；保留上游已有的动态/静态重复导入、同名 sourcemap 和大 chunk 警告。
- `packages/desktop: bun run typecheck`：通过。
- `packages/desktop: bun run build`：主进程、preload、renderer 和本地 Sidecar 构建通过；保留上游已有的 `eval`、动态导入和 bundle 警告。
- 性能基准修改前完整运行时，前两个用例因已移除的 `[data-slot="titlebar-tabs"]` 选择器超时，属于现有 Harness（测试框架）与 NovelX 标题栏不兼容；第三个子会话路径通过，首次/稳定目标画面为 `53.6/69.8ms`，空白帧 `0`、未知帧 `0`。
- 修改后定向重跑同一子会话路径：1/1 通过，首次/稳定目标画面为 `68.7/85.5ms`，空白帧 `0`、未知帧 `0`。单次观测比基线慢 `15.1/15.7ms`，当前证据不足以把波动归因于本轮排版，也不能声明性能完全无变化。

## 未完成与风险

- 这批完成的是可运行的前端排版和资源切换闭环，不是六个工作面的最终内容实现。世界、角色、图谱、故事和世界包仍只有现有真实文件投影或空状态，没有新增领域运行链。
- 没有调用真实 Provider，也没有接入 Growth、Agent 流式改写、图谱检索、地图渲染、图片生成或世界包导出。
- 用户提供的图标包原始图形是 `10 × 10` 实心图形，不等同于视觉基准中的大尺寸线性符号。本批通过蒙版放大、单色化和统一激活态控制差异，但不能诚实宣称逐笔复刻。
- 正式预览来自同尺寸 Chromium 实际页面和模拟服务，未重启用户当前 Electron 进程；Windows 原生最小化、最大化、关闭按钮与 `62px` 覆盖层只经过代码、类型检查和生产构建，没有本批新的实机截图证据。
- 性能 Harness 的两个旧选择器仍待单独修正；该问题不阻塞当前布局验收，但阻止“完整首导航性能套件通过”的声明。
- 本批没有运行整个仓库全量测试，验收范围是应用/桌面构建、工作区定向单元测试、两条前端回归和一条有效性能基准。

## 恢复入口

- 几何与视觉变量：`packages/app/src/pages/session/novelx-workspace.css`。
- 六入口组件：`packages/app/src/components/novelx-resource-icon.tsx`。
- 资源页结构：`packages/app/src/pages/session/novelx-resource-workspace.tsx`。
- 标题栏与 Windows 覆盖层：`packages/app/src/components/titlebar.tsx`、`packages/app/src/components/titlebar.css`、`packages/desktop/src/main/windows.ts`。
- 可执行几何规格：`packages/app/e2e/regression/new-session-panel-corner.spec.ts`、`packages/app/e2e/regression/novelx-workspace.spec.ts`。
