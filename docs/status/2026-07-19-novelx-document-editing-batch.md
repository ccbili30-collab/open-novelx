# NovelX 文档编辑批次状态

## 来源与边界

- 分支：`novelx-ui`。
- 协议与后端提交：`7e3b53c`（`feat(api): add conflict-safe file editing`）。
- 设计与执行计划：[`../plans/2026-07-19-novelx-document-editing-design.md`](../plans/2026-07-19-novelx-document-editing-design.md)、[`../plans/2026-07-19-novelx-document-editing.md`](../plans/2026-07-19-novelx-document-editing.md)。
- 本批只完成真实项目文件的读取、编辑、条件保存、冲突保护和 Agent 占用锁；没有把 Growth、世界领域对象、图谱、世界包或 Provider（模型服务）声明为已完成。

## 已实现

- 新增实验性的 `GET/PUT /file/edit`：精确保留 UTF-8 文本、BOM（字节顺序标记）、CRLF/LF 与首尾空白；写入必须携带打开时的内容和 BOM 基线，磁盘发生变化时返回 409。
- 文件访问继续经过 Location（项目位置）和 FileMutation（文件变更）权威服务；不存在、二进制、目录、越出项目和冲突分别失败关闭。
- NovelX 文件工作面直接读取和保存真实项目文件，不再只跳转到旧编辑器。
- Markdown 使用 ProseMirror 的 CommonMark 排版编辑；保留 YAML front matter。表格、任务列表、脚注、数学公式、原始 HTML 和扩展指令自动进入源码模式，防止排版序列化静默丢失内容。
- 支持源码/排版切换、按住 Alt 临时看源码、输入法组合输入、`Ctrl+S`、`Ctrl+Z/Y`、重新载入、脏稿离开保护、外部变化提示和 409 冲突保稿。
- 当前会话中真实处于 `pending/running` 的 `write`、`edit`、`apply_patch` 工具若命中当前文件，编辑器显示执行 Agent 并只读；工具结束后恢复编辑。
- 每项目持久化当前文件。NovelX 文件树不再把 Windows 目录路径合成为可编辑文件。
- 补齐所有应用语言包的显式键契约：简体中文、繁体中文使用正式中文；其他语言保持与运行时既有行为一致的显式英语回退，没有冒充已完成翻译。

## 验收证据

- `packages/opencode: bun test test/server/httpapi-file.test.ts`：6 个测试、38 个断言通过，覆盖精确读取、条件写入、冲突、BOM、二进制、目录、缺失和项目逃逸。
- SDK 生成客户端的精确读写与冲突定向测试、SDK 类型检查和 HttpApi exercise 已通过；完整 `bun run test:httpapi` 曾运行超过 5 分钟未完成并被终止，因此不能记录为全量通过。
- `packages/app: bun run test:unit`：650 通过、0 失败、1688 个断言。
- `packages/app: bun run typecheck`：通过。
- `packages/app: bun run typecheck:e2e`：通过。
- `packages/app: bunx playwright test e2e/regression/novelx-workspace.spec.ts e2e/regression/new-session-panel-corner.spec.ts --workers=1`：2/2 通过。测试使用确定性的 Mock Server（模拟服务），只证明界面状态与请求契约，不标记为 Live（真实运行）。
- 目录回归修复后，`packages/app: bunx playwright test e2e/regression/novelx-workspace.spec.ts --workers=1`：1/1 通过，额外覆盖 Windows 反斜杠目录不会进入编辑器。
- `packages/app: bun run build`：通过，2520 个模块转换完成；保留现有动态导入、同名 sourcemap 和大 chunk 警告。
- `packages/desktop: bun run typecheck`：通过。
- `packages/desktop: bun run build` 与修复后的 `bunx electron-vite build`：主进程、preload、renderer 和本地 Sidecar 构建通过；保留现有 bundle 警告。
- 真实 Electron 使用本地 Sidecar 打开 `C:\Users\16014\Documents\Default Project\World\world-overview.md`，通过界面切到源码、写入并保存；随后直接读取磁盘确认保存标记存在。没有使用 Provider。
- Electron 保持启动；正式预览已覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`，WebContents 截图尺寸为 `1280 × 802`。

## 未完成与冻结项

- 没有接入 Growth 编排、世界总编、地理/国家/文明 Agent、图谱、故事因果链、图片生成或世界包打包。
- 没有真实 Provider 配置或模型调用；缺少配置时仍不得用模板冒充 Agent。
- 排版模式仅承诺当前 CommonMark 子集；列出的扩展 Markdown 必须源码编辑。
- 脏稿保护覆盖 NovelX 文件树内切换；窗口关闭、项目切换和会话切换的全局统一离开拦截仍未实现。
- 当前 Agent 锁只观察当前会话已同步的工具部件，不宣称覆盖其他进程或其他会话的并发写入；磁盘并发最终由 409 条件保存保护。
- 完整 HttpApi 全量套件仍无完成证据；后续从该套件超时诊断继续，不得把定向 API 测试冒充全量。

## 恢复入口

- 文件协议：`packages/opencode/src/server/routes/instance/httpapi/groups/file.ts` 与 `handlers/file.ts`。
- 文档状态：`packages/app/src/context/document-edit-state.ts`。
- SDK/Watcher/Agent 锁控制器：`packages/app/src/context/novelx-document.ts`。
- 编辑器：`packages/app/src/pages/session/novelx-document-editor.tsx`。
- 工作面接线：`packages/app/src/pages/session/novelx-resource-workspace.tsx`。
