import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/NovelX/MiddleEarth"
const projectID = "proj_novelx_middle_earth"
const currentID = "ses_novelx_current"
const olderID = "ses_novelx_older"
const assistantID = "msg_novelx_geography_agent"
const userMessageID = "msg_novelx_user"
const toolPartID = "prt_novelx_write_readme"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 })

test("真实会话保留导航、置顶、资源文件与覆盖式项目面板", async ({ page }, testInfo) => {
  let editable = "---\r\ntitle: 中土世界\r\n---\r\n# 世界总览\r\n\r\n群山环绕着古老王国。\r\n"
  let saved: { content: string; expectedContent: string; expectedBom: boolean } | undefined
  let conflictNext = false
  const events: unknown[] = []
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "中土世界",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions: [
      session(currentID, "构建地理", 4),
      session(olderID, "建立第一批王国", 2),
      { ...session("ses_child", "内部地理工作者", 5), parentID: currentID },
      { ...session("ses_archived", "已归档草稿", 6), time: { created: 6, updated: 6, archived: 7 } },
    ],
    vcsDiff: [],
    fileList: (path) => {
      if (!path) return [node("World\\", "directory"), node("README.md", "file")]
      if (path === "World") return [node("World/geography", "directory"), node("World/world.md", "file")]
      if (path === "World/geography") return [node("World/geography/misty-mountains.md", "file")]
      return []
    },
    fileContent: (path) => ({ type: "text", content: `真实内容：${path}` }),
    fileEditable: (path) =>
      path === "README.md"
        ? { type: "text", content: editable, bom: true }
        : { type: "text", content: `# ${path}\n`, bom: false },
    fileWrite: ({ path, body }) => {
      const write = body as { content: string; expectedContent: string; expectedBom: boolean }
      if (conflictNext) {
        conflictNext = false
        return {
          status: 409,
          body: { _tag: "FileEditConflictError", path, message: "The file changed on disk" },
        }
      }
      if (path === "README.md") {
        saved = write
        editable = write.content
      }
      return { body: { type: "text", content: write.content, bom: write.expectedBom } }
    },
    pageMessages: (sessionID) => ({ items: sessionID === currentID ? agentMessages() : [] }),
    message: (sessionID, messageID) =>
      sessionID === currentID ? agentMessages().find((message) => message.info.id === messageID) : undefined,
    events: () => events.splice(0, 1),
    eventRetry: 16,
  })

  await page.addInitScript(
    ({ directory, server, currentID }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true, showFileTree: true } }))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", "light")
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      if (!localStorage.getItem("opencode.global.dat:layout")) {
        localStorage.setItem(
          "opencode.global.dat:layout",
          JSON.stringify({
            review: { diffStyle: "split", panelOpened: false },
            fileTree: { opened: true, width: 388, tab: "all" },
          }),
        )
      }
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: currentID }]),
      )
    },
    { directory, server, currentID },
  )

  await page.goto(`/server/${base64Encode(server)}/session/${currentID}`)
  await expect(page.locator("html")).toHaveAttribute("lang", "zh")
  await expectSessionTitle(page, "构建地理")

  const workspace = page.getByRole("complementary", { name: "NovelX 工作区" })
  await expect(workspace.getByText("构建地理", { exact: true })).toBeVisible()
  await expect(workspace.getByText("建立第一批王国", { exact: true })).toBeVisible()
  await expect(workspace.getByText("内部地理工作者", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("已归档草稿", { exact: true })).toHaveCount(0)

  const olderRow = workspace.locator(".novelx-session-row").filter({ hasText: "建立第一批王国" })
  await olderRow.getByRole("button", { name: "置顶快捷方式" }).click()
  await expect(workspace.locator(".novelx-shortcut-section").getByText("建立第一批王国", { exact: true })).toBeVisible()

  await olderRow.getByRole("button", { name: "建立第一批王国", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${olderID}$`))
  await workspace.getByRole("button", { name: "构建地理", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${currentID}$`))

  const resources = page.locator("#file-tree-panel")
  const dock = page.getByRole("navigation", { name: "项目资源" })
  await dock.getByRole("button", { name: "文件", exact: true }).click()
  await expect(resources.locator('[data-resource="files"]')).toBeVisible()
  await resources.getByRole("button", { name: "World\\", exact: true }).click()
  await expect(resources.locator(".novelx-document-editor")).toHaveCount(0)
  await resources.getByRole("button", { name: "README.md", exact: true }).click()
  const editor = resources.locator(".novelx-document-editor")
  await expect(editor).toBeVisible()
  await expect(editor.getByRole("heading", { name: "世界总览" })).toBeVisible()
  await editor.getByRole("button", { name: "源码", exact: true }).click()
  const source = editor.locator("textarea")
  const changed = "---\r\ntitle: 中土世界\r\n---\r\n# 世界总览\r\n\r\n群山环绕着古老王国与精灵森林。\r\n"
  await source.fill(changed)
  await source.press("Control+s")
  await expect.poll(() => saved?.content).toBe(changed)
  expect(saved?.expectedContent).toBe("---\r\ntitle: 中土世界\r\n---\r\n# 世界总览\r\n\r\n群山环绕着古老王国。\r\n")
  expect(saved?.expectedBom).toBe(true)
  await expect(editor.getByText("已保存", { exact: true })).toBeVisible()
  await editor.getByRole("button", { name: "排版", exact: true }).click()
  await expect(editor.getByText("群山环绕着古老王国与精灵森林。", { exact: true })).toBeVisible()

  await editor.getByRole("button", { name: "源码", exact: true }).click()
  await source.fill(changed.replace("精灵森林", "矮人矿城"))
  conflictNext = true
  await editor.getByRole("button", { name: "保存", exact: true }).click()
  await expect(editor.getByText("保存冲突", { exact: true })).toBeVisible()
  await expect(source).toHaveValue(changed.replace("精灵森林", "矮人矿城").replaceAll("\r\n", "\n"))
  await editor.getByRole("button", { name: "放弃修改并重新载入", exact: true }).click()
  await expect(source).toHaveValue(changed.replaceAll("\r\n", "\n"))

  editable = "# 表格档案\n\n| 王国 | 地形 |\n|---|---|\n| 刚铎 | 平原 |\n"
  await editor.getByRole("button", { name: "重新载入", exact: true }).click()
  await expect(editor.getByText("为了完整保留表格语法，此文件必须使用源码模式。", { exact: true })).toBeVisible()
  await expect(editor.getByRole("button", { name: "排版", exact: true })).toHaveCount(0)
  await expect(source).toHaveValue(editable)
  await expect(resources.getByText("真实项目文件", { exact: true })).toBeVisible()

  events.push(toolEvent("running"))
  await expect(editor.getByText("地理 Agent 正在编辑这个文件；该操作停止前，此处只读。", { exact: true })).toBeVisible()
  await expect(source).toBeDisabled()
  events.push(toolEvent("completed"))
  await expect(source).toBeEnabled()

  const inspector = resources.locator(".novelx-resource-inspector")
  await expect(inspector).toBeVisible()
  await inspector.getByRole("button", { name: "关闭" }).click()
  await expect(inspector).toHaveCount(0)
  await resources.getByRole("button", { name: "展开详细信息" }).click()
  await expect(inspector).toBeVisible()

  const resourceBefore = await resources.boundingBox()
  await page.getByRole("button", { name: "展开或收起项目与会话" }).click()
  await expect(page.locator(".novelx-project-sidebar.is-overlay")).toBeVisible()
  const resourceAfter = await resources.boundingBox()
  expect(resourceBefore).not.toBeNull()
  expect(resourceAfter).not.toBeNull()
  expect(Math.abs(resourceBefore!.x - resourceAfter!.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(resourceBefore!.width - resourceAfter!.width)).toBeLessThanOrEqual(1)
  await page.keyboard.press("Escape")
  await expect(page.locator(".novelx-project-sidebar.is-overlay")).toHaveCount(0)

  const persistedResource = await page.evaluate(() => {
    const raw = localStorage.getItem("opencode.global.dat:layout")
    if (!raw) return
    const layout = JSON.parse(raw) as {
      novelx?: { projects?: Record<string, { activeResource?: string; activeFile?: string }> }
    }
    return layout.novelx?.projects?.["C:/NovelX/MiddleEarth"]
  })
  expect(persistedResource).toMatchObject({ activeResource: "files", activeFile: "README.md" })
  await page.reload()
  await expect(resources.locator('[data-resource="files"]')).toBeVisible()
  await expect(resources.locator(".novelx-document-editor")).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("novelx-session-files.png") })
})

