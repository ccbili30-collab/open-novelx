# NovelX Growth 自动骨架注册批次状态

## 来源与边界

- 分支：`novelx-ui`。
- 实现提交：`2b6256104d8766fad51aef37054717b067c99c88`。
- 本批只实现 OpenCode 内核改版上的 `/growth` 首阶段：真实 Provider（模型服务）完成题材与规模自询，Harness（智能体运行框架）注册六个工作面的空骨架，NovelX 桌面读取并展示同一份计划清单。
- 没有接入旧 NovelX Growth Runtime（运行时），没有生成世界事实、角色、关系、正文或图片，也没有把计划节点冒充成正式文件或 Canon（正史）。

## 已实现

- 新增共享 `NovelXGrowth` Schema（数据合同），分离模型可提交的 `Profile` 与 Harness 持久化的 `Manifest`（清单）。
- Harness 校验题材层级、父子拓扑、同级唯一性、槽位数量、总文件规模和 Windows 安全路径，并确定性生成 ID、标准章节名、文件规划与世界包区段。
- 权威清单固定为 `.novelx/growth/skeleton.json`；首次写入使用独占创建，相同规格跨回合重放幂等，不同规格覆盖、同回合重复调用、损坏清单和完整性哈希不匹配均失败关闭。
- 新增隐藏的内置 `growth` Agent（智能体）与不可被项目配置覆盖的 `/growth` 命令。该 Agent 只可调用 `novelx_register_growth_skeleton`，不能获得普通文件写入、Shell、子任务或图片工具。
- 成功注册后，Harness 从下一 Provider Turn（模型回合）移除全部工具，阻止模型重复执行；若首次注册失败，仍允许在同一用户回合修正规格。
- 六个工作面都从同一清单投影：文件显示待物化路径，世界与角色显示待填充槽位，图谱显示空查询视图，故事显示平铺标准空章节，世界包显示待完成区段。
- UI 在读取清单前校验 Profile 与整体 SHA-256；缺失清单沿用空状态，损坏清单显示明确错误，不使用本地模板降级。
- 计划节点只提供后续职责与路径，不可编辑；正式文件仍走原有编辑器，未保存文件会阻止切换到计划节点。
- `.novelx` 内部目录不进入默认文件视图；尚未物化的 `World`、`Characters`、`Story` 等目录不会触发伪文件树请求。
- 正式桌面预览已覆盖：`C:\Users\16014\Desktop\NovelX-正式预览.png`。

## 真实 Provider 与 Electron 证据

- 当前源码使用 `openai-compatible/gpt-5.4` 在 `D:\CodexW\NovelX_Desktop\work\NovelX-Growth-Live-4` 执行：

```powershell
bun run --conditions=browser ./src/index.ts run `
  --command growth `
  --model openai-compatible/gpt-5.4 `
  --dir D:\CodexW\NovelX_Desktop\work\NovelX-Growth-Live-4 `
  --auto --format json `
  '创建一个经典的中土式大陆级大世界幻想项目，只注册六个工作面的空骨架，不生成任何正式内容。'
