# NovelX `/dy` 解析入口（2026-07-23）

## 本批范围

本批只实现 `/dy <抖音链接> [用户补充要求]` 到 dy-parse 异步解析接口的文字返回链，不自行下载或保存视频、不做逐帧处理，也不自动启动 `/growth`。

## 已实现

- `dy` 作为受保护的 Built-in Skill（内置技能）注册，项目命令和磁盘 Skill 不能替换其解析合同。
- `/dy` 保留完整 `$ARGUMENTS`，界面中的用户消息只显示短命令；内部 Skill 文本标记为 synthetic（模型可见、用户界面隐藏）。
- 专用 `novelx_parse_douyin` Tool（工具）执行：

  ```text
  解析 v.douyin.com 短链
  → POST /api/v1/download
  → GET /api/v1/jobs/{job_id} 轮询终态
  → POST /api/v1/transcript
  ```

- 响应读取 `aweme_id`、`author_name` 和 `text`，公开工具卡只展示作者与解析正文，不展示原始 JSON、内部 Prompt 或协议字段。
- 成功后由当前模型概括内容并询问是否以该文本开启 `/growth`；未得到明确确认不得自动进入 Growth。
- 无效 URL、短链解析失败、传输错误、请求超时、非 2xx、任务失败、任务轮询超时、无效 JSON 和空正文分别失败关闭。

## 验收

- `/dy` 命令、私有模板投影、异步解析协议、失败路径、工具注册和公开工具卡定向测试：35 pass / 0 fail / 93 assertions。
- `packages/opencode`: `bun run typecheck` 通过。
- `packages/app`: `bun run typecheck` 通过。
- 本批文件 Prettier 检查通过；`git diff --check` 通过。

## 未完成与风险

- 真实短链 `https://v.douyin.com/0SVM-grvnpI/`：作品 `7552451834149899574` 和作者“小巷里的”可识别，但 `/transcript` 与 `/caption` 正文为空，验证了真实空正文失败路径。
- 真实短链 `https://v.douyin.com/NfZyDXAngCg/`：异步任务成功后返回作品 `7610127492868191858`、作者“馃惗GuoniaN”和 3175 字正文。
- 真实短链 `https://v.douyin.com/iwA26C8MBPQ/`：新的自动异步编排直接返回作品 `7483074272416599323`、作者“鹤木岩雄（原神说书人）”和 2183 字正文，无需人工预热。
- 当前安装包早于本提交构建，不包含 `/dy`。必须将本提交合入安装包来源分支并重建运行时 `app.asar`；不必重新生成 NSIS 安装器。
- 没有运行仓库全量测试、桌面 E2E（端到端测试）、生产构建或安装包更新。
- 本批只停在“询问是否开启 `/growth`”。用户确认后的自动命令续接没有新增协议，仍依赖现有 Growth 入口。
