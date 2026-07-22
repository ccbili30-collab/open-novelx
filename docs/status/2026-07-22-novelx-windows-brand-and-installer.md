# NovelX Windows 品牌与安装包状态

日期：2026-07-22

项目目录：`D:\CodexW\NovelX_Desktop\work\opencode-novelx-bug`

分支：`codex/novelx-bugfix`

实现提交：`91e7676f4`

本批只覆盖 NovelX 品牌资源、Windows 发布身份、NSIS（Windows 安装器系统）安装包及真实安装启动验收，不代表 Growth（生长）、故事、图谱或生图能力新增完成。

## 已完成

- 用户提供的猫图原件已保存为权威品牌源图；派生资源只做方形取景、Lanczos 缩放和 ICO 封装，没有使用生成模型重画。
- 新增 `NovelXMark`、`NovelXLogo` 与 `NovelXSplash`，接入启动页、主页、错误页、文件空状态和顶栏。
- 通知图标、Web favicon、PWA（渐进式 Web 应用）清单、Electron favicon 与分享图改为本地 NovelX 猫图，不再依赖远程 OpenCode favicon。
- Windows 三个发布通道使用同一份六尺寸 ICO：16、24、32、48、64、256 像素。窗口、任务栏、EXE、安装器和桌面快捷方式共用该图标。
- Electron Builder（桌面打包器）的 `appId`、`productName`、产物名、更新仓库、Updater Cache（更新缓存）与 Linux metainfo 已切换到 NovelX；正式 App User Model ID（应用用户模型标识）为 `ai.novelx.desktop`。
- Windows Git 未还原符号链接时，App 类型检查改为直接读取 UI 的权威 `custom-elements.d.ts`，不再把链接路径文本当作 TypeScript。
- 已生成、安装并真实启动 x64 正式通道应用；源码预览退出后，安装版主进程及 Renderer（渲染进程）持续运行。

## 安装包与安装位置

- 桌面交付包：`C:\Users\16014\Desktop\NovelX-1.18.3-Windows-x64.exe`
- 构建产物：`packages\desktop\dist\NovelX-1.18.3-win-x64.exe`
- 文件大小：122.84 MiB
- SHA-256：`823B35C1402F5342859D8FBEA40A56E38429D7A442C6431E9E9E81AD49320D9A`
- 安装目录：`C:\Users\16014\AppData\Local\Programs\novelx-desktop\NovelX.exe`
- 桌面快捷方式：`C:\Users\16014\Desktop\NovelX.lnk`
- Product Name（产品名）：`NovelX`
- 版本：`1.18.3`
- 更新缓存：`novelx-desktop-updater`
- 更新仓库：`ccbili30-collab/open-novelx`

## 验收

- Desktop 定向测试：Builder 身份、六尺寸 ICO、本地品牌图片、HTML 资源和独立 Profile 共 12 项通过、0 失败、64 次断言。
- App 菜单定向测试：3 项通过、0 失败、4 次断言。
- `packages/ui`、`packages/app`、`packages/desktop` 类型检查通过。
- 全仓 `bun run typecheck`：Turbo 30/30 个任务通过；Enterprise 的 Windows 符号链接仅在验收期间临时展开，结束后已恢复为 Git mode `120000`，未提交兼容垫片。
- `OPENCODE_CHANNEL=prod bun run build` 通过；Electron 主进程、Preload（预加载脚本）和 2605 个 Renderer 模块完成生产构建。
- `electron-builder --win --x64 --publish never` 成功生成 NSIS 安装器；未向 GitHub Release 上传安装包。
- 安装器静默安装退出码为 0；快捷方式目标指向安装目录的 `NovelX.exe`。
- 安装版正常启动后主进程持续存活，命令行不含远程调试参数；Renderer 使用 `ai.novelx.desktop`。
- 安装版 DOM（文档对象模型）检查确认页面标题为 `NovelX`，顶栏猫标存在 1 个，加载资源为打包内 `novelx-cat-mark-*.png`，天然尺寸 512×512 且加载完成。
- 独立 Profile 定向测试确认 Provider（模型服务）、数据库、Session（会话）、缓存、状态和日志仍写入 NovelX 路径，不读取原版 OpenCode Profile。
- 本批不需要 Provider，因此没有调用真实模型或生图服务。

## 未完成与风险

- 安装器和主程序均为 `NotSigned`。本机没有 NovelX 代码签名证书，Windows 可能显示“未知发布者”或触发 SmartScreen（Windows 信誉保护）；不能将本包称为已签名正式发行版。
- 安装包当前只复制到本机桌面，没有创建 GitHub Release，也没有外部下载链接。
- 为保持与嵌入 Runtime（运行时）的兼容，Deep Link（深层链接）字符串仍为 `opencode://`；只把协议显示名改为 NovelX。
- 源码仍保留部分上游内部包名和 Runtime 标识。当前完成的是用户可见品牌、发布身份、更新边界和 Profile 独立，不代表删除 OpenCode 内核来源。
- 只验证 Windows x64；没有构建或安装验证 macOS、Linux、ARM64。
- Electron 的 CDP（Chrome 调试协议）整窗截图在当前 GPU 窗口上超时，因此没有新增全窗截图；安装版进程、DOM、打包资源、EXE 资源图标和快捷方式均已分别验证。

## 恢复入口

- UI 品牌组件：`packages/ui/src/components/novelx-logo.tsx`
- 权威源图：`packages/ui/src/assets/novelx/novelx-cat-source.jpg`
- Windows 图标：`packages/desktop/icons/{dev,beta,prod}/icon.ico`
- 打包身份：`packages/desktop/electron-builder.config.ts`
- metainfo：`packages/desktop/scripts/copy-metainfo.ts`
- 独立 Profile：`packages/desktop/src/main/novelx-profile.ts`
