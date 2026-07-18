import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const draftID = "draft_new_session_panel_corner"
const directory = "C:/OpenCode/NewSessionPanelCorner"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test.use({
  viewport: { width: 1619, height: 972 },
  deviceScaleFactor: 1,
})

test("new session uses the square three-column NovelX shell", async ({ page }, testInfo) => {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_new_session_panel_corner",
      worktree: directory,
      vcs: "git",
      name: "new-session-panel-corner",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    fileList: () => [],
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
  await page.locator('aside[aria-label="开发性能诊断"]').evaluate((element) => {
    element.style.display = "none"
  })
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await expect(page.locator('[data-component="novelx-shell-toolbar"]')).toBeVisible()
  await expect(page.getByRole("complementary", { name: "NovelX 工作区" })).toBeVisible()
  await expect(page.locator("#file-tree-panel")).toBeVisible()
  await expect(page.getByRole("group", { name: "对话模式" })).toBeVisible()
  await expect(page.getByRole("button", { name: "自由" })).toBeDisabled()
  await expect(page.locator('[data-action="prompt-model"]')).not.toBeVisible()
  await expect(page.locator('[data-component="novelx-statusbar"]')).toBeVisible()
  await expect(page.locator('main div[class*="rounded-[10px]"][class*="overflow-hidden"]')).toHaveCount(0)

  const boxes = await Promise.all(
    [
      page.locator('[data-component="novelx-shell-toolbar"]'),
      page.getByRole("complementary", { name: "NovelX 工作区" }),
      page.locator("#file-tree-panel"),
      page.getByRole("group", { name: "对话模式" }),
      page.locator('[data-component="session-new-composer"]'),
      page.locator('[data-component="novelx-statusbar"]'),
    ].map((locator) => locator.boundingBox()),
  )
  expect(boxes.every(Boolean)).toBe(true)
  const [toolbar, workspace, resources, modes, composer, status] = boxes as NonNullable<(typeof boxes)[number]>[]
  const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2)
  near(toolbar.y, 29)
  near(toolbar.height, 47)
  near(workspace.width, 286)
  near(resources.x, 1231)
  near(resources.width, 388)
  near(modes.x, 299)
  near(modes.y, 803)
  near(composer.x, 299)
  near(composer.y, 848)
  near(composer.width, 919)
  near(composer.height, 86)
  near(status.y, 945)
  near(status.height, 27)
  await page.screenshot({ path: testInfo.outputPath("new-session-novelx-shell.png") })
})