function session(id: string, title: string, updated: number) {
  return {
    id,
    slug: id,
    projectID,
    directory,
    title,
    version: "dev",
    time: { created: updated, updated },
  }
}

function node(path: string, type: "file" | "directory") {
  const name = path.split("/").at(-1)!
  return { name, path, absolute: `${directory}/${path}`, type, ignored: false }
}

function agentMessages() {
  return [
    {
      info: {
        id: userMessageID,
        sessionID: currentID,
        role: "user",
        time: { created: 1700000000000 },
        summary: { diffs: [] },
        agent: "build",
        model: { providerID: "opencode", modelID: "test" },
      },
      parts: [],
    },
    {
      info: {
        id: assistantID,
        sessionID: currentID,
        role: "assistant",
        time: { created: 1700000001000 },
        parentID: userMessageID,
        modelID: "test",
        providerID: "opencode",
        mode: "build",
        agent: "地理 Agent",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [],
    },
  ]
}

function toolEvent(status: "running" | "completed") {
  return {
    directory,
    payload: {
      type: "message.part.updated",
      properties: {
        part: {
          id: toolPartID,
          sessionID: currentID,
          messageID: assistantID,
          type: "tool",
          callID: "call_novelx_write_readme",
          tool: "write",
          state:
            status === "running"
              ? { status, input: { filePath: "README.md" }, time: { start: 1700000002000 } }
              : {
                  status,
                  input: { filePath: "README.md" },
                  output: "saved",
                  title: "README.md",
                  metadata: {},
                  time: { start: 1700000002000, end: 1700000003000 },
                },
        },
      },
    },
  }
}
