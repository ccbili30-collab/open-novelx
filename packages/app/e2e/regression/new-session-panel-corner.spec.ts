import { expect, test, type Locator } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const draftID = "draft_new_session_panel_corner"
const directory = "C:/OpenCode/NewSessionPanelCorner"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 })

test("NovelX 新会话遵守唯一外壳与六类资源切换契约", async ({ page }, testInfo) => {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_new_session_panel_corner",
      worktree: directory,
      vcs: "git",
      name: "中土世界",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    fileList: (path) => {
      if (!path) return [node("World", "directory"), node("README.md", "file")]
      if (path === "World") return [node("World/geography", "directory"), node("World/world.md", "file")]
      if (path === "World/geography") return [node("World/geography/north.md", "file")]
      return []
    },
    fileContent: (path) => ({ type: "text", content: `真实文件：${path}` }),
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ directory, draftID, server }) => {
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
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({
          review: { diffStyle: "split", panelOpened: false },
          fileTree: { opened: true, width: 388, tab: "all" },
        }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "draft", draftID, server, directory }]),
      )
    },
    { directory, draftID, server },
  )

  await page.goto(`/new-session?draftId=${draftID}`)
  await expectAppVisible(page.locator('[data-component="prompt-input"]'))
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")

  const titlebar = page.locator("[data-novelx-titlebar]")
  const navigation = page.locator(".novelx-project-navigation")
  const conversation = page.locator('[data-component="novelx-conversation-surface"]')
  const resources = page.locator("#file-tree-panel")
  const dock = page.getByRole("navigation", { name: "项目资源" })

  await expect(titlebar.getByRole("button", { name: "返回当前项目主页" })).toHaveText("NovelX")
  await expect(titlebar.getByRole("button", { name: "展开或收起项目与会话" })).toBeVisible()
  await expect(titlebar.getByRole("button", { name: "展开或收起项目资源" })).toBeVisible()
  await expect(page.locator('[data-component="novelx-shell-toolbar"]')).toHaveCount(0)
  await expect(page.locator('[data-component="novelx-statusbar"]')).toHaveCount(0)
  await expect(page.getByRole("complementary", { name: "NovelX 工作区" })).toBeVisible()
  await expect(resources.getByText("文件内容", { exact: true })).toBeVisible()
  await expect(dock.getByRole("button")).toHaveCount(6)
  for (const label of ["文件", "世界", "角色", "图谱", "故事", "世界包"]) {
    await expect(dock.getByRole("button", { name: label, exact: true })).toBeVisible()
  }

  await assertWidth(navigation, 300)
  await assertWidth(resources, 388)
  await page.screenshot({ path: testInfo.outputPath("novelx-home.png") })

  await dock.getByRole("button", { name: "世界", exact: true }).click()
  await expect(resources).toHaveClass(/is-expanded/)
  await expect(resources.locator('[data-resource="world"]')).toBeVisible()
  await assertWidth(navigation, 60)
  await assertWidth(conversation, 300)
  await expect(page.getByText("尚未选择 Atlas 场景", { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("novelx-world-expanded.png") })

  await page.getByRole("button", { name: "收起对话" }).click()
  await assertWidth(conversation, 0)
  await expect(page.getByRole("button", { name: "展开对话" })).toBeVisible()
  await page.getByRole("button", { name: "展开对话" }).click()
  await assertWidth(conversation, 300)

  await dock.getByRole("button", { name: "图谱", exact: true }).click()
  await expect(resources.locator('[data-resource="graph"]')).toBeVisible()
  await expect(page.getByText("这个工作面目前还没有可用的真实结构化数据。", { exact: true })).toBeVisible()

  await dock.getByRole("button", { name: "图谱", exact: true }).click()
  await expect(resources).not.toHaveClass(/is-expanded/)
  await assertWidth(navigation, 300)
  await assertWidth(resources, 388)

  await dock.getByRole("button", { name: "世界", exact: true }).click()
  await titlebar.getByRole("button", { name: "返回当前项目主页" }).click()
  await expect(resources).not.toHaveClass(/is-expanded/)
  await assertWidth(navigation, 300)

  await titlebar.getByRole("button", { name: "展开或收起项目资源" }).click()
  await expect(resources).toHaveClass(/is-collapsed/)
  await assertWidth(resources, 64)
  await titlebar.getByRole("button", { name: "展开或收起项目资源" }).click()
  await assertWidth(resources, 388)
})

async function assertWidth(locator: Locator, width: number) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs(box!.width - width)).toBeLessThanOrEqual(2)
}

function node(path: string, type: "file" | "directory") {
  const name = path.split("/").at(-1)!
  return { name, path, absolute: `${directory}/${path}`, type, ignored: false }
}
