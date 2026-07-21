# NovelX Desktop

NovelX Desktop 是一个面向小说、世界观与原创角色的 Agent-native（智能体原生）创作工作台。它复用 OpenCode Runtime（运行时）的会话、模型与工具能力，在此之上建立 NovelX 自己的中文桌面界面、Growth（生长）编排、世界档案、地图、风貌与故事工作区。

> 当前仓库是黑客松开发线，不是稳定发行版。README 只描述已有代码和已留档的真实运行证据；设计稿、Mock（模拟）与测试夹具不计为 Live（真实运行）。

## 当前状态

| 能力 | 当前证据 |
| --- | --- |
| 世界 Growth | 已使用真实 Provider（模型服务）完成一次五阶段世界生长，提交 27/27 份内部档案与 5 个记忆检查点 |
| 地图与风貌 | 已真实生成并挂载 1 张世界地图、4 张首府或核心风貌、3 张奇观风貌；72 个地块与 12 个自然/人文投影共用权威账本 |
| 世界发布层 | 已生成 27 篇图志与 3 篇纪行，并与内部生产资料分离 |
| 故事正文 | Story Growth 的正文物化链已有完成产物，小说、历史与文献可在故事工作区投影 |
| 故事封面 | 编排、合同和失败关闭路径已实现；新链尚未通过真实图片 Provider 与正式 Electron 验收，因此不标记为 Live |
| 角色、图谱与世界包 | 尚未形成当前黑客松线的完整真实闭环 |

详细证据与限制见：

- [世界 Growth、地图、风貌与独立 Profile 验收](docs/status/2026-07-21-novelx-world-live-and-independent-profile.md)
- [故事封面编排的当前 Live 边界](docs/status/2026-07-22-novelx-story-visual-orchestration-reset.md)

## 本地运行

当前开发环境以 Windows、PowerShell 和 [Bun](https://bun.sh/) 为主。

```powershell
git clone https://github.com/ccbili30-collab/open-novelx.git
Set-Location open-novelx
bun install
bun run dev:desktop
```

Agent 与图片能力必须使用 NovelX 独立 Profile 中配置的真实 Provider。没有有效配置时，相关能力应失败关闭，不会用本地模板冒充模型结果。凭据不得写入源码、提交或文档。

## 开发路线

- `codex/novelx-content-growth`：默认分支，承载世界与故事 Growth、文件/故事工作区及当前公开状态。
- `codex/novelx-visual-runtime`：视觉运行链的并行开发入口；同步提交后仍保留独立分支边界。

这是一个仍在快速迭代的 monorepo（单体仓库）。上游的部分内部包名、协议名与构建标识仍保留 `opencode`，以避免在尚未完成兼容性审查前破坏 Runtime；它们不是 NovelX 的产品名称。

## 上游与许可证

NovelX Desktop 基于 [OpenCode](https://github.com/anomalyco/opencode) 开发，但它是独立项目，与 OpenCode 团队没有隶属、赞助或背书关系。上游来源、兼容性边界和保留标识说明见 [UPSTREAM.md](UPSTREAM.md)。

本仓库沿用上游的 [MIT License](LICENSE)，并保留原始版权与许可声明。
