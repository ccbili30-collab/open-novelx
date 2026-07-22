# NovelX Windows 品牌与安装包实施计划

## 当前目标

使用用户提供的猫图作为 NovelX 唯一品牌图形，统一应用内 Logo、窗口、任务栏、快捷方式和安装器，并生成可安装的 Windows x64 EXE。

## 修改范围

- 保留原图内容，只做方形取景、尺寸缩放和 ICO 多尺寸封装。
- 新增 NovelX 专属 UI Logo 组件，不修改共享的 OpenCode Logo 实现。
- 替换 NovelX 桌面端实际使用的启动页、主页、错误页、空状态、顶栏和通知图标。
- 统一 Electron Builder（桌面打包器）的 NovelX 应用 ID、产品名、协议显示名、产物名和更新仓库。
- 生成 NSIS（Windows 安装器系统）单击式当前用户安装包。

## 明确不做

- 不重新绘制或生成猫图，不改变其造型和颜色。
- 不更改现有 `opencode://` Deep Link（深层链接）协议字符串；本批次只改协议显示名，避免扩大兼容迁移范围。
- 不发布 GitHub Release，不上传安装包到外部发布页。
- 不伪造代码签名。本机没有 NovelX 代码签名证书，交付包将是未签名安装器。
- 不顺带重写 Growth、图谱或其他产品功能。

## 实施步骤

1. 将原图复制到仓库稳定品牌目录，并生成 512、192、180、96 像素 PNG 与 16/24/32/48/64/256 像素 ICO。
2. 新增 `NovelXMark`、`NovelXLogo`、`NovelXSplash`，替换 NovelX 桌面界面的旧品牌引用。
3. 修正 favicon、通知图标、Windows 菜单和桌面设置页的品牌文字。
4. 将打包身份统一为 `ai.novelx.desktop.*` / `NovelX`，更新发布元数据到 `ccbili30-collab/open-novelx`。
5. 运行定向测试、类型检查和生产构建。
6. 构建 x64 NSIS 安装器，检查 PE/ICO/签名状态，实际安装、启动、退出并检查残留进程。
7. 将最终安装包复制到桌面稳定路径，提交代码并推送 `codex/novelx-bugfix`。

## 验收标准

- 应用界面、窗口、任务栏、快捷方式和安装器均展示猫图或“猫图 + NovelX”组合。
- 安装器、已安装应用、开始菜单和卸载项均使用 NovelX 名称，不再使用 OpenCode 发布身份。
- 安装后应用能启动并退出，且不会复用原版 OpenCode 的 Provider、Session、数据库或缓存目录。
- 生成的 EXE 可由 Windows 识别为有效 PE 安装器。
- 明确报告未签名状态及 SmartScreen（Windows 信誉保护）风险。
