<p align="center">
  <a href="https://ccbili30-collab.github.io/open-novelx/">
    <img src="packages/desktop/icons/prod/icon.png" width="128" alt="NovelX logo">
  </a>
</p>

<h1 align="center">NovelX</h1>

<p align="center">让世界、角色与故事在同一个工作台里生长。</p>

<p align="center">
  <a href="https://ccbili30-collab.github.io/open-novelx/"><strong>在线体验完整展示</strong></a>
  ·
  <a href="https://github.com/ccbili30-collab/open-novelx"><strong>查看源代码</strong></a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-111111?style=flat-square">
  <img alt="Desktop" src="https://img.shields.io/badge/desktop-Electron-111111?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square">
</p>

---

NovelX Desktop 是面向小说、世界观与原创角色创作的 Agent-native（智能体原生）桌面工作台。用户从一句想法出发，与主编讨论或启动 Growth（生长）任务；世界事实、地图、角色、故事、图片与关系图谱会成为可继续阅读、编辑和追溯的正式作品，而不是散落在聊天记录中的临时回答。

## 当前工作台

| 工作面 | 当前能力                                                         |
| ------ | ---------------------------------------------------------------- |
| 世界   | 按题材规划自然与人文骨架，生成正式世界档案、图志与纪行           |
| 地图   | 泰森区域、自然与人文状态图、区域点击、高亮和正文跳转             |
| 人物   | 正式角色档案、世界来源约束和角色视觉任务                         |
| 故事   | 基于世界与主角继续生成小说，当前联合链支持一部三章正文           |
| 文件   | 展示项目正式文件；Growth 写作期间流式预览、锁定，提交后原地解锁  |
| 图谱   | 从项目文档投影 3D 关系节点，支持刷新、聚焦和原文跳转             |
| 世界包 | 在软件内以地图、图志、纪行、人物、小说和图谱组织公开展览         |
| Study  | 扫描既有资料，在不覆盖原文的前提下整理世界、人物、作品和文献档案 |

图片任务与文字链分离：地图、风貌、角色立绘和故事封面进入后台队列，成功后挂回对应作品；图片等待或失败不会伪装成文字任务失败，也不会用 Fixture（测试夹具）冒充真实结果。

## 完整展示

公开展示页使用自包含作品样板，呈现 NovelX 完整体的视觉方向：

<p align="center">
  <a href="https://ccbili30-collab.github.io/open-novelx/">
    <img src="https://img.shields.io/badge/打开_NovelX_展览-进入作品-111111?style=for-the-badge" alt="打开 NovelX 在线展览">
  </a>
</p>

## 本地开发

当前桌面版本优先支持 Windows。需要 Bun 1.3.14，并使用 PowerShell：

```powershell
bun install --ignore-scripts
bun run dev:desktop
```

生产构建、Windows 安装器和验收命令见 [`docs/status`](docs/status) 中对应版本的发布记录。

## 项目结构

```text
packages/app       NovelX 工作台与六个资源工作面
packages/desktop   Electron 桌面壳与 Windows 安装包
packages/schema    世界、人物、故事和 Study 的公开数据合同
docs/architecture  NovelX 产品架构与运行链合同
docs/status        已实现能力、测试证据与已知边界
```

## 真实性边界

NovelX 的 Agent、Growth、Study 和图片能力都要求真实 Provider（模型服务）；缺少配置时必须失败关闭，不使用本地模板伪造 Live（真实运行）结果。

当前仓库是 2026-07-23 黑客松联合基线。世界、地图、Study、人物与故事链分别有真实运行证据，但最终联合提交尚未重新从空项目完整消耗一次 Provider 跑通全部链路。Windows 安装包也尚未配置数字签名证书。详细证据与冻结项见 [`docs/status`](docs/status)。

## 参与项目

提交问题或代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按照 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

本仓库依照 [MIT License](LICENSE) 发布。第三方组件及其许可见仓库内相应声明。
