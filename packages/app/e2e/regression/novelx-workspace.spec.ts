import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/NovelX/MiddleEarth"
const projectID = "proj_novelx_middle_earth"
const currentID = "ses_novelx_current"
const olderID = "ses_novelx_older"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test.use({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 })

test("中文 NovelX 工作区使用参考图结构并保留真实会话与文件入口", async ({ page }, testInfo) => {
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
    agents: [
      { name: "世界总编", mode: "primary", native: false },
      { name: "地理构建师", mode: "primary", native: false },
      { name: "隐藏工作者", mode: "subagent" },
    ],
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
      if (!path) return [node("World", "directory"), node("README.md", "file")]
      if (path === "World")
        return [
          node("World/geography", "directory"),
          node("World/characters", "directory"),
          node("World/world.md", "file"),
        ]
      if (path === "World/geography") return [node("World/geography/misty-mountains.md", "file")]
      if (path === "World/characters") return [node("World/characters/arin.md", "file")]
      return []
    },
    fileContent: (path) => ({ type: "text", content: `内容：${path}` }),
    pageMessages: () => ({ items: [] }),
  })

  await page.addInitScript(
    ({ directory, server, currentID }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true, showFileTree: true } }))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", "dark")
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({
          review: { diffStyle: "split", panelOpened: false },
          fileTree: { opened: true, width: 320, tab: "all" },
        }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: currentID }]),
      )
    },
    { directory, server, currentID },
  )

  await page.goto(`/server/${base64Encode(server)}/session/${currentID}`)
  await expect(page.locator("html")).toHaveAttribute("lang", "zh")
  await expect(page.locator('[data-component="prompt-input"]')).toHaveAttribute(
    "aria-label",
    /和大管家讨论，检索或修改当前项目/,
  )
  await expectSessionTitle(page, "构建地理")

  const workspace = page.getByRole("complementary", { name: "NovelX 工作区" })
  await expect(workspace.getByRole("button", { name: "新建任务" })).toBeVisible()
  await expect(workspace.getByText("世界总编", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("地理构建师", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("隐藏工作者", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("构建地理", { exact: true })).toBeVisible()
  await expect(workspace.getByText("建立第一批王国", { exact: true })).toBeVisible()
  await expect(workspace.getByText("内部地理工作者", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("已归档草稿", { exact: true })).toHaveCount(0)

  await workspace.getByRole("button", { name: "建立第一批王国", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${olderID}$`))
  await workspace.getByRole("button", { name: "构建地理", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${currentID}$`))

  const resources = page.locator("#file-tree-panel")
  await expect(resources.getByText("文件内容", { exact: true })).toBeVisible()
  await expect(resources.getByText("活动与产物", { exact: true })).toBeVisible()
  await expect(resources.getByRole("button", { name: "README.md" })).toBeVisible()
  await resources.getByRole("button", { name: "活动与产物" }).click()
  await expect(resources.getByRole("button", { name: "geography" })).toBeVisible()

  const playerMode = page.getByRole("button", { name: "玩家模式" })
  await expect(playerMode).toBeDisabled()
  await expect(page.getByRole("button", { name: "Agent 模式" })).toBeVisible()
  await expect(page.getByRole("button", { name: "IDE 模式" })).toBeVisible()
  await expect(page.getByRole("button", { name: "自由" })).toBeDisabled()

  await page.screenshot({ path: testInfo.outputPath("novelx-workspace.png"), fullPage: true })

  await workspace.getByRole("button", { name: "新建任务" }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
  await expect(page.getByRole("group", { name: "对话模式" })).toBeVisible()
  await expect(page.locator("#file-tree-panel")).toBeVisible()
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
