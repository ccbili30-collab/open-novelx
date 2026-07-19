# NovelX 世界 UI 与真实地形注册批次

## 来源与边界

- 分支：`novelx-ui`。
- 实现提交：`a5224d5`（`feat(novelx): register and render world terrain`）。
- 唯一代码库：`D:\CodexW\NovelX_Desktop\work\opencode-novelx`；没有修改或接入旧 NovelX Runtime（运行时）。
- 当前只完成 `/growth` 第一阶段：让真实 Provider（模型服务）规划一块主大陆及周边海域，由 Harness（智能体运行框架）校验并注册具名地形，再由正式桌面读取同一权威清单。
- 明确没有进入国家、文明、组织、角色、故事、图片或多 Agent 派发阶段。

## 已实现

- `NovelXGrowth` 权威合同升级为 `schemaVersion: 2`，题材固定为经典幻想、尺度固定为“主大陆及周边海域”；一次注册包含 `8–40` 个具名地形节点和 `1–120` 条空间关系。
- Provider 负责地形设计、名称、层级、形成原因、地图归一化坐标与关系；Harness 独占 ID、路径、哈希、幂等、同回合重复调用拦截和持久化。
- 编译器要求且只允许一个核心主大陆，要求外围水域、山地、低地、水系、父先子后拓扑、坐标边界、唯一名称和有效关系；名称结尾含阿拉伯数字、空话占位符或非法关系时失败关闭。
- 权威产物仍只有 `.novelx/growth/skeleton.json`。注册不会创建国家、人物、章节、图片或伪文件树。
- `/growth` 的私有 Prompt（提示词）要求模型先在内部规划完整地形，再只调用一次 `novelx_register_growth_skeleton`；工具成功后返回明确的阶段边界。
- 世界工作面从清单动态生成地形树、Atlas（世界图册）和详情/空间关系；其他五面没有数据时继续保持诚实空状态，不再投影旧版六面编号槽位。
- 桌面几何按批准参考图固定为 `55 / 60 / 351 / 223 / 665 / 304 / 68px`，使用低彩度符号、单层标题栏和可关闭详情栏。

## 真实 Provider 与桌面证据

- Live（真实运行）目录：`D:\CodexW\NovelX_Desktop\work\NovelX-Terrain-Live-1`。
- 模型：`openai-compatible/gpt-5.4`。
- 会话：`ses_085fd377affeT2FIvZ5w7MNKxu`；运行约 `107.7s`。
- 生成世界：`诺维亚-埃拉瑟恩`；`17` 个具名地形、`15` 条关系、`4` 个外围根水域、编号名称 `0`。
- 磁盘只有 `31616` 字节的 `.novelx/growth/skeleton.json`，没有任何国家、文明、角色、故事或图片文件。
- Provider 在同一 Assistant Turn（助手回合）发出了两次相同工具调用：第一次成功，第二次被 Harness 的同回合重复调用门禁拒绝；磁盘只发生一次有效写入。该证据说明 Prompt 的“只调用一次”不能代替运行时门禁。
- 生产构建后的 Electron 读取上述 Live 清单并同时显示地形树、动态 Atlas 和因果详情；正式预览已覆盖 `C:\Users\16014\Desktop\NovelX-正式预览.png`。

真实运行命令：

```powershell
bun run --conditions=browser .\src\index.ts run `
  --command growth `
  --model openai-compatible/gpt-5.4 `
  --dir D:\CodexW\NovelX_Desktop\work\NovelX-Terrain-Live-1 `
  --auto --format json `
  '创建一个经典中土式幻想世界，只进行主大陆和周边海域地形注册。不要生成国家、文明、角色、故事或图片。'
```

## 验收

- `packages/schema: bun run typecheck`：通过。
- `packages/app: bun run typecheck`、`bun run typecheck:e2e`：通过。
- `packages/opencode: bun run typecheck`：通过。
- Growth 编译器、注册工具、单终态门禁和命令定向测试：`bun test --timeout 20000 ...`，`13 passed / 0 failed / 43 expect()`。默认 `5s` 上限的首次运行中，注册工具冷启动在 `5.015s` 超时；没有业务断言失败，提高该套件上限后同一用例约 `10.9s` 通过。
- 世界工作面定向 E2E：`1 passed / 0 failed`；此前同批两个 NovelX 回归合跑为 `2 passed / 0 failed`。
- `packages/app: bun run build`：通过。
- `packages/desktop: bun run typecheck` 与 `bun run build`：通过，renderer 转换 `2588` 个模块。
- 真实 Provider 输出经共享 Schema 和 `verifyNovelXGrowthSkeleton` 独立复验通过。
- 没有运行整个 Monorepo（单仓多包仓库）全量测试；OpenCode 更宽的相关测试中，业务断言已修复，另有一个既有 Tool Registry（工具注册表）插件超时，因此不得把定向通过写成全仓通过。

## 未完成

- 国家、文明、组织、角色、故事、图片以及后续因果生长均未实现，也没有被本批声明为 Live。
- 没有实现地形清单修订、删除、覆盖迁移或跨题材地形规划；已有不同规格时仍失败关闭。
- Atlas 是对文字档案中结构化坐标的二维投影，不是地理 GIS（地理信息系统）、王国内部地图、星图或无限宇宙渲染器。
- Windows 原生最小化、最大化、关闭、拖动和双击最大化仍需用户在可见窗口中人工验收。

## 风险与恢复入口

- 文学质量仍由 Provider 决定；Harness 能证明结构、关系、幂等和权限边界，不能证明每次命名都同样优秀。
- 当前机器声明的 Electron `42.x` 二进制缺失且在线获取失败；实拍复用了已缓存的 Electron `43.1.0` Runtime。这证明当前构建可运行，但不能替代目标 Electron 版本的发布安装验收。
- 视觉像素比较受真实世界数据与 AI 参考图内容差异影响；本批以竖线几何、布局比例、组件语言和交互状态为验收重点，不宣称逐像素相同。
- 产品与实施边界：`docs/plans/2026-07-19-novelx-world-ui-and-terrain-registration.md`。
- 共享合同：`packages/schema/src/novelx-growth.ts`。
- 编译与校验：`packages/opencode/src/novelx/growth-skeleton.ts`。
- 注册工具：`packages/opencode/src/tool/novelx-growth-skeleton.ts`。
- 桌面投影：`packages/app/src/context/novelx-growth-skeleton.ts`、`packages/app/src/pages/session/novelx-resource-workspace.tsx`。
