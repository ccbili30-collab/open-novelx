# 参与 NovelX

NovelX 当前集中处理世界创作、角色、故事、地图、图谱、图片队列、世界包与桌面工作台。提交改动前，请先说明它解决的用户问题、影响的工作面以及真实验收方式。

## 开发环境

- Windows 与 PowerShell 优先。
- Bun 版本以根目录 `package.json` 的 `packageManager` 为准。
- 不要在源码、测试、日志或提交历史中写入 Provider Key。
- 不要用 Mock、Fixture 或静态模板冒充真实 Agent、图片或 Live 结果。

## 提交要求

1. 保持修改范围单一，不混入无关格式化或生成产物。
2. 修改公开 Schema、项目文件格式、权限或迁移语义前，先提交设计说明。
3. 从受影响的 package 目录运行定向测试和 `bun run typecheck`。
4. 桌面发布改动还需要生产构建；安装包必须先 `build` 再 `package:win`。
5. 在 PR 中区分真实 Provider 结果、定向测试、E2E 和未验证范围。

## 代码边界

- Renderer 只投影状态和收集用户决定，不伪造完成、权限或正式作品。
- 世界、人物、故事与图片都必须保留真实来源和失败状态。
- 内部 Prompt、Agent 协调、Session ID、哈希、密钥和协议载荷不进入普通用户界面。
- 保留用户已有修改；禁止使用破坏性 Git 命令清理工作树。

提交 Issue 或 Pull Request 时，请附上复现步骤、预期结果、实际结果和已经执行的验证。
