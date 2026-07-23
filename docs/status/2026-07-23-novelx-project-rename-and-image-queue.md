# NovelX 项目改名与 Growth 图片队列

日期：2026-07-23

## 已实现

- 目录级项目改名进入统一项目展示投影，项目方块、名称和快捷入口使用同一份本地元数据。
- 本地元数据只覆盖 `global` 或尚未注册的项目，不覆盖正式项目数据库名称。
- 右侧“文件”图标旁增加固定长度的 Growth 图片任务轨道；未完成任务显示节点，`attached` 后移除。
- 点击轨道打开图片队列面板，显示地图、风貌、角色立绘和故事封面的真实任务状态。
- Growth 图片 Worker 支持进程重启后的自动恢复、完成当前图片后暂停、继续和失败任务重试。
- 暂停状态独立持久化在 `.novelx/visuals/queue-control.json`，不改变 Growth 文字链终态。
- 世界、人物和故事仍使用各自现有真实图片 Worker；前端不生成图片、不伪造完成状态。

## 明确边界

- Study 的 `visuals` 候选任务没有接入本批队列，不显示、不自动执行。
- 本批没有新增任务删除、跳过、排序或 Prompt 编辑。
- BackgroundJob（后台任务）仍是进程内执行注册表；持久化任务和暂停状态由项目文件负责，重新打开项目时由前端恢复 Worker。
- 没有使用真实 Provider（模型服务）进行本批代码验收；安装后真实项目会按已有 Provider 配置继续处理排队任务。

## 验收

- App 项目投影与图片任务投影：4 pass / 0 fail。
- 世界、角色立绘、故事封面状态机：10 pass / 0 fail。
- App、App E2E、OpenCode、SDK、Desktop 类型检查：通过。
- NovelX 工作台 Playwright E2E：1 pass，包含固定轨道、任务节点和队列面板截图。
- App 生产构建：通过。

## 恢复入口

- 项目展示投影：`packages/app/src/context/project-display.ts`
- 前端队列投影与控制：`packages/app/src/context/novelx-image-queue.ts`
- Growth 队列控制：`packages/opencode/src/novelx/image-queue-control.ts`
- 持久化暂停状态：`packages/opencode/src/novelx/image-queue-control-state.ts`
