# NovelX 新建独立项目批次

日期：2026-07-22

项目：`D:\CodexW\NovelX_Desktop\work\opencode-novelx-bug`

分支：`codex/novelx-bugfix`

代码提交：`02b9ee91c`

## 当前范围

本批只完成左侧加号的“新建项目 / 打开项目”分流，以及新建本机项目从目录创建到 OpenCode Runtime（运行时）独立身份校验的真实闭环。没有迁移现有 Session（会话）数据库，没有修改 Growth（生长）编排、Provider（模型服务）或世界内容。

## 已实现

- 左侧项目方块栏的加号打开两项菜单：`新建项目` 进入 NovelX 创建对话框，`打开项目` 继续复用原有目录选择命令。
- 新建对话框收集项目名称，再由 Electron（桌面壳）主进程打开 Windows 原生父目录选择器；Renderer（渲染器）不直接获得任意文件系统写权限。
- 项目名按 Windows 保留名、非法字符、首尾空白、尾点和长度规则验证；同名文件或目录不会被覆盖。
- 新建项目前检测本机 Git。Git 不可用时在创建目录前失败关闭并显示明确提示。
- Git 子进程移除继承的全部 `GIT_*` 控制变量，禁用系统/用户配置和模板，限制输出与 15 秒执行时间；初始化后验证仓库不是 bare、真实顶层就是新目录、Git common directory（公共仓库目录）没有逃出项目。
- 新项目不制造空提交。主进程在已验证的 `.git/opencode` 写入唯一 `novelx_*` 项目 ID，并读回确认。
- 初始化失败时，只在本批刚创建的目录顶层仍为空或只有 `.git` 时回滚；若出现其他文件则保留现场，并把完整残留路径返回给用户，避免误删并提供恢复入口。
- 创建结果把规范化目录和预期项目 ID 送回界面。界面要求 Runtime 回报同一个非 `global` ID 和同一工作目录后才登记项目、创建草稿；激活失败会撤销本地登记。

## 验收

- Desktop 定向测试：30 项通过，0 失败。覆盖名称规则、Git 环境隔离、真实 Git 仓库与 ID、无 Git 零目录副作用、冲突、权限失败、初始化失败回滚、残留目录保护、bare/路径逃逸/顶层不一致失败路径。
- App 项目创建流程测试：3 项通过，0 失败。覆盖先验证后登记、Runtime 拒绝时零登记、草稿激活失败回滚。
- `packages/app` 与 `packages/desktop` 的 `bun run typecheck` 均通过。Windows 检出的 `custom-elements.d.ts` Git symlink（符号链接）仅在验收期间临时展开，随后恢复为原始 `120000` 模式，未进入提交。
- `packages/desktop` 的 `bun run build` 通过，主进程、Preload（预加载桥接）和 Renderer 均生成生产产物。
- 真实 Git + Core Runtime 回读通过：创建 ID 与 `ProjectV2.resolve` 返回 ID 完全一致，结果非 `global`，工作目录与 Git store 精确归属于新项目。
- 真实 Electron 开发窗口通过 CDP（Chrome 调试协议）确认 `createProjectDirectory` 桥接存在；真实 Pointer Event（指针事件）展开加号菜单后出现启用的“新建项目 / 打开项目”。正式预览已覆盖到 `C:\Users\16014\Desktop\NovelX-正式预览.png`。
- `git diff --cached --check` 通过。

本批未调用真实 Provider。验收使用真实本机 Git、真实 Core Runtime 和真实 Electron 界面；没有通过 Native Picker（原生选择器）在用户正式目录创建测试项目，真实创建使用系统临时目录并在验证后清理。没有运行全仓库测试。

## 会话归属方向：已审查，尚未实现

用户提出让会话文件物理归属项目目录，使项目进入回收站时会话一起移动，也便于 AI 查询原文。方向合理，但当前不能把全局 `novelx.db` 或原始消息 JSON 直接塞进项目：实际 Part（消息部件）包含 reasoning（推理）、工具输入输出、绝对路径等内部信息，且 durable event（持久事件）不受 Project 外键级联；直接复制或删除会造成泄漏或残留。

推荐目标态是项目内权威 Session SQLite（会话数据库）加净化后的用户可见会话查询视图，全局只保留可重建的项目目录与摘要索引。AI 通过受控 search/read 工具查询用户可见原文，不裸读运行库。项目删除必须按“禁止新写入 -> 中止并落稳 -> WAL checkpoint（预写日志检查点）并关闭连接 -> 整个目录进入回收站 -> 清理全局索引”的顺序执行。

这是数据库路由、事件存储、迁移和删除协议变化，必须另开 ADR（架构决策记录）与迁移批次。当前仍使用 `%LOCALAPPDATA%\NovelX\data\opencode\novelx.db`，删除项目目录不会删除其中的历史会话。

## 未完成与风险

- 项目本地权威会话库、净化会话投影、AI 会话检索工具、历史数据迁移和项目级数据库删除协议均未实现。
- 新建独立项目要求本机安装 Git；无 Git 会明确失败，不提供伪项目或模板降级。
- Runtime 后续仓库发现仍继承应用启动环境中的 Git 变量；异常环境会使打开校验失败关闭，不会误登记。这是现有 Runtime 边界。
- 初始化失败后的安全回滚检查与删除之间仍存在很小的本机并发窗口；只作用于本流程刚创建且顶层没有用户文件的专属目录。
- 本批没有验证 macOS、Linux、远程 Server 或 WSL 的新建项目；菜单仅在本地 Desktop 连接启用。

## 恢复入口

- 加号菜单与 Runtime 精确校验：`packages/app/src/pages/session/novelx-workspace-sidebar.tsx`
- 新建项目对话框：`packages/app/src/components/dialog-create-project.tsx`
- 登记/激活回滚：`packages/app/src/components/project-create-flow.ts`
- Git 初始化、项目 ID 和目录回滚：`packages/desktop/src/main/create-project-directory.ts`
- Native Picker 与 IPC：`packages/desktop/src/main/ipc.ts`
- 会话项目化后续起点：`packages/desktop/src/main/novelx-profile.ts`、`packages/core/src/session/sql.ts`、`packages/core/src/event.ts`
