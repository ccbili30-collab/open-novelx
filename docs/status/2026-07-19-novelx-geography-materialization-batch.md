# NovelX 地理子 Agent 物化批次

## 来源与边界

- 分支：`novelx-ui`。
- 实现提交：`8fed83f`（`feat(novelx): materialize geography with child agents`）。
- 唯一代码库：`D:\CodexW\NovelX_Desktop\work\opencode-novelx`；没有修改或接入旧 NovelX Runtime（运行时）。
- 本批只完成 `/growth` 的地理第一阶段：注册经典大陆地理骨架，把每个注册地形交给真实 `novelx-geography` 子 Agent，主编审核后提交正式地理文档。地图保持空白，不进入国家、文明、组织、角色、故事或图片阶段。

## 已实现

- 新增独立 Geography Materialization（地理物化）状态合同，保存骨架哈希、正式目标、草稿目标、租约、子会话、提交哈希、失败和等待用户状态；损坏状态或错误骨架失败关闭。
- Growth 主编只能使用注册、准备、固定地理子 Agent、提交、中止和结束工具；不能直接读写项目文件，也不能派发通用子 Agent。
- `novelx-geography` 是不可被项目配置覆盖的只读执行叶；不能写文件、派生 Agent 或进入下游阶段，只向 Growth 主编返回 Markdown（轻量标记文本）。
- Context Pack（上下文包）包含世界题材摘要、当前地形、父级、子级和已注册空间关系；子 Agent 必须输出事实依据、因果推演、地貌与空间、气候与生态、资源与通行、风险与限制、关系七个权威章节。
- 正式文件只由提交工具原子写入 `World/地理/<地形名>.md`；提交前正式目标不存在，提交后状态哈希与磁盘 SHA-256 一致并释放租约。
- 同一 Session/Call ID（会话/调用标识）的 Runtime（运行时）重复执行共享同一 Task 结果，不会重复创建子会话或再次调用 Provider（模型服务）；同一主编消息重复修订同一子会话也会被拒绝。
- 世界工作面投影真实物化状态和真实子会话文本：运行中可查看子 Agent 流式输出，待提交文件只读，已提交文件打开正式 Markdown；Atlas（世界图册）保持“地图尚未生成”，不再用注册坐标绘制假地图。

## 真实 Provider 与桌面证据

- Live（真实运行）目录：`D:\CodexW\NovelX_Desktop\work\NovelX-Geography-Live-6`。
- 模型：`openai-compatible/gpt-5.4`；CLI 总耗时约 `554.1s`。
- Growth 主编会话：`ses_08561f1bdffe7VjWsLnmxJ1LNT`。
- 8 个地理子会话：
  - 奥瑞辛大陆：`ses_085603dacffehHctEjvID1xULL`
  - 暮星外洋：`ses_0855bb731ffeL95BUoEfohJoCv`
  - 琥珀暖海：`ses_0855bb6f4ffeKtANPspEshguDW`
  - 寒冕山脊：`ses_0855bb6b8ffef6Kgw0aEN2WEIL`
  - 阿温河谷平原：`ses_0855bb67cffenyeXBmI61pKbSP`
  - 曙岩高原：`ses_0855bb641ffeCIRJ4pIUahLGbo`
  - 伊瑟尔长河：`ses_0855bb60fffeVwj6UuRq76P8ck`
  - 金潮南岸：`ses_0855bb5d2ffe9Bpl3ESw8HX55f`
- 8 个子会话最终正文均有 7 个权威章节，单篇约 `3395–5126` 字符；物化状态为 `completed`，8/8 记录为 `committed`，8 个子会话唯一，8 个正式文件的磁盘哈希与 `committedSha256` 全部一致。
- Live 目录没有国家、文明、组织、角色、故事、图片或地图资产，没有残留临时文件；`.novelx/growth/drafts` 保存 8 份审核来源，`World/地理` 保存 8 份正式档案。
- 生产构建后的 Electron（桌面运行壳）显式使用同一次 Live 所在的 `opencode-local.db`，打开上述主编会话并显示 8/8 提交、世界树、执行 Agent、已释放文件锁和空地图；正式预览已覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`。

真实运行命令：

```powershell
bun run --conditions=browser .\src\index.ts run `
  --command growth `
  --model openai-compatible/gpt-5.4 `
  --dir D:\CodexW\NovelX_Desktop\work\NovelX-Geography-Live-6 `
  --auto --format json `
  '创建一个经典中土式大世界：一块古老主大陆由北境冰川山系、中央河谷平原、东部高原和南方暖海共同塑造。只注册最小完整的八个具名地形，然后让地理子 Agent 为每个地形写出有事实依据和因果推演的详细档案。严格停在地理阶段，地图留空。'
```

