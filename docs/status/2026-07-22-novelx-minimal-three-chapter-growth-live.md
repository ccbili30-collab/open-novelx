# NovelX 最小三章小说 Growth Live

日期：2026-07-22
分支：`codex/novelx-content-growth`

## 本批产品决定

比赛时间不足时，Story Growth 不再强制生成历史书、文献、审稿分身或连续性回执。当前授权闭环固定为：

`冻结 World → 唯一主角 OC → 同一个小说 Writer 连续写三章 → 直接提交 → Growth complete`

这是用户明确授权的 Hackathon（黑客松）简化，不代表长期产品删除历史、文献、封面或更完整的 Story 能力。旧的 6–8 章丰富 Story Profile 仍可读取和运行；新合同同时允许 `0` 历史、`0` 文献和 `3–8` 章小说。

## 实现边界

- Story Editor 只注册一部三章小说，提交空的 `historyBooks` 与 `references`。
- 小说章节可不提交 `sourceEntityIds`、历史引用或文献索引；Harness（智能体运行框架）会把全部冻结世界原文与主角档案放入每章 Context Pack。
- 第一章创建唯一 `novelx-story-writer` 子会话；第二、三章必须用同一个 `task_id` 恢复。
- Writer 每章只返回 Markdown；不生成 JSON 回执、事件账本、审稿结果或生产报告。
- Harness 继续拥有章节 ID、路径、顺序、租约、提交哈希和完成状态。
- 最小三章 Profile 不再要求模型填写 source ID、历史索引或文献索引，因此直接消除了此前的注册纠错循环。
- 图片、封面、图谱、世界包和 UI 本批全部冻结。

## 真实 Provider 验收

项目：`D:\CodexW\NovelX_Desktop\work\NovelX-Protagonist-Story-Live-20260722-7`
证据：`D:\CodexW\NovelX_Desktop\work\NovelX-Growth-Live-Evidence\20260722-live7\growth-live-run-2.jsonl`
模型：`openai-compatible/gpt-5.6-luna`
Provider：NovelX 独立 Profile，通过 `NOVELX_PROXY3_API_KEY` 环境变量认证；密钥未写入源码、日志或文档。

权威结果：

- 根 Growth Session：`ses_077baa023ffeKoTv0h9To7IWyv`
- Story Editor：`ses_077ba2c0affeMvfZpvnCoCmZlY`
- 唯一小说 Writer：`ses_077b9441cffeH7GzM0lQGB1Jpf`
- 世界来源读取：27/27
- 主角档案读取：完成
- 历史书：0
- 文献：0
- 小说：《雾中留痕》
- 章节：3/3 committed
- 三章 `taskSessionId`：完全相同
- 图片：0
- 连续性回执目录：不存在
- 最终路由：`complete`
- Story Materialization 完整性：`8db8da4c9367f54a22453b3acc17670556fe78fd7fa7bda9735ea00f01ea25e7`

正式文件：

- `Stories/小说/雾中留痕/在改变的水路上留下可追溯的真相/01-缺页与雾铃.md`
- `Stories/小说/雾中留痕/在改变的水路上留下可追溯的真相/02-退潮窗口.md`
- `Stories/小说/雾中留痕/在改变的水路上留下可追溯的真相/03-众人承认的纸.md`

三份正文均存在、标题匹配、没有内部编排词或回执，且正文归一化 SHA-256 与 Manifest（清单）的 `committedSha256` 全部一致。第三章为 3373 个文件字符，略高于 Prompt 的 3000 目标，但低于运行时允许上限；本批按用户“直接生成、不要审稿”决定未触发二次改写。

## 自动验收

- `packages/opencode: bun test test/novelx/story-materialization.test.ts test/agent/agent.test.ts test/tool/novelx-character-growth.test.ts test/novelx/text-grounding.test.ts test/novelx/character-materialization.test.ts`：77 pass，0 fail。
- `packages/opencode: bun test test/novelx/story-visual.test.ts test/tool/registry.test.ts`：Story Visual 3 pass；Registry 首次默认 5 秒限制下有 1 项冷启动超时。
- `packages/opencode: bun test --timeout 20000 test/tool/registry.test.ts`：18 pass，0 fail；该项实际耗时约 7.9 秒，确认不是功能失败。
- `packages/schema: bun run typecheck`：通过。
- `packages/opencode: bun run typecheck`：通过。

没有运行仓库全量测试；以上是与本批合同、Agent、工具注册和既有 Story Visual 兼容性相关的定向验收。

## 失败证据与恢复边界

- Live5 证明“正文末尾巨型连续性 JSON 回执”会把一章扩大为多轮协议纠错，已停止采用。
- Live6 证明旧丰富注册器会逐次暴露专名、source ID 和引用索引错误；最小路线已删除这些必填输入并保留失败证据。
- Live7 的最终成功运行从无 Story Manifest 的冻结 World + Character 起步，没有复用回执时代的 Story 或 Writer 会话。
- 后续若恢复历史、文献、封面或更严格连续性，应建立独立长期路线，不得重新把机器回执塞回小说正文生成链。
