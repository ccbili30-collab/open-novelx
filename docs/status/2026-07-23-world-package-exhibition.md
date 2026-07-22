# 世界包展览批次状态

## 已完成

- 创建独立工作树 `codex/novelx-world-package`，基线为集成提交 `b974ed812`。
- 新增公开世界包投影：固定顺序为封面、总览、地图、文稿、故事、角色、图谱。
- 投影只保留公开字段，不序列化 Prompt、Agent、工具调用、会话消息或凭据。
- 工作台“世界包”资源接入沉浸式星空展览视图。
- 地图使用真实视觉 Atlas 的多边形，第一次点击高亮，第二次点击放大并显示摘要，档案路径可跳转文件工作面。
- 图谱、图志、纪行、小说章节和角色档案均来自现有结构化投影。
- 增加 `.zib` 导出：内部为标准 ZIP，包含自包含 `index.html`、`data/world.json` 和 `README.txt`。
- 导出视图不依赖 NovelX Runtime，可解压后直接打开 `index.html`。

## 验收

- `packages/app`: `bun run typecheck` 通过。
- `packages/app`: `bun test --preload ./happydom.ts ./src/novelx/world-package.test.ts`：2 passed，0 failed，7 assertions。
- `packages/app`: `bun run build` 通过；仅有现有 chunk/dynamic import 警告。
- ZIP 生成器测试确认文件头为标准 ZIP `PK\x03\x04`。

## 未完成 / 冻结

- 本批尚未重新打包 Electron 安装程序，也未在真实桌面窗口做视觉截图验收。
- 导出包目前使用无压缩 ZIP store，优先保证 Windows 解压兼容性；后续可在体积需求明确后增加压缩。
- 世界包封面和地图美术只有在正式任务已挂载时才进入展示；没有假图或 Fixture 降级。
- 导出包不包含会话记录、原始内部工作流和隐藏运行状态。

## 风险与恢复入口

- 新工作树的完整依赖安装在 `tree-sitter-powershell` 原生编译处出现既有环境错误，但 app 依赖已链接，当前定向测试与构建均通过。
- 桌面打包需要在此工作树单独执行，不应覆盖集成或 bugfix 工作树。
- 继续开发入口：`packages/app/src/novelx/world-package.ts`、`packages/app/src/novelx/world-package-export.ts`、`packages/app/src/pages/session/novelx-world-package-view.tsx`。