```

- 运行只出现一次成功的 `novelx_register_growth_skeleton` 工具调用，随后模型输出中文摘要并停止，没有第二次工具调用或最大步数污染。
- 注册结果：世界 `10` 层、`112` 个槽位；角色 `8` 组、`82` 个槽位；图谱 `6` 个空视图；故事 `30` 个标准空章节；共 `236` 个待物化路径。
- Live 项目实际只有 `.novelx\growth\skeleton.json` 一个文件，没有正式世界文件、正文、图片或计划路径实体。
- 最终桌面全构建后重启 Electron，打开 Live-4 的世界页，实际投影 `122` 个导航项（`10` 个结构层与 `112` 个槽位）；`.novelx` 可见次数为 `0`，骨架错误为 `0`，目录列出错误为 `0`。
- 指定不存在的 `missing-provider/no-model` 在全新目录运行时退出码为 `1`，文件数量为 `0`，证明没有 Provider 时不会用本地模板制造伪 Live（真实运行）结果。

## 验收

- `packages/schema: bun run typecheck`：通过。
- `packages/opencode: bun run typecheck`：通过。
- OpenCode 冻结前相关套件：`73/73` 通过，`196` 个断言；覆盖 Agent 权限、内置命令防覆盖、编译器、注册工具、Tool Registry（工具注册表）与单终态门禁。
- 单终态失败恢复调整后：Growth loop `3/3` 通过；注册工具 `4/4` 通过。注册工具套件首次以默认 `5s` 超时运行时，第二个 Test Instance（测试实例）在 `5.01s` 超时；检查后以 `20s` 上限重跑，同一用例 `3.94s` 通过，未出现断言或生产逻辑失败。
- `packages/app: bun run typecheck` 与 `bun run typecheck:e2e`：通过。
- App 单元测试：`652/652` 通过，`1692` 个断言；浏览器逻辑测试：`30/30` 通过，`69` 个断言。
- Growth 投影定向测试：`2/2` 通过。
- `packages/app: bunx playwright test e2e/regression/novelx-workspace.spec.ts`：`1/1` 通过；覆盖六入口、哈希有效清单、世界计划树、计划节点切换和原有正式文件编辑。
- `packages/app: bun run build`：通过，`2566` 个模块转换完成。
- `packages/desktop: bun run typecheck`：通过。
- `packages/desktop: bun run build`：最终全构建通过；本地 OpenCode sidecar、主进程、preload 与 `2588` 模块 renderer 均已生成。
- 没有运行整个 Monorepo（单仓多包仓库）全量测试；以上为本批相关核心套件、App 全量单元/浏览器逻辑测试、定向 E2E 与生产构建。

## 未完成

- 本批闭合的是“自动注册道路”，不是后续内容生长。尚未实现按槽位派发多个 Agent、因果推演、正式文件物化、Agent 流式编辑锁、暂停/恢复和版本化 Change Set（变更集）。
- 尚未实现骨架修订、删除或重新规划；已有不同规格时会明确冲突，用户需要后续产品决策才能改变骨架。
- 图谱目前只是待建查询视图，不含事实节点、关系索引或图检索。
- 世界包目前只是区段规划，不含封面生成、内容聚合或导出。
- 没有新增图片生成能力；`WorldPackage/cover.png` 只是待物化路径规划。
- 没有修改 OpenCode 公共 HTTP 协议、数据库 Schema 或旧 NovelX Runtime。

## 风险

- Harness 能约束数量、拓扑与安全边界，但不能证明 Provider 选择的层级在文学上一定优秀；Live-4 只证明经典大陆幻想题材真实跑通，科幻差异目前由编译器测试覆盖，尚未另做真实 Provider Live。
- 不存在 Provider 时虽然零副作用失败关闭，但当前 CLI 把模型解析失败显示成通用 `Unexpected server error`，没有暴露 Provider 专用错误码。这是既有命令错误投影的可诊断性债务，本批没有扩大范围修改公共错误协议。
- 单一权威清单避免了假多文件事务，但也意味着后续物化阶段必须继续以该清单为道路来源；不能绕过它直接把零散文件当成完整 Growth 状态。
- 生产构建仍保留上游已有的 `eval`、动态/静态重复导入、同名 sourcemap 和大 chunk 警告；本批没有把这些警告误报为已解决。

## 恢复入口

- 产品边界：`docs/plans/2026-07-19-novelx-growth-skeleton-design.md`。
- 实施计划：`docs/plans/2026-07-19-novelx-growth-skeleton.md`。
- 共享合同：`packages/schema/src/novelx-growth.ts`。
- 确定性编译器与单终态门禁：`packages/opencode/src/novelx/growth-skeleton.ts`、`packages/opencode/src/novelx/growth-loop.ts`。
- 注册工具：`packages/opencode/src/tool/novelx-growth-skeleton.ts`。
- Growth Agent 与命令：`packages/opencode/src/agent/agent.ts`、`packages/opencode/src/command/index.ts`。
- 六工作面投影：`packages/app/src/context/novelx-growth-skeleton.ts`、`packages/app/src/pages/session/novelx-resource-workspace.tsx`。
- 真实验收项目：`D:\CodexW\NovelX_Desktop\work\NovelX-Growth-Live-4`。
