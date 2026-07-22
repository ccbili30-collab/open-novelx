# NovelX Growth 联合链恢复与展示路线状态（2026-07-23）

## 本批范围

本批只处理联合工作树中的 Growth（生长）路线恢复、世界视觉登记放宽、人物与故事后续路由，以及正式 Windows 安装包覆盖。不处理世界包，不等待图片生成，不修改并行 Study（学习）路线。

## 已实现

- Growth 专属 Agent（智能体）在明确的传输中断错误上可继续重试；普通会话不继承该行为。
- 世界事实完成后不再因跨层父级或缺少首都图而卡死视觉登记：非法展示父级被规范为空，必要的人文实体可登记徽记任务作为展示兜底。
- 世界结束后仍保留 Growth 根路由，使其继续进入图志与纪行、人物、小说和视觉登记。
- Growth 创建的视觉子会话按提示词前缀获得最小工具权限：世界视觉、人物立绘、故事封面彼此隔离。
- 世界、人物与故事文字状态和视觉状态解耦。视觉任务排队或失败不阻塞文字链完成，也不使用 Fixture（测试夹具）或假图冒充真实结果。
- 缺失可选 Story（故事）目录时，桌面工作区显示空态，不再抛出服务器错误。

## 真实 Provider 验收

Provider（模型服务）：`openai-compatible/gpt-5.6-luna`

项目：`D:\CodexW\NovelX_Desktop\work\NovelX-Growth-Medieval-Live-20260723-1`

根会话：`ses_0752cd317ffeE5l4Dy2fQhRZZp`

同一根会话恢复后得到：

- 世界物化状态 `completed`，4 个阶段，23 份正式世界档案。
- 世界出版投影状态 `ready`，23 篇图志和 1 篇纪行，共 24 条记录。
- 唯一主角“岚砾”档案状态 `text_completed`。
- 小说《盐痕未名》状态 `text_completed`，主题“姓名与活水”，三章均已提交。
- 世界视觉清单状态 `queued`，1 个地图任务与 8 个风貌任务；泰森语义蒙版已落盘。
- 人物立绘清单状态 `queued`。
- 小说封面清单状态 `queued`，共 2 个封面任务。
- 最终 `novelx_route_growth` 返回 `route: complete`、`nextAgent: null`。

本轮设置 `NOVELX_IMAGE_QUEUE_MODE=hold`，因此没有真实图片返回，也没有图片被标记为 `ready` 或 `attached`。

## 自动化验收

执行：

```text
bun test --timeout 20000 test/novelx/growth-loop.test.ts test/novelx/world-visual.test.ts test/tool/task.test.ts test/session/retry.test.ts test/novelx/growth-agent.test.ts
```

结果：71 通过，0 失败，190 个断言。

补充执行包含 compaction（上下文压缩）的扩大定向套件：123 通过、1 跳过、1 失败。唯一失败为既有 Windows 时序断言 `stops quickly when aborted during retry backoff`：要求中断少于 250ms，本工作树测得 631ms；在未包含本批修改的 `codex/novelx-bugfix` 基线上同一测试也失败并测得 514ms。因此它不是本批引入的功能回归，但仍是未解决的 Windows 测试债，本批没有通过放宽阈值掩盖。

App（应用）资源投影定向测试：16 通过，0 失败，34 个断言。

另执行：

- `packages/opencode`: `bun run typecheck`，通过。
- `packages/desktop`: `bun run typecheck`，通过。
- `packages/desktop`: `OPENCODE_CHANNEL=prod bun run build`，通过。
- `packages/desktop`: `OPENCODE_CHANNEL=prod bun run package:win`，通过。
- 正式安装包静默安装返回码 0，安装后的 `NovelX.exe` 已启动并保持运行。

未运行仓库全量测试。

## 当前限制与恢复入口

- 当前 Live（真实运行）项目是在原会话上恢复完成；故事封面清单通过正式 NovelX 工具补登记。下一次全新 `/growth` 尚未在修复后的联合头重新完整跑一遍。
- 图片仍在队列中，不能将本批描述为图片生成成功。
- 工作树同时存在其他线程的 Study 和图片 Provider 修改；本批未清理、未暂存、未提交这些文件。
- 新一轮完整验收应从正式安装的 NovelX 新建空项目，以一句 `/growth` 启动，并确认无需人工补登记即可到达 `route: complete`。
