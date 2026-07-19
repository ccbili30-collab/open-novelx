# NovelX 真实文档编辑闭环设计

日期：2026-07-19
状态：已由产品所有者授权实施
范围：文件工作面，不扩展 Growth、世界/角色/故事领域模型

## 目标与边界

本批把文件工作面从导航骨架变成真实文档工具：读取项目内精确文本、在排版视图或源码视图中编辑、撤销/重做、条件保存、冲突阻塞、Agent 占用锁定、文件变更流式刷新，以及恢复上次打开文件和滚动位置。成功标准是对临时真实项目完成“打开、编辑、撤销、保存、关闭、重新读取仍一致”。

本批不实现世界领域 Operation（领域操作）、Change Set（变更集）、Growth 调度、图谱、Atlas、世界包导出或多文件事务；也不把 Markdown 演示数据标记为 Live（真实运行）。用户直接编辑普通项目文档属于文件能力，不能绕过权威文件变更服务，也不能要求 Provider（模型服务）。

## 协议与数据流

现有 `GET /file/content` 会裁掉文本首尾空白，且 SDK（开发工具包）没有用户写入方法，因此不能安全复用。经产品所有者明确授权，在现有 Experimental HttpApi（实验性 HTTP 接口）文件组增加：

- `GET /file/edit?path=...`：返回精确 UTF-8 正文和 `bom` 标志，不裁空白。
- `PUT /file/edit?path=...`：请求包含 `content`、`expectedContent`、`expectedBom`；响应返回保存后的精确正文和 BOM 状态。
- `FileEditInvalidError`：400，区分非法路径、二进制、非 UTF-8 和非文件。
- `FileEditNotFoundError`：404。
- `FileEditConflictError`：409，表示磁盘内容已经不等于读取时基线。

服务端先用 `LocationMutation.resolve` 解析规范路径并拒绝项目外目标，再用 `FileMutation.writeIfUnchanged` 在同一个目标锁内比较旧字节和写入新字节。浏览器提交完整旧正文是刻意选择：它复用现有冻结服务，不新增服务端编辑会话、哈希锁或 Runtime（运行时）状态。UTF-8 BOM 作为独立布尔字段往返，正文编辑区不暴露不可见 BOM 字符。

## 编辑器

Markdown 的可视编辑采用 ProseMirror（结构化富文本编辑内核）的 CommonMark parser/serializer、history 和 keymap。选择它而不是手写 `contenteditable`，因为官方模型明确提供结构化文档状态、Markdown 解析/序列化和选择性感知的撤销历史。普通文本使用原生 `textarea`。官方参考：<https://prosemirror.net/docs/ref/>、<https://prosemirror.net/examples/markdown/>。

`.md` 和 `.markdown` 默认进入排版视图；`.txt` 和 `.text` 进入源码文本视图。YAML front matter（前置元数据）在可视编辑时原样隔离并在保存时拼回。第一批不支持的 Markdown 扩展——原始 HTML、GFM 表格、任务列表、脚注、数学块和自定义指令——自动进入源码模式并显示原因，防止可视序列化静默丢失结构。

`Ctrl+Z`、`Ctrl+Y` 和 `Ctrl+Shift+Z` 由当前编辑面接管；`Ctrl+S` 执行条件保存。按住 `Alt` 临时显示源码，松开恢复原视图；界面同时提供可点击的持久“排版/源码”切换，避免只能靠隐藏快捷键。IME（输入法）composition 期间不切换视图、不保存，也不把中间拼音状态写入草稿。

## 状态、冲突与 Agent 锁

每个打开文档保存 `baseline`、`draft`、`bom`、`dirty`、`loading`、`saving`、`conflict`、`error` 和视图模式。文件选择与滚动位置按项目持久化；正文草稿只存在当前运行会话，未保存时切换不会被静默丢弃。

同步状态中处于 `pending` 或 `running` 的 `write`、`edit` 和 `apply_patch` 工具会被解析为正在修改的规范化路径。当前文件命中后编辑器立即只读，并显示具体 Agent 工具状态。文件观察器收到同一路径变化时：无本地草稿则重新读取并投影；有草稿则保留草稿、标记外部变化，等待用户重新加载或尝试保存得到 409。工具结束后解除只读，但不会自动覆盖用户草稿。

保存状态机只允许 `clean → dirty → saving → clean`，失败回到 `dirty/error`，409 进入 `conflict`。冲突状态提供“重新加载磁盘版本”和“保留当前草稿”两种动作；本批不提供强制覆盖，因为这会绕过已授权的条件写入语义。

## 验收

服务端测试覆盖精确空白、CRLF、BOM、成功保存、并发陈旧写、二进制、路径逃逸和缺失文件。前端单元测试覆盖 Markdown 能力判定、front matter 往返、编辑状态机、活动工具路径和 IME/快捷键门禁。浏览器回归覆盖真实文件树选择、排版/源码切换、状态标签、保存和冲突 UI。

最终使用真实 Electron（桌面应用运行壳）和临时项目目录验证读写闭环；不使用真实 Provider，也不创建假 Agent。桌面正式预览继续覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`。
