# NovelX Story 视觉编排回退批次

日期：2026-07-22

项目：`D:\CodexW\NovelX_Desktop\work\opencode-novelx`

分支：`novelx-ui`

## 当前范围

本批只回退并重做 Story Growth 的封面编排，不修改已经完成的世界正文、故事正文、地图/风貌合同或 Renderer（渲染器）页面。

## 已实现

- 删除重复的 `novelx-cover-editor` 角色。Growth 总主编不再直接派发封面 Agent（智能体），也不编写图片 Prompt（提示词）。
- Story 主编封存正文后，必须在返回 Growth 前分裂既有 `novelx-visual-editor` 视觉工具分身。
- 视觉工具分身读取本阶段封存原文，复用既有世界视觉语言，为小说、每本历史书和小说主题各提交一条最终 Prompt。
- Story Cover Manifest（故事封面清单）直接保存每个任务的一条最终 Prompt；Harness（智能体运行框架）不再追加第二段作品 Prompt 或重新拼接视觉 Prompt。
- Image Worker（图片工作进程）只读取已冻结 Prompt、调用 Provider（模型服务）、验证和挂载；状态迁移与自动重试不会改写 Prompt。
- 删除 `novelx_retry_story_covers` 与 `novelx_resume_story_cover_queue` 两个暴露给模型的补丁式工具。既有非终态清单仍由同一个注册入口恢复 Runtime（运行时）后台任务。
- Growth 路由会完整校验 Story Cover Manifest，不再只读取一个未经验证的 `status` 字段。

## 验收

- `packages/opencode`: `bun test test/novelx/story-visual.test.ts test/agent/agent.test.ts test/tool/registry.test.ts`：73 项通过，0 失败，300 个断言。
- `packages/opencode`: `bun test test/tool/task.test.ts test/novelx/world-visual.test.ts test/novelx/story-materialization.test.ts`：33 项通过，0 失败，128 个断言。
- `packages/opencode`: `bun typecheck`：通过。
- `packages/schema`: `bun typecheck`：通过。
- `packages/app`: `bun typecheck`：通过。
- `git diff --check`：通过。
- 本批未调用真实 Provider，未生成新图片，也未进行正式 Electron（桌面运行壳）验收。

## Live 状态与恢复入口

- 现有 Story 正文仍为 `text_completed`，完整性 SHA-256：`78cba032ffe4922894811c6617f53fac3cb0f1a08fb540066c13b3f85192ab12`。
- 原 `.novelx/visuals/story-covers.json` 属于已撤销的独立 Cover Editor 编排，状态为 `failed`、4 个任务、`retryCount: 1`。该清单及其唯一旧上下文已定点移入 `C:\Users\16014\AppData\Local\NovelX\cleanup-backups\story-visual-orchestration-reset-20260722-013104`；Story 正文和世界视觉文件保持原位，可完整恢复旧证据。
- 世界视觉清单仍为 `ready`，可作为 Story 工具分身必须复用的共享视觉语言来源。

## 未完成与风险

- 新编排尚未通过真实 Provider 和正式 Electron/Node Runtime 跑出一张封面，不能标记为 Live。
- 新 v2 封面清单尚未由视觉工具分身写入；当前 Live 会诚实显示封面尚未生成，不会把旧失败清单误报成新链完成。
- Bun 长耗时大图片响应的连接问题不在本批修复范围；下一批必须在正式 Electron/Node Runtime 中以单张封面做传输冒烟测试，再恢复剩余任务。
