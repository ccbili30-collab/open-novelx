# 世界包展览批次状态

## 已完成

- 创建独立工作树 `codex/novelx-world-package`，基线为集成提交 `b974ed812`。
- 新增公开世界包投影：固定顺序为封面、总览、地图、文稿、故事、角色、图谱。
- 投影只保留公开字段，不序列化 Prompt、Agent、工具调用、会话消息或凭据。
- 工作台“世界包”资源按已批准的 `NovelX-世界包浏览器预览.html` 重做为虚空中的空间翻书视图；删除错误的纵向长卷、统计卡片和传统展览导航。
- 正式展览状态固定为封面、世界地图、历史与小说、人物群像、世界图谱；总览数据仍保留在公开投影中，但不额外制造与参考原型不一致的第六个页面。
- 背景以世界标题为稳定种子生成 220 个无规则星点；位置、亮度、色调、深度、漂移方向、速度和延迟独立变化，不再使用重复 CSS 星点贴图。
- 地图使用真实视觉 Atlas 的多边形，第一次点击高亮，第二次点击放大并显示摘要，档案路径可跳转文件工作面。
- 图谱、图志、纪行、小说章节和角色档案均来自现有结构化投影。
- 增加 `.zib` 导出：内部为标准 ZIP，包含自包含 `index.html`、`data/world.json` 和 `README.txt`。
- 导出视图不依赖 NovelX Runtime，可解压后直接打开 `index.html`。

## 验收

- `packages/app`: `bun run typecheck` 通过。
- `packages/app`: `bun test src/novelx/world-package.test.ts`：3 passed，0 failed，14 assertions。
- `packages/app`: `bun run build` 通过；仅有现有 chunk/dynamic import 警告。
- ZIP 生成器测试确认文件头为标准 ZIP `PK\x03\x04`。
- Playwright 在 1600×1000 视口完成两轮参考/候选截图校正；参考截图为 `tmp/visual-replica/reference-cover.png`，最终封面与地图截图为 `tmp/visual-replica/candidate-cover-pass-3.png`、`candidate-map-pass-3.png`。
- 桌面正式预览 `C:\Users\16014\Desktop\NovelX-世界包浏览器预览.html` 已覆盖并真实启动。

## 未完成 / 冻结

- 本批尚未重新打包 Electron 安装程序，也未在 NovelX Electron 工作台中完成截图验收；现有视觉证据来自同一离线模板的真实浏览器渲染。
- 导出包目前使用无压缩 ZIP store，优先保证 Windows 解压兼容性；后续可在体积需求明确后增加压缩。
- 世界包封面和地图美术只有在正式任务已挂载时才进入展示；没有假图或 Fixture 降级。
- 导出包不包含会话记录、原始内部工作流和隐藏运行状态。

## 风险与恢复入口

- 新工作树的完整依赖安装在 `tree-sitter-powershell` 原生编译处出现既有环境错误，但 app 依赖已链接，当前定向测试与构建均通过。
- 桌面打包需要在此工作树单独执行，不应覆盖集成或 bugfix 工作树。
- 工作台 Solid 视图与离线模板拥有相同状态机和视觉规格，但 CSS 仍是两个实现表面；后续视觉修改必须同时核对两处，避免再次分叉。
- 继续开发入口：`docs/design/world-package-browser-design-spec.md`、`packages/app/src/novelx/world-package.ts`、`packages/app/src/novelx/world-package-browser-template.ts`、`packages/app/src/pages/session/novelx-world-package-view.tsx`。
