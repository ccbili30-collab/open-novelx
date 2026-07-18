# NovelX 中文界面批次状态

## 来源与提交

- 上游：OpenCode v1.18.3，`127bdb30784d508cc556c71a0f32b508a3061517`。
- 分支：`novelx-ui`。
- 实现提交：`4a7709e`（`feat(ui): default NovelX to Chinese`）。
- 前置界面批次：[`2026-07-19-novelx-workspace-ui-batch.md`](./2026-07-19-novelx-workspace-ui-batch.md)。

## 已实现

- 首次启动且不存在语言偏好时，App（应用）与 Desktop Renderer（桌面渲染器）统一以简体中文启动，不再跟随英文系统语言回落到英文。
- 已保存的手动语言选择仍优先于中文默认值；切换英文等现有语言的能力没有移除。
- 简体中文词典在首次渲染前进入基础字典，避免中文默认界面先短暂显示英文。
- NovelX 工作区中的 `Agent`、`World` 等残留控件文案改为“智能体”“世界”。项目名、文件名、模型名、代码、协议名和产品专名不强制翻译。
- 新布局输入框、标签页介绍、草稿标签关闭按钮、V2 弹窗与提示条的硬编码英文改为本地化文案。
- Windows 应用菜单的所有可见菜单项补齐简体中文标签，并保留英文标签供手动切换语言使用。

## 验收

- `packages/app: bun test --preload ./happydom.ts ./src/context/language.test.ts ./src/components/tabs-info-copy.test.ts ./src/desktop-menu.test.ts`：8 项通过，0 项失败。
- `packages/desktop: bun test ./src/renderer/i18n/index.test.ts`：1 项通过，0 项失败。
- `packages/app: bun run typecheck`：通过。
- `packages/app: bun run typecheck:e2e`：通过。
- `packages/desktop: bun run typecheck`：通过。
- 改动文件定向 Oxlint（静态检查）：0 错误；仍有 33 条既存风格/类型警告，没有作为本批次完成证据忽略。
- `packages/app: bun run build`：通过。
- `packages/desktop: bun run build`：通过，Main（主进程）、Preload（预加载脚本）和 Renderer（渲染器）均成功产出。
- `packages/app: bunx playwright test e2e/regression/novelx-workspace.spec.ts --project=chromium --reporter=line`：1 项通过。测试清空语言偏好，在英文浏览器环境中确认 `html[lang=zh]`、中文输入框、中文工作区、智能体/会话切换、世界文件打开、侧栏收起/展开及新建任务链路。
- 已人工检查该端到端测试生成的 1600×960 截图；截图中的产品控件为中文，保留的英文为文件路径、模型名或调试标识。

端到端测试使用仓库内 Mock Server（模拟服务器）提供确定性的会话、智能体和文件状态。没有使用真实 Provider（模型服务），因此本批次不是 Live Agent（真实智能体）、Growth（生长链路）或世界包生成验收。

## 全量测试现状

`packages/app: bun run test:unit` 执行了 632 项测试，结果为 630 项通过、2 项失败：

1. 上游既存的阿拉伯语词典缺少 `session.header.reveal.finder`、`session.header.reveal.fileExplorer`、`session.header.reveal.containingFolder` 三个键。
2. 未修改的 `observe-element-offset.test.ts` 在全量并发运行时一次未收到预期 DOM 偏移回调；随后单独运行该文件，7 项全部通过。当前证据支持其为全量负载下的时序不稳定，但尚未修改该测试或宣称根因已修复。

因此，本批次的定向测试、类型检查、构建和中文界面端到端测试通过，但不能声明 App 全量单元测试为绿色。

## 未完成与风险

- 没有进行全产品 OpenCode→NovelX 品牌替换；`OpenCode` 作为当前内核/产品专名仍会出现。
- 没有翻译用户项目数据、文件路径、模型名称、代码、协议标识及开发调试缩写。
- Windows 菜单有数据级覆盖测试，但没有在真实 Electron（桌面壳）窗口中逐项打开做视觉检查。
- macOS 原生菜单和 Linux 桌面行为未做运行验证。
- 没有修改 Provider、Runtime（运行时）、公开协议、数据模型、权限、世界领域语义或 Growth 链路。
- 没有真实 Provider 端到端运行，也没有生成世界包或图片。

## 恢复入口

- 默认语言与语言持久化：`packages/app/src/context/language.tsx`、`packages/desktop/src/renderer/i18n/index.ts`。
- 简体中文词典：`packages/app/src/i18n/zh.ts`。
- Windows 菜单标签：`packages/app/src/desktop-menu.ts`。
- 中文界面端到端回归：`packages/app/e2e/regression/novelx-workspace.spec.ts`。
