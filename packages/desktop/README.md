# NovelX Desktop

NovelX 的 Electron 桌面壳，负责独立 Profile、原生窗口、更新与发布打包。

## Development

```powershell
bun install
bun dev
```

## Build

Run the `build` script to build the app's JS assets, then `package` to
bundle the assets as an application. The resulting app will be in `dist/`.

```powershell
bun run build
bun run package:win -- --x64 --publish never
```
