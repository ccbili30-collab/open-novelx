# NovelX 世界 Live 与独立 Profile 最终状态

日期：2026-07-21

项目目录：`D:\CodexW\NovelX_Desktop\work\opencode-novelx`

分支：`novelx-ui`

运行链修复提交：`f81d37f`

独立 Profile 提交：`c4ddb6f`

本文件取代 [`2026-07-20-novelx-authoritative-map-and-publication-progress.md`](./2026-07-20-novelx-authoritative-map-and-publication-progress.md) 中尚未完成的 Provider（模型服务）阻塞状态。当前闭环只覆盖“世界 Growth（生长）→视觉任务→玩家发布→正式桌面读取”以及 NovelX 独立运行档案，不代表故事、角色、图谱和世界包导出已经完成。

## 已完成

- 同一根会话 `ses_080033772ffefVX3XpfK81j4vo` 在原 Live 目录继续恢复，没有创建替代世界，也没有用 Fixture（测试夹具）、模板或确定性本地文本补齐失败内容。
- 世界五阶段全部完成，27/27 份内部档案提交并形成 5 个真实记忆检查点。
- Atlas V2（图册第二版）完成 72 个权威地块与 12 个自然/人文投影；地图和点击区域共享同一语义账本。
- 图片队列完成 8/8：1 张世界地图、4 张首府或核心风貌、3 张奇观风貌。一次真实连接关闭只重试失败项，已挂载图片保持幂等。
- 玩家发布层完成 30 份文稿：27 篇图志、3 篇纪行；玩家文稿与内部权威原文分离，泄漏扫描未发现 Agent、Prompt、工具调用、工作流或哈希等内部生产痕迹。
- NovelX 世界叶子 Agent（智能体）现在拒绝所有未明确允许的外部目录，防止错误绝对路径越出当前世界项目。
- 图片 Worker（工作执行器）统一使用已注册的 `gpt-image-2`；视觉注册回执包含清单路径与完整性 SHA-256，供后续发布链核验。
- Electron（桌面运行壳）在加载嵌入的 OpenCode Runtime（运行时）之前强制建立 NovelX Profile：配置、数据、状态、缓存、桌面数据、浏览器会话与日志分别落入 NovelX 目录。
- 独立 Provider 配置使用 `openai-compatible/gpt-5.6-luna` 与 `gpt-image-2`，API Key（接口密钥）只通过 `NOVELX_PROXY3_API_KEY` 环境变量读取，没有写入源码、配置、测试、文档或 Git 历史。
- 原 OpenCode 配置文件保持不变。原 Session（会话）数据库通过 SQLite Backup API（备份接口）复制到 NovelX 数据根，原文件保留；NovelX 数据库完整性检查为 `ok`，包含目标根会话。
- 禁止首次启动时导入上游 OpenCode Tauri 状态，避免旧窗口、项目和模型配置污染 NovelX 新档案。应用名、Windows App User Model ID（应用用户模型标识）和页面标题改为 NovelX。

## 真实运行证据

Live 世界目录：`D:\CodexW\NovelX_Desktop\work\NovelX-World-Tech-Live-20260719-1`

世界题材：原创经典中世纪大世界奇幻，不使用托尔金专有名词。

世界物化：

- 状态：`completed`
- 文档：27/27 `committed`
- 记忆检查点：5
- 完整性 SHA-256：`338ca6cb1ebbd7ebf51f3d9cf7aca5d97074cf63ddb5cdc3a7bc3f8ec19fee1f`

视觉清单：

- 状态：`ready`
- 地块：72
- 空间投影：12
- 图片：8/8 `attached`
- 完整性 SHA-256：`086e4fa5d368e7a06651d0384669126ff035f5c01dc773c0319c712dc81563f3`

玩家发布：

- 状态：`ready`
- 图志：27
- 纪行：3
- 完整性 SHA-256：`b83470aee49c762372c1dde7bfe47c87bd337703cb634dd2ac37ec631f00d5ac`

NovelX Profile：

- Provider 配置：`C:\Users\16014\AppData\Roaming\NovelX\config\opencode.json`
- Runtime 数据：`C:\Users\16014\AppData\Local\NovelX\data`
- Runtime 状态：`C:\Users\16014\AppData\Local\NovelX\state`
- Runtime 缓存：`C:\Users\16014\AppData\Local\NovelX\cache`
- Session 数据库：`C:\Users\16014\AppData\Local\NovelX\data\opencode\novelx.db`
- Electron 用户数据：`C:\Users\16014\AppData\Roaming\NovelX\desktop`
- Electron 会话：`C:\Users\16014\AppData\Local\NovelX\session`
- Electron 日志：`C:\Users\16014\AppData\Local\NovelX\logs`
- 数据库大小：79,175,680 字节；`integrity_check=ok`；200 个会话；目标根会话 1 条。
- 当前没有生成 `auth.json`，因为密钥来自环境变量；嵌入运行时的认证仓储由 `Global.Path.data` 决定，未来认证写入会进入 NovelX 数据根，而不是 OpenCode 数据根。

