# NovelX 地图状态链冻结记录（2026-07-23）

## 范围

- 分支：`codex/novelx-map-variants`
- 共同历史基线：`b974ed812`
- 主 integration 稳定 checkpoint：`7f0d2f82c`（本分支尚未合并）
- 本记录前的地图线 HEAD：`c5de4d7ed`

本批只冻结地图状态链，不建立最终联合工作树，不修改 `codex/novelx-integration` 的并发 WIP。

## 已实现

### Atlas V3 状态集

- 一个共享底图任务。
- 每个 geography/human area feature 各有一个状态图任务。
- 状态任务绑定 `layer`、`entityId`、`baseTaskId` 和稳定目标路径。
- V2 清单保持可读；V3 新注册按完整状态集验证。

相关提交：

- `493cd70ae` Atlas V3 区域状态任务合同。
- `f851b2e5d` 共享底图派生状态图。
- `1afcd39e1` 隐藏 Atlas 点击层切换状态图。
- `92d5f462c` 初始集成边界记录。

### 完整区域 Image Edit

- 以 Atlas cell ownership 生成完整区域黑白蒙版。
- 同一区域内部的泰森 cell 分割不会进入蒙版。
- 缺失区域、缺失共享底图、错误尺寸和无效绑定失败关闭。
- 显式 `NOVELX_MAP_IMAGE_ENDPOINT` 可调用 dy-parse `/inpaint`。
- 未设置地图端点时，现有队列仍走 NovelX/OpenAI-compatible `gpt-image-2` 路径。
- Provider 返回结果仍经过真实媒体解析、最小尺寸验证、哈希和挂载状态转换。

提交：`6f11a74b8`。

### 工作台投影

- geography/human 点击仍由隐藏 Atlas geometry 命中。
- 已挂载状态图替换共享底图；名称与文档跳转不依赖图片内容。
- 新增可切换网格投影，只用于检查底层 cell；网格不拦截点击。

提交：`597e8cad4`。

### Live Harness（真实运行测试框架）

- 从真实已封存世界读取 V2/V3 Atlas 与共享底图。
- 在独立输出目录生成 V3 状态任务、蒙版、Provider 原始返回和浏览器投影。
- 不修改源世界项目。
- 支持 `NOVELX_MAP_VARIANT_LIMIT` 限制真实请求数量。

提交：`c5de4d7ed`。

## Schema（数据合同）变化

地图线相对 `b974ed812` 的公开合同变化来自 `493cd70ae`：

- `NovelXWorldVisual.Manifest.schemaVersion` 支持 V3。
- map task 增加 `mapRole`、`layer`、`entityId`、`baseTaskId` 绑定。
- V3 要求一个 base map 和每个 area feature 唯一对应的 variant。
- V2 继续可读，不承诺把未完成 V2 自动迁移成 V3。

本次未提交批次 `6f11a74b8` 没有继续扩大公开 Schema。

## 验收证据

### 定向测试

```text
packages/opencode/test/novelx/world-image-queue.test.ts
7 pass / 0 fail / 22 expect
```

覆盖：共享底图依赖、完整区域无内部 cell 缝、缺失 feature 失败关闭、dy-parse multipart 请求、URL 资产返回、Electron sidecar Node HTTP transport。

```text
packages/opencode/test/novelx/world-visual.test.ts
3 pass / 0 fail / 21 expect
```

使用仓库规定的 `--timeout 30000`；此前直接运行出现的 unnamed teardown timeout 是错误测试参数，不是业务断言失败。

```text
packages/app/src/context/novelx-world-growth.test.ts
4 pass / 0 fail / 20 expect
```

### 类型检查

- `packages/opencode`: `bun run typecheck` 通过。
- `packages/app`: `bun run typecheck` 通过。

### 真实 Provider

- Endpoint：dy-parse `/api/v1/image/inpaint`。
- 模型报告：`z-image-turbo-Q4_K_M.gguf`。
- 输入：真实封存世界、真实共享地图、真实 Atlas 完整区域蒙版。
- 最终完整区域版本：尝试 `1/8`，`1 attached / 0 failed`。
- 结果：完整区域可明确区分并生成金色边缘，但区域内部重绘较强；这是模型质量限制，不是空间绑定失败。
- `gpt-image-2` Image Edit 尚未在该联合头进行真实对比，不能宣称效果更好。

本轮没有执行全量 OpenCode/App 测试，也没有重新打包 Electron 安装程序。

## 明确排除

- `prototypes/` 下全部 PNG、蒙版、Provider 原始返回、HTML 数据和截图。
- API Key、Provider 凭证和本机配置。
- Study WIP、世界包 WIP 和 integration 当前未提交文件。
- 旧 `codex/hackathon-10day` 产品线。

## 手工合并点

以下四个文件与 `7f0d2f82c` 后续并发工作存在所有权交叉，联合时必须手工合并：

- `packages/opencode/src/novelx/world-image-queue.ts`
- `packages/opencode/src/novelx/world-visual.ts`
- `packages/opencode/test/novelx/world-image-queue.test.ts`
- `packages/opencode/test/novelx/world-visual.test.ts`

联合规则：

- integration 的共享 `image-provider.ts`、异步队列、失败/重试和 Growth 路由是运行时权威。
- 地图线的 Atlas V3、完整区域蒙版、共享底图依赖和状态图目标路径是地图权威。
- 不保留第二套全局 Provider 配置；dy-parse 适配应接入 integration 的共享 Provider 边界。

## 风险与恢复入口

- 当前最大不确定性是专用 Image Edit 模型对完整区域蒙版的服从度，尚无 `gpt-image-2` Live 证据。
- dy-parse 能生成明确选区，但可能强烈重绘区域内部。
- 最终联合工作树必须等待地图线最终哈希、世界包 software-only 哈希和 Study 独立哈希全部就绪。
- 恢复时从 integration checkpoint `7f0d2f82c` 新建干净联合工作树，按提交顺序 Cherry-pick 地图线，不复制任一来源工作树的未提交文件。
