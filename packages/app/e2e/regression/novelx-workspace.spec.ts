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

test("connects the NovelX workspace panes to real session, Agent, and World file state", async ({ page }, testInfo) => {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "Middle Earth",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    agents: [
      { name: "World Director", mode: "primary", native: false },
      { name: "Geography", mode: "primary", native: false },
      { name: "Hidden Worker", mode: "subagent" },
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
      session(currentID, "Build the geography", 4),
      session(olderID, "Found the first kingdoms", 2),
      { ...session("ses_child", "Internal geography worker", 5), parentID: currentID },
      { ...session("ses_archived", "Archived draft", 6), time: { created: 6, updated: 6, archived: 7 } },
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
    fileContent: (path) => ({ type: "text", content: `contents:${path}` }),
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
  await expectSessionTitle(page, "Build the geography")

  const workspace = page.getByRole("complementary", { name: "NovelX workspace" })
  await expect(workspace.getByRole("button", { name: "New task" })).toBeVisible()
  await expect(workspace.getByText("World Director", { exact: true })).toBeVisible()
  await expect(workspace.getByText("Geography", { exact: true })).toBeVisible()
  await expect(workspace.getByText("Hidden Worker", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("Build the geography", { exact: true })).toBeVisible()
  await expect(workspace.getByText("Found the first kingdoms", { exact: true })).toBeVisible()
  await expect(workspace.getByText("Internal geography worker", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("Archived draft", { exact: true })).toHaveCount(0)

  await workspace.getByRole("button", { name: "Found the first kingdoms", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${olderID}$`))
  await workspace.getByRole("button", { name: "Build the geography", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${currentID}$`))

  const geography = workspace.getByRole("button", { name: "Geography", exact: true })
  await geography.click()
  await expect(geography).toHaveAttribute("aria-pressed", "true")

  const resources = page.locator("#file-tree-panel")
  await resources.getByRole("tab", { name: "World" }).click()
  await expect(resources.getByRole("button", { name: "geography" })).toBeVisible()
  await resources.getByRole("button", { name: "geography" }).click()
  await resources.getByRole("button", { name: "misty-mountains.md" }).click()
  await expect(page.getByText("contents:World/geography/misty-mountains.md", { exact: true })).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath("novelx-workspace.png"), fullPage: true })

  await workspace.getByRole("button", { name: "Collapse NovelX workspace" }).click()
  const expand = workspace.getByRole("button", { name: "Expand NovelX workspace" })
  await expect(expand).toBeVisible()
  await expand.click()
  await workspace.getByRole("button", { name: "New task" }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
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
