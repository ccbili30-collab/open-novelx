# NovelX 地图状态图批次

日期：2026-07-23

分支：`codex/novelx-map-variants`

工作树：`D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-variants`

基线：`b974ed8124c013f7ee6893ade70596b5bc32ce6d`

## 已完成

- Atlas V3 将一张共享底图、地理高亮状态图和人文高亮状态图定义为同一个权威地图集合；Atlas V2 继续可读，但旧项目不会凭空获得状态图。
- Harness（智能体运行框架）依据已经封存的 Atlas 面实体自动派生状态图任务。Agent 只负责世界事实和视觉语言，不逐张登记文件、路径或 Prompt。
- 每个地理或人文面实体恰好对应一张完整地图状态图；线和点实体不生成状态图。地理层与人文层共用同一底图，但分别保存实体绑定、点击区域和文档跳转目标。
- 图片队列先生成底图；状态图必须读取已经挂载的同一底图作为图生图输入，不能重新读取语义蒙版。缺少底图时明确失败关闭，不会伪造成功。
- 前端保留隐藏的泰森/Atlas 几何作为点击、标签、缩放和跳转依据，不再显示选区色块或边界。首次点击切换完整状态图，第二次点击放大并打开详情，第三次返回底图。
- 某张状态图缺失或失败时只回退显示真实底图；其他成功状态图和 Growth 文字终态不受影响。

## 提交

- `493cd70ae` `feat(novelx): derive authoritative map variant sets`
- `f851b2e5d` `feat(novelx): generate map variants from shared raster`
- `1afcd39e1` `feat(novelx): switch map rasters through hidden atlas hits`

## 验收

### 定向与扩展测试

- OpenCode NovelX 测试集合：`60 pass / 0 fail / 250 expect / 16 files`。
- App 地图上下文测试：`4 pass / 20 expect`。
- Playwright 工作台场景：`1 passed`，验证底图、地理状态图、人文状态图、三段点击状态，以及隐藏面区域不绘制填充和描边。
- Schema、OpenCode、App、App E2E 和 Desktop 类型检查均通过。
- App 生产构建通过，转换 `2592` 个模块。
- Desktop 生产构建通过，主进程转换 `44` 个模块，Renderer 转换 `2614` 个模块；命令退出码为 `0`。

Playwright 使用 Mock Server（模拟服务），本批没有调用真实 Provider（模型服务），因此以上结果不是 Live（真实运行）生图证据。没有执行全仓库测试，也没有覆盖安装或启动用户正在使用的 NovelX。

## 联合接入边界

- 等另一条 Growth 联合链稳定后，从本分支选择性合入上述三个功能提交和本状态提交。
- `world-image-queue.ts` 是预期冲突点：另一条线正在整理 Provider 与非阻塞视觉队列。合并时保留其传输和调度边界，只移植 `world-map-variant.ts` 中“底图/状态图输入解析”的领域规则及对应测试。
- 不改变世界事实、图志纪行、人物、小说、图谱、项目管理和普通 OpenCode 会话语义。
- 图片任务继续异步运行；状态图 `pending`、`generating` 或 `failed` 都不得阻止文字链进入 `text_completed`。

## 未完成与风险

- 尚未用真实世界和真实图生图接口生成“一张底图 + 一组地理状态图 + 一组人文状态图”。联合头完成后必须补做这一项 Live 验收，并人工检查允许的小幅漂移是否仍落在隐藏点击区域的容差内。
- 当前前端沿用既有资源加载器，会预载已经挂载的状态图。合同最多允许 `64` 个面实体；大型项目可能产生较高显存或内存占用，后续需要基于真实项目数据决定是否改为活动层预载和邻近状态缓存。
- `bun install --frozen-lockfile` 在该深层 Windows 工作树中触发 `tree-sitter-powershell` 的 `node-gyp` 长路径失败；已有包级依赖链接足以完成本批测试、类型检查和构建，但这不是一次干净的全新依赖安装验收。
- 仓库没有可用的 Android 构建目标，因此本批没有生成 APK。

## 恢复入口

联合链完成后，从 `codex/novelx-map-variants` 检查 `world-image-queue.ts` 与新 Provider 边界的差异，先合并合同/编译器，再合并共享底图输入解析，最后合并前端状态图切换。完成冲突处理后重新运行本文件列出的测试、桌面构建和一次真实 Provider 地图验收。
