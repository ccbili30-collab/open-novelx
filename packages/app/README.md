# NovelX App

NovelX 的 Solid 工作台界面，包含世界、故事、人物、文件、图谱与世界包六个资源工作面。

## 开发

```powershell
bun run dev
```

## 验收

```powershell
bun run typecheck
bun test
bun run test:e2e:local
```

Playwright 会自动启动 Vite。可通过 `PLAYWRIGHT_SERVER_HOST`、`PLAYWRIGHT_SERVER_PORT`、`PLAYWRIGHT_PORT` 和 `PLAYWRIGHT_BASE_URL` 覆盖测试地址。
