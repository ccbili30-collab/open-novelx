# NovelX World Growth 实时投影状态（2026-07-23）

## 本批范围

本批只完成 World Growth（世界生长）的桌面实时投影：阶段注册、锁定虚拟文件、Writer 正文流、手动选择保护、提交转正和嵌套文件揭示。没有修改 Growth Runtime（运行时）、Provider（模型服务）、公开 Schema（数据合同）或正式 Markdown 写入时机。

人物、故事、出版和 Study（学习）尚未接入同一实时 Artifact（产物）投影，本批不得描述为六个资源页全部实时生长。

## 已实现

- `prepared` 且已有阶段编辑 Session 时，默认文件面显示“主编注册中”，但不预测实体。
- 权威世界物化文件登记实体后，文件区立即出现只读、锁定的虚拟文件行。
- `document.taskSessionId` 或已验证的 `novelx-world-writer` 任务元数据可安全映射 Writer；若同 ID Session 已加载且 Agent 身份冲突，则失败关闭。
- Writer 的 `message.part.delta` 经过既有正文清洗器后直接更新默认文件面，无需先打开 World。
- World 页面在没有手动选择时跟随当前 Writer；手动选择、打开真实文件或存在未保存文档时不会抢焦点。
- “跟随正在生长”返回当前主 Writer，并继续使用同一份实时正文投影，不重复强制刷新 Session。
- Writer 失败或取消后保留已清洗的残稿并显示失败状态。
- 同一稳定实体 key 在正式提交后原地解锁并转为真实文件；对应父目录按根到叶顺序刷新，只在默认文件面展开该提交路径。
- World 页面不再显示内部 Agent 名、Session ID、Context Epoch（上下文纪元）或来源哈希。

## 验收

App 定向单测：

```text
60 pass / 0 fail / 158 assertions
```

覆盖事件归并、文件 watcher、Growth 状态、工作台模型、实时投影和实时 Controller。

事件驱动 Playwright E2E：

```text
1 pass
```

用例按真实事件顺序回放：注册前空态、materialization watcher、`message.updated`、`message.part.updated`、两次 `message.part.delta`、手动选择保护、恢复跟随、失败残稿、提交转正和嵌套文件出现。用例同时回归 Study 项目恢复、项目改名、图片队列、地图、世界包、图谱和 Markdown 编辑。

其他验证：

- `packages/app`: `bun run typecheck`，通过。
- `packages/app`: `bun run typecheck:e2e`，通过。
- `packages/app`: `bun run build`，通过。
- `packages/desktop`: `bun run typecheck`，通过。
- `packages/desktop`: `OPENCODE_CHANNEL=prod bun run build`，通过。
- `packages/desktop`: `OPENCODE_CHANNEL=prod bun run package:win`，通过。
- Windows 安装包静默覆盖返回码 0；安装版主进程、Renderer 和远程调试端点已启动。
- 1672x941 默认文件面与 1024x768 World 页面截图已人工检查。

本批没有重新调用真实 Provider，也没有运行仓库全量测试。

## 未完成与风险

- 人物、故事、出版和 Study 仍需各自建立经过验证的 Session 到 Artifact 映射，不能直接复用 World 映射并宣称完成。
- 安装版尚未重新执行一次真实 `/growth`。现有证据是事件协议 E2E，不是新的 Provider Live（真实运行）。
- Windows 安装包未配置代码签名证书，`Get-AuthenticodeSignature` 返回 `NotSigned`；本地安装可用，但公开分发前必须处理签名与信誉提示。
- Vite 仍报告既有大 chunk、重复动态/静态导入和 source map 覆盖警告；本批没有扩大为构建性能重构。
- “所有正文页可编辑并粘贴图片”已由用户明确冻结到后续独立批次，没有混入本实现。