正式 Electron 已使用上述独立 Profile 打开同一根会话和同一 Live 世界。运行证据包括：进程产品名 `NovelX Dev`、App User Model ID `ai.novelx.desktop.dev`、页面标题 `NovelX`、NovelX 用户数据目录、Sidecar（伴随进程）读取 NovelX 配置，以及界面实际显示 27/27 档案和真实地图。桌面截图 `C:\Users\16014\Desktop\NovelX-正式预览.png` 为 1920×1080，来自该真实 Electron 页面，不是设计稿或 Fixture。

## 验收

- `packages/opencode`：`bun test test/tool/novelx-register-world-visuals.test.ts test/novelx/world-image-queue.test.ts test/agent/agent.test.ts`，53 项通过、0 失败、219 次断言。
- `packages/opencode`：`bun typecheck` 通过。
- `packages/app`：`bun test src/context/novelx-world-growth.test.ts src/pages/session/novelx-workspace-model.test.ts`，8 项通过、0 失败、22 次断言。
- `packages/app`：`bun typecheck` 与生产构建通过；构建 2572 个模块，仅保留既有 Vite 和分块警告。
- `packages/desktop`：`bun test src/main/novelx-profile.test.ts src/main/index.test.ts`，4 项通过、0 失败、17 次断言。
- `packages/desktop`：`bun typecheck` 与生产构建通过；主进程 42 个模块、Renderer（渲染进程）2594 个模块，仅保留既有 `eval`、动态导入、sourcemap 和大分块警告。
- 正式 Electron 真实启动、退出/重启、Sidecar 配置加载、数据库读取与地图页面投影已经验证。
- 没有运行整个 OpenCode monorepo（单体仓库）的全量测试；以上是定向测试、生产构建、真实 Provider、磁盘账本和正式 Electron 证据。

## 未完成与冻结项

- 故事、角色、图谱检索、世界包导出、个体图、章节/历史书封面和世界包封面不属于本批，未实现或未验收。
- 当前世界只实现地图与风貌两类视觉；用户接受、重生成和版本比较界面仍未实现。
- 本批完成的是 NovelX 存储与模型配置边界的独立。OpenCode Runtime 仍按产品决定作为内核；上游内部包名、部分协议名、自动更新元数据和构建产物品牌尚未全部 NovelX 化，不能把本结果描述为代码来源或发行协议层面的“完全脱离 OpenCode”。这些变化会影响公开协议和更新兼容性，需要单独产品决策。
- 独立数据库目前是迁移快照，不是对原 OpenCode 数据的持续同步；后续 NovelX 与 OpenCode 会分别演进。
- 没有进行图片像素级计算机视觉反向比对。现有证据能证明语义蒙版、账本哈希、区域高亮和标签投影一致，不能证明位图每个细节都严格服从地理分区。

## 风险与恢复入口

- 当前图志虽然已经可用且无内部工作痕迹，但抽样仍偏事实说明书，尚未稳定达到《中国国家地理》式自然叙事；纪行的个人观察体更接近目标。该问题属于文风质量，不影响数据与运行闭环，但会影响最终比赛呈现。
- 新 Profile 首次启动时的 `opencode://open-project` Deep Link（深层链接）存在事件到达早于 Renderer 订阅、导致自动打开被遗漏的风险。本次正式预览通过真实 Electron IPC（进程间通信）写入 NovelX 自己的持久状态后恢复到目标会话，不是伪造数据；但首次深链竞态尚未修复。
- Provider 与图片端点仍是外部可信边界，可能发生额度、超时和连接关闭；队列已证明可恢复且不会重复挂载成功任务，但不能宣称所有网络故障都能无人值守恢复。
- 世界恢复入口：`.novelx\growth\world-blueprint.json`、`.novelx\growth\world-materialization.json`、`.novelx\visuals\world-visuals.json`、`.novelx\publication\world-publication.json`。
- Profile 恢复入口：`packages/desktop/src/main/novelx-profile.ts`、`packages/desktop/src/main/index.ts`；原 OpenCode 配置和数据库仍保留，可独立回溯。
- 当前 Git 远端只有上游 OpenCode 仓库，没有验证可写的 NovelX 远端；本批只保证本地 `novelx-ui` 提交，不声称已推送。
