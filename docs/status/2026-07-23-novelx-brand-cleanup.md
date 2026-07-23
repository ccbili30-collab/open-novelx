# NovelX 品牌清理与猫图图标

日期：2026-07-23

分支：`codex/novelx-final-integration`

本批只处理 NovelX 的公开品牌、用户可见文案、图标派生资源和 Windows 安装包，不改变项目数据合同、Growth/Study 编排、Provider 凭证或独立 Profile 路径。

## 已完成

- 使用用户提供的 832x964 猫图作为权威源图，源文件 SHA-256 为 `F90027CB7A6BB75437C09FC56BDFE0F0B76DAC3CCACD845D3CB3D72BD1FE1F03`。
- 新增可重复执行的 Windows PowerShell 图标生成器，派生 Windows PNG/ICO、Windows Store 图标、macOS ICNS 和 Web favicon。
- 主程序、安装器和桌面快捷方式均使用猫图图标；从最终 EXE 和安装器提取的 Windows 资源图标已经人工查看。
- App、Desktop、UI、TUI、ACP、OAuth 回调页、默认 Agent 身份、限流提示、公开 README 和所有语言的用户可见 `OpenCode` 品牌文字改为 `NovelX`。
- Provider 列表不再向 NovelX 用户展示 `opencode` 与 `opencode-go` 两个上游服务。
- Poe OAuth 第三方依赖通过 `patchedDependencies` 修正回调页和过期凭证文案；补丁已对 npm 的干净 `opencode-poe-auth@0.0.1` 包执行 `git apply --check`。
- 修复品牌替换后代码高亮仍请求旧主题键的问题，Markdown 与 diff 统一使用 `NovelX` 主题。
- 最终生产 bundle 对默认 Agent、授权页、Poe 回调、权限提示、限流促销、桌面错误和旧主题键执行用户可见旧品牌模式扫描，命中数为 0。

## 兼容边界

以下标识继续保留，因为它们属于上游 Runtime（运行时）兼容、有效协议或许可证证据，不是普通用户品牌展示：

- `@opencode-ai/*` 内部包名、`OPENCODE_*` 环境变量和 `opencode` Provider ID。
- `opencode://` 深层链接、既有本地存储键、数据库字段与配置文件名。
- `opencode.ai/config.json` 配置 Schema、WSL 上游 Runtime 安装地址和旧 Provider 服务端点。
- MIT License 中的上游版权声明及历史架构、迁移和状态文档中的事实记录。

机械改名这些标识会破坏 ABI、旧数据恢复、配置校验或许可证完整性，因此不属于本批清理。

## 验收

- 定向测试：148 pass / 0 fail / 338 assertions。
  - Core：12 pass。
  - Runtime：43 pass；首次 ACP 子进程因 Windows PATH 找不到 `bun.exe` 失败，显式加入真实 Bun 目录后 3/3 复跑通过。
  - App：14 pass。
  - Desktop：17 pass。
  - Session UI：62 pass。
- `packages/core`、`packages/opencode`、`packages/tui`、`packages/ui`、`packages/session-ui`、`packages/app`、`packages/desktop` 类型检查通过。
- `OPENCODE_CHANNEL=prod bun run build` 通过。
- `OPENCODE_CHANNEL=prod bun run package:win -- --x64 --publish never` 通过。
- Windows 安装器：`packages/desktop/dist/NovelX-1.18.3-win-x64.exe`。
- 安装器 SHA-256：`4F5050E2E544D61E662081B925292653DAD6F75E694F0155D610BD1466718AB3`。
- 安装版路径：`C:\Users\16014\AppData\Local\Programs\novelx-desktop\NovelX.exe`。
- 安装版 EXE SHA-256：`D65911C9ED1FB033126353976F14CCFA89FE542E31B6468223B222A7BE5CC4EF`，与 `win-unpacked` 产物一致。
- 桌面快捷方式：`C:\Users\16014\Desktop\NovelX.lnk`，目标及图标位置均指向安装版 `NovelX.exe`。
- 覆盖安装退出码为 0；安装版主窗口持续运行，窗口标题为 `NovelX`。
- 本批不需要真实 Provider，因此没有调用文字模型或图片模型。
- 未运行仓库全量测试。

## 已知限制

- `bun install --frozen-lockfile --ignore-scripts` 仍因 Windows 上链接 `@aws/durable-execution-sdk-js@1.0.2` 时出现 `ENOENT` 返回失败；这是联合基线已有的干净依赖安装债务。Poe 补丁已通过独立干净包检查，但不能把本次根安装描述为成功。
- 构建仍有既有的 Vite 大包、重复导入、source map 覆盖和 `eval` 警告；本批没有扩大为构建系统重构。
- Windows 安装器和主程序均为 `NotSigned`，没有可用的 NovelX 代码签名证书。
- 只真实打包和安装验证 Windows x64；macOS ICNS 已生成但未在 macOS 打包验证。
- 源码与历史文档仍会出现内部 `opencode` 标识和上游事实记录，不能将“用户可见品牌已清理”误报为“已经重命名整个内核”。

## 恢复入口

- 权威猫图：`packages/ui/src/assets/novelx/novelx-cat-source.jpg`
- 图标生成器：`packages/desktop/scripts/generate-novelx-brand.ps1`
- Windows 图标：`packages/desktop/icons/prod`
- OAuth 品牌页：`packages/core/src/oauth/page.ts`
- 默认 Agent 身份：`packages/opencode/src/session/prompt`
- Poe 依赖补丁：`patches/opencode-poe-auth@0.0.1.patch`
