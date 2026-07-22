# 世界包展览批次状态

## 已完成

- 工作分支为 `codex/novelx-world-package`，本批以 `e69db16ee` 为修改前基线。
- NovelX 工作台“世界包”资源保留虚空翻书展览：封面、世界地图、历史与小说、人物群像、世界图谱按固定顺序切换。
- 地图区域第一次选择后显示摘要；再次进入时按 `sourcePath` 从当前项目读取正式 Markdown，并在世界包内排版阅读。
- 正文阅读器覆盖在展览舞台上，不销毁当前页面、地图选区、书籍选区或空间位置；关闭后回到进入前状态，也可跳到文件工作面。
- 图志、纪行和普通档案读取正式目标文件，不再只显示投影摘要。
- 小说封面进入章节目录；章节读取正式章节文件，章节返回小说目录，目录再返回世界包。
- 人物肖像进入正式人物档案；没有已提交 `sourcePath` 时保持不可伪造的空入口。
- 世界图谱页面删除独立简化环形节点实现，直接嵌入现有 `NovelXGraphView`，复用真实节点、关系、球面布局、搜索、刷新、旋转、缩放和原文入口。
- 正文加载具有 loading、error、retry 三态；读取失败不会伪造内容，也不会破坏展览状态。
- 浏览器 HTML 原型及临时展示脚本按用户决定停止，本批没有把相关临时文件或修改纳入工作树。

## 验收

- `packages/app`: `bun run typecheck` 通过。
- `packages/app`: `bun test src/novelx/world-package.test.ts src/pages/session/novelx-graph-source.test.ts src/pages/session/novelx-graph-model.test.ts`：14 passed，0 failed，41 assertions。
- `packages/app`: `playwright test e2e/regression/novelx-workspace.spec.ts --project=chromium --workers=1`：1 passed；验证地图正式原文读取与返回、图志正式正文读取与返回、世界包复用真实图谱且旧简化节点不存在。
- `packages/app`: `bun run build` 通过；保留现有动态导入与大 chunk 警告。
- 本批未调用真实 Provider（模型服务）；功能只读取已提交的项目产物，不生成新内容。
- 本批没有运行仓库全量测试，也没有重新打包 Electron 安装程序。

## 未完成 / 冻结

- 当前 E2E（端到端测试）成熟夹具包含地图、图志、纪行和图谱，不包含人物与三章小说；人物档案和小说章节已接入相同读取路径，但尚未在联合成熟项目上完成自动化与 Electron（桌面运行壳）视觉验收。
- `.zib` 离线浏览器仍沿用旧的摘要展示能力；用户已明确要求优先软件内阅读，因此本批没有继续改造离线 HTML，也不能宣称离线包已经具备同等阅读能力。
- 世界包只展示已经被正式物化和提交的文件；缺失正文、人物或图片时保持空状态，不用 Fixture（测试夹具）或本地模板冒充正式产物。

## 风险与恢复入口

- 现有地图可能同时包含地理层与人文层的同一实体区域；世界包按正式 Atlas 投影展示，后续若要求在展览内切换图层，应复用地图层合同而不是复制区域。
- 生产构建仍有既有大 chunk 警告，本批嵌入图谱没有新建第二份图谱实现，但尚未单独做 bundle 分包优化。
- 下一步真实验收入口：使用合并后包含世界、人物、三章小说的项目启动 NovelX，逐项验证小说目录/章节返回、人物档案、图谱原文跳转，再决定是否打包安装程序。
- 关键实现：`packages/app/src/pages/session/novelx-world-package-view.tsx`、`packages/app/src/pages/session/novelx-resource-workspace.tsx`、`packages/app/src/pages/session/novelx-world-package.css`。