## 回归定位记录

- Live-1 暴露并发状态写入截断和重复子会话；已改为进程内写互斥与同目录原子替换，并增加重复子会话门禁。
- Live-2 暴露同一主编消息重复恢复同一子会话；已增加消息/子会话调用门禁。
- Live-3 证明同一 Tool Call ID（工具调用标识）会被 Runtime 重放；已按主会话和 Call ID 缓存同一 Effect（副作用计算），并用并发测试证明只创建一个子会话、只产生一次 Provider 提示。
- Live-4 暴露主编自行发明审稿章节、把正确首稿改坏；已把七章合同固定为主编、子 Agent 和提交器的同一权威规则。
- Live-5 用于观察独立分支批量领取；该行为符合“独立执行叶可以继续”的产品合同，因此没有增加错误的全局单任务限制。该次在没有正式文件时停止。
- Live-6 完成最终真实闭环；没有人工补写文件、Fixture（测试夹具）或本地模板冒充 Live。

## 验收

- `packages/schema: bun run typecheck`：通过。
- `packages/opencode: bun run typecheck`：通过。
- OpenCode 相关套件合跑：`94 passed / 2 timed out / 300 expect()`；所有 NovelX 状态机、工具、Agent 权限、重复调用和完成门禁断言通过。两个超时分别是既有项目引用目录解析和旧 Zod 插件兼容加载；后者隔离运行 `1 passed`，前者隔离运行仍在固定 `5s` 门槛超时约 `5.76s`，未把本批定向通过写成全仓通过。
- `packages/app: bun run typecheck`、`bun run typecheck:e2e`：通过。
- App 状态投影单测：`1 passed / 0 failed / 3 expect()`。
- 世界工作面 Playwright（浏览器自动化）E2E：`1 passed / 0 failed`，约 `52.6s`。
- `packages/app: bun run build`：通过，转换 `2567` 个模块；保留既有动态导入、同名 sourcemap 和大 chunk 警告。
- `packages/desktop: bun run typecheck` 与 `bun run build`：通过；主进程、preload（预加载）和 renderer（渲染器）构建完成，桌面 renderer 转换 `2589` 个模块。
- 没有运行整个 Monorepo（单仓多包仓库）的全量测试，也没有打包安装器或验证更新链。

## 未完成与风险

- 国家、文明、种族、组织、角色、世界历史、故事、图片和后续因果生长均未实现，本批不得被称为完整 Growth。
- 地图仍是空状态；当前只保留注册坐标作为内部事实，不提供大陆图、王国内地图、星图或无限宇宙视图。
- 内部 Growth/地理 Agent 不能绕过提交器写正式文件，UI 在绑定子任务运行时只读；但尚无跨进程全局文件互斥，任意外部程序或普通 Build Agent 直接改磁盘不受该租约阻止。磁盘编辑的最终冲突保护仍依赖既有条件保存。
- Runtime 重放同一 Call ID 时副作用已幂等，但会话界面仍可能显示重复的工具活动标签；权威状态和正式文件不会重复。该显示去重不在本批范围。
- 文学质量仍由 Provider 决定；Harness 能验证结构、来源、状态和因果章节存在，不能证明每次命名与文风都同样优秀。
- 当前机器继续复用已缓存 Electron `43.1.0`，而仓库声明 `42.3.3`；本批证明构建产物可运行，不替代目标版本的发布安装验收。

## 恢复入口

- 物化合同：`packages/schema/src/novelx-growth.ts`。
- 状态机与 Context Pack：`packages/opencode/src/novelx/geography-materialization.ts`。
- 原子持久化：`packages/opencode/src/tool/novelx-geography-runtime.ts`。
- 子 Agent 调度：`packages/opencode/src/tool/task.ts` 与 `packages/opencode/src/agent/agent.ts`。
- 桌面投影：`packages/app/src/context/novelx-geography-materialization.ts` 与 `packages/app/src/pages/session/novelx-resource-workspace.tsx`。
- 实施计划：`docs/plans/2026-07-19-novelx-geography-materialization.md`。
