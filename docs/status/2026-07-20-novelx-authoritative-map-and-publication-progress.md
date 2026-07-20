# NovelX 权威地图与玩家文稿进度状态

> 本文件记录 2026-07-20 的 Provider 阻塞现场，已由 [`2026-07-21-novelx-world-live-and-independent-profile.md`](./2026-07-21-novelx-world-live-and-independent-profile.md) 取代。后续状态已经完成同一根会话的世界、视觉、玩家发布与 NovelX 独立 Profile（运行档案）验收；不得继续把本文件的“12/27、Provider 阻塞”描述为当前状态。

日期：2026-07-20

项目目录：`D:\CodexW\NovelX_Desktop\work\opencode-novelx`

分支：`novelx-ui`

实现提交：`2042629`、`4edf88d`、`aae2d3f`

运行故障修复提交：`f4ae9ef`

当前状态：代码冻结并通过定向验证；真实 Provider（模型服务）完整重跑尚未完成，不得把本文件描述为整个批次已经闭环。

## 已完成

- Atlas V2 建立 `area / line / point` 空间合同：同一自然层级的面状区域唯一归属，父区域由子区域并集计算；线和点不占用面状地块。
- Harness（智能体运行框架）从权威地块集合计算外轮廓、去除内部泰森裂缝、生成位于实际区域内的标签点，并拒绝旧 V1 合同的猜测迁移。
- 地图交互实现三态：首次点击只高亮；再次点击同一区域按实际包围盒放大并打开右侧详情；第三次点击恢复全图。点击其他区域会切换为新区域的单次高亮状态。
- 完成状态的世界导航只投影层面和实体，不显示 Growth 总主编、阶段主编、执行 Agent、锁、来源哈希或推演合同。
- 新增独立玩家发布层：每个正式世界实体一篇图志，每个奇观额外一篇纪行；发布文件不覆盖内部权威原文。
- 发布提交拒绝内部生产字段，纪行必须有署名；完成地图右侧详情读取玩家图志/纪行，不再打开内部 `事实依据 / 因果推演` 原文。
- 完成态世界存在旧 `skeleton.json` 时不再回退显示旧地理检查器，玩家界面不会同时暴露两代 Agent 工作投影；同一实体同时具有自然和人文投影时，详情严格跟随当前地图图层解析。
- 修复真实运行发现的任务错误：子会话收到 Provider 403 时不再返回空的 `completed`，而是以 `NOVELX_TASK_PROVIDER_FAILURE` 失败关闭；NovelX 叶子同时最多执行两个，避免六路同时预扣额度。

## 真实运行证据

被覆盖的 Live 目录：`D:\CodexW\NovelX_Desktop\work\NovelX-World-Tech-Live-20260719-1`

模型：`openai-compatible/gpt-5.6-luna`

根会话：`ses_080033772ffefVX3XpfK81j4vo`

题材：原创经典中世纪大世界奇幻，不使用托尔金专有名词。

真实 Provider 已完成并封存：

- 自然基底：6 个实体、6 份正式内部档案。
- 栖居网络：6 个实体、6 份正式内部档案。
- 2 个权威记忆检查点已经实际触发并恢复。
- 权力与交换：6 个实体已经注册，但 6 份文档仍为 `leased`，没有提交。

当前物化状态为 `running`：共 18 个文档记录，其中 12 个 `committed`、6 个 `leased`。第四、第五阶段仍为 `planned`。

第三阶段首次并行调用时，三个叶子被上游 `jmrai.net/v1/chat/completions` 以 `403 insufficient_user_quota` 拒绝，一个本地子任务停在运行状态。停止精确 Growth 进程后，代码修复使同类错误正确失败关闭。随后三次从原根会话恢复均再次被真实 Provider 拒绝：

- 剩余额度 `0.230762`，恢复阶段主编需要预扣 `0.714956`。
- 再次核验时剩余额度 `0.163140`，根恢复消息需要预扣 `0.204924`。
- 本次冻结代码后的恢复仍剩余 `0.163140`，根恢复消息需要预扣 `0.205164`；账本仍为 12 个 `committed`、6 个 `leased`，没有产生第二条根 Growth。

没有用 Fixture（测试夹具）、模板、本地确定性文本或空结果补齐失败文档。所有 Growth 进程均已退出，没有留下并发恢复进程。

## 验收

冻结代码执行结果：

- Schema、OpenCode、App、Desktop 四个包 `typecheck` 全部通过。
- OpenCode Agent、任务门禁、Atlas V2 与发布层：82 项通过、0 失败、325 次断言。
- App 地图与发布投影：4 项通过、0 失败、13 次断言；覆盖三态状态机、区域解析、河流不抢占地块和旧 V1 失败关闭。
- App 生产构建通过：2572 个模块。
- Desktop 生产构建通过：主进程 42 个模块、Renderer（渲染进程）2594 个模块；保留既有动态导入、源码 `eval`、sourcemap 覆盖和大分块警告。
- Playwright NovelX workspace 回归：1 项通过、0 失败，用时 55.7 秒；覆盖运行态切换完成态、旧 Agent 检查器隔离、地图二进制加载、地理三次点击、图志/纪行切换和国家图层详情解析。该测试使用 Mock Server（模拟服务），只证明界面投影与交互边界，不作为真实 Provider 或正式 Electron Live 证据。

没有运行整个 OpenCode monorepo（单体仓库）的全量测试。

## 未完成

- 权力与交换、信念与奥秘秩序、世界奇观三部分尚未写完或封存。
- Atlas V2 尚未由本次中世纪 Live 的真实实体注册，地图与风貌图片队列尚未建立。
- 图志与纪行尚未由真实 Provider 生成，因此还不能执行玩家文稿全文泄漏扫描。
- 正式 Electron 尚未打开本次完成态 Live 验证地图三态、自然/人文切换和无内部痕迹。
- `C:\Users\16014\Desktop\NovelX-正式预览.png` 尚未用本批最终界面覆盖。
- 最终状态文档、Live 哈希、图片模型/任务数量和交付提交只能在上述证据真实存在后补写。

## 风险与恢复入口

- 当前唯一硬阻塞是指定 Provider 账户额度不足。额度恢复前继续调用只会产生新的 403，不能靠降低叶子并发解决根/阶段主编的上下文预扣需求。
- 恢复时必须继续同一根会话与同一 Live 目录，禁止重新创建世界或覆盖已提交的 12 份档案。
- 权威恢复文件：`.novelx\growth\world-blueprint.json`、`.novelx\growth\world-materialization.json`。
- 根会话：`ses_080033772ffefVX3XpfK81j4vo`；第三阶段编辑会话：`ses_07fef3839ffeAtUidZ5gwxBpaE`。
- 额度恢复后的首条操作应使用 `--session ses_080033772ffefVX3XpfK81j4vo --agent growth --model openai-compatible/gpt-5.6-luna`，由权威账本恢复未提交租约；不得并行启动第二条根 Growth。
- 图片仍存在像素级拓扑风险：Atlas V2 与 UI 能证明语义蒙版和可点击几何一致，但在完成真实地图后仍需明确记录没有计算机视觉反向证明 raster（位图）细节完全服从分区。
