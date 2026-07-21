# NovelX 流式侧栏与项目导航批次

日期：2026-07-22

项目：`D:\CodexW\NovelX_Desktop\work\opencode-novelx-bug`

分支：`codex/novelx-bugfix`

## 当前范围

本批同时完成两项已确认的桌面交互：项目/会话的固定、拖放与删除入口，以及 Growth（生长）期间的公开正文流式侧栏。内部 Prompt（提示词）、推理、工具传输与 NovelX 子会话仍属于运行时内部信息，不进入用户对话或可导航页面。

## 已实现

- 左侧项目栏新增顶部快捷区和底部垃圾桶：项目或会话拖到顶部只会固定；快捷方式拖到底部只会取消固定；项目和会话本体拖到底部进入各自删除链。右键菜单复用同一操作链。
- 项目删除先由 Electron（桌面壳）原生确认完整路径，再签发绑定当前渲染进程、一次消费、60 秒过期的授权令牌；主进程消费令牌后再次校验目录并调用 Windows 回收站。
- 项目移动前会查询项目范围会话并逐个幂等中止。查询结果达到 10,000 条上限时失败关闭，不把可能截断的结果冒充全量。
- 会话永久删除先从服务端递归枚举全部后代，对每个节点幂等中止，再删除根会话；删除后逐个用非抛错客户端确认 404，网络错误、非 404 错误或残留节点均失败关闭。
- Growth 根对话只投影用户公开命令/文件和 assistant（助手）的公开正文。`/growth ...` 的扩展执行模板只对模型可见；推理、工具、synthetic（内部合成消息）、内部报告和多行工具传输均不进入公开时间线。历史版本已经持久化的 Growth 内部模板也按明确模板标记隐藏，不影响普通用户发言。
- NovelX 内部 `novelx-*` 子会话不能通过任务卡或直达 URL 打开；普通 OpenCode 子会话保持原导航行为。
- 资源侧栏直接订阅子会话的 `message.part.delta` 增量，只显示最新 assistant 正文。生成中草稿带只读、忙碌和文件锁标记；完成后才回到普通文件展示。

## 验收

- App 定向单元测试：30 项通过，0 失败。
- Desktop 回收站授权测试：4 项通过，0 失败。
- Session UI 子会话导航测试：2 项通过，0 失败。
- OpenCode Growth 命令展示测试：2 项通过，0 失败。
- Playwright 浏览器回归：1 项通过，覆盖公开时间线、两段流式增量、生成中锁定、快捷方式拖入垃圾桶、右键入口和子会话路由边界。
- `packages/app` 与 `packages/desktop` 的 `bun run typecheck` 均通过；App E2E TypeScript 检查也通过。
- `packages/desktop` 的 `bun run build` 通过；生产构建完成主进程、Preload（预加载桥接）和 Renderer（渲染器）产物。
- 真实 Electron 开发窗口已在最终生产构建后完整重启。CDP（Chrome 调试协议）检查确认两个回收站桥接函数存在、项目栏和底部垃圾桶已挂载、真实旧 Growth 会话中没有历史内部模板、内部工具名、Context Pack 或工具卡。
- `git diff --check` 通过。

本批未调用真实 Provider（模型服务）。流式验收使用真实前端 SSE（服务器推送事件）增量协议的受控回归数据，不属于真实模型生成验收。

## 未完成与边界

- 为保护用户数据，本批没有把真实项目移入回收站，也没有永久删除真实会话；破坏性成功路径由单元测试、协议检查和非破坏性桌面桥接检查覆盖。
- 项目会话达到或超过 10,000 条时，项目删除会拒绝继续，需要后续接入可分页的项目会话接口。
- 项目删除只把本地项目文件夹移入 Windows 回收站，不删除 OpenCode Session（会话）数据库记录；这是本批确认的产品语义。
- 当前文件锁是 NovelX 工作区的用户界面锁，不是对所有外部进程生效的全局文件系统锁。
- 本批没有修改 Growth 的世界生成编排、Provider 配置、数据库结构或公开协议，也不代表完整 NovelX 产品闭环。

## 恢复入口

- 项目/会话拖放与删除入口：`packages/app/src/pages/session/novelx-workspace-sidebar.tsx`
- 会话安全删除规则：`packages/app/src/pages/session/session-delete.ts`
- 项目回收站授权边界：`packages/desktop/src/main/trash-project-directory.ts`
- 公开对话与流式正文投影：`packages/app/src/pages/session/novelx-workspace-model.ts`
- Growth 命令公开/模型可见分离：`packages/opencode/src/session/novelx-growth-message.ts`
