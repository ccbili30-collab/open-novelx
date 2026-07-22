import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { createHash } from "node:crypto"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"
import { completedWorldFixtures } from "../fixtures/novelx-world-publication"

const directory = "C:/NovelX/MiddleEarth"
const projectID = "proj_novelx_middle_earth"
const currentID = "ses_novelx_current"
const stageEditorID = "ses_novelx_stage_editor"
const olderID = "ses_novelx_older"
const regularChildID = "ses_regular_explore_child"
const assistantID = "msg_novelx_geography_agent"
const userMessageID = "msg_novelx_user"
const toolPartID = "prt_novelx_write_readme"
const resumedAssistantID = "msg_zz_novelx_geography_child_resume"
const resumedTextPartID = "prt_zz_novelx_geography_text_resume"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 })

test("真实会话保留导航、置顶、资源文件与覆盖式项目面板", async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const growthManifest = await growthManifestFixture()
  const geographyMaterialization = await geographyMaterializationFixture(growthManifest)
  const worldBlueprint = await worldBlueprintFixture()
  const worldMaterialization = await worldMaterializationFixture(worldBlueprint)
  const completedFixtures = await completedWorldFixtures(worldMaterialization)
  const { integritySha256: _publicationIntegrity, ...publicationDraft } = completedFixtures.publication
  const stalePublicationDraft = { ...publicationDraft, worldVisualIntegritySha256: "f".repeat(64) }
  const stalePublication = {
    ...stalePublicationDraft,
    integritySha256: createHash("sha256").update(JSON.stringify(stalePublicationDraft)).digest("hex"),
  }
  let completedWorld = false
  let useStalePublication = false
  let editable = "---\r\ntitle: 中土世界\r\n---\r\n# 世界总览\r\n\r\n群山环绕着古老王国。\r\n"
  let saved: { content: string; expectedContent: string; expectedBom: boolean } | undefined
  let conflictNext = false
  const events: unknown[] = []
  const messageRequests: { sessionID: string; phase: "start" | "end" }[] = []
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
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
      { ...session(currentID, "构建地理", 4), agent: "growth" },
      session(olderID, "建立第一批王国", 2),
      { ...session(stageEditorID, "阶段：恒星与轨道环境", 4.5), parentID: currentID, agent: "novelx-stage-editor" },
      { ...session("ses_child", "世界：赫利俄斯同步环", 5), parentID: stageEditorID, agent: "novelx-world-writer" },
      { ...session(regularChildID, "普通探索会话", 4.8), parentID: currentID, agent: "explore" },
      { ...session("ses_archived", "已归档草稿", 6), time: { created: 6, updated: 6, archived: 7 } },
    ],
    vcsDiff: [],
    fileList: (path) => {
      if (!path) return [node("World\\", "directory"), node("README.md", "file")]
      if (path === "World") return [node("World/geography", "directory"), node("World/world.md", "file")]
      if (path === "World/geography") return [node("World/geography/misty-mountains.md", "file")]
      return []
    },
    fileContent: (path) =>
      path === "World/Media/world-map.png" ||
      path.startsWith("World/Media/maps/") ||
      path === "World/Media/scenery/helios-ring.png"
        ? {
            type: "binary",
            content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            encoding: "base64",
            mimeType: "image/png",
          }
        : { type: "text", content: `真实内容：${path}` },
    fileEditable: (path) =>
      path === ".novelx/growth/skeleton.json"
        ? { type: "text", content: JSON.stringify(growthManifest), bom: false }
        : path === ".novelx/growth/world-blueprint.json"
          ? { type: "text", content: JSON.stringify(worldBlueprint), bom: false }
          : path === ".novelx/growth/world-materialization.json"
            ? {
                type: "text",
                content: JSON.stringify(completedWorld ? completedFixtures.materialization : worldMaterialization),
                bom: false,
              }
            : path === ".novelx/growth/geography-materialization.json"
              ? { type: "text", content: JSON.stringify(geographyMaterialization), bom: false }
              : path === ".novelx/visuals/world-visuals.json"
                ? completedWorld
                  ? { type: "text", content: JSON.stringify(completedFixtures.visual), bom: false }
                  : undefined
                : path === ".novelx/publication/world-publication.json"
                  ? completedWorld
                    ? {
                        type: "text",
                        content: JSON.stringify(useStalePublication ? stalePublication : completedFixtures.publication),
                        bom: false,
                      }
                    : undefined
                  : path === "World/Atlas/entity-helios-ring/图志.md"
                    ? { type: "text", content: completedFixtures.atlasText, bom: false }
                    : path === "World/Atlas/entity-helios-ring/纪行.md"
                      ? { type: "text", content: completedFixtures.travelogueText, bom: false }
                      : path === "README.md"
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
    pageMessages: (sessionID) => ({
      items:
        sessionID === currentID
          ? agentMessages()
          : sessionID === stageEditorID
            ? stageEditorMessages()
            : sessionID === "ses_child"
              ? worldChildMessages()
              : [],
    }),
    onMessages: ({ sessionID, phase }) => {
      messageRequests.push({ sessionID, phase })
    },
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

  const conversation = page.locator('[data-component="novelx-session-panel"]')
  await expect(conversation.getByText("/growth 构建一个中土世界", { exact: true })).toBeVisible()
  await expect(conversation.getByText("世界已经开始生长。", { exact: true })).toBeVisible()
  await expect(conversation.getByText("private Growth orchestration prompt", { exact: true })).toHaveCount(0)
  await expect(conversation.getByText("private chain of thought", { exact: true })).toHaveCount(0)
  await expect(conversation.locator('[data-component="tool-part"]')).toHaveCount(0)

  await page.goto(`/server/${base64Encode(server)}/session/${stageEditorID}`)
  await expect(page).toHaveURL(new RegExp(`/session/${currentID}$`))
  await page.goto(`/server/${base64Encode(server)}/session/${regularChildID}`)
  await expect(page).toHaveURL(new RegExp(`/session/${regularChildID}$`))
  await page.goto(`/server/${base64Encode(server)}/session/${currentID}`)

  const workspace = page.getByRole("complementary", { name: "NovelX 工作区" })
  await expect(workspace.getByText("构建地理", { exact: true })).toBeVisible()
  await expect(workspace.getByText("建立第一批王国", { exact: true })).toBeVisible()
  await expect(workspace.getByText("内部地理工作者", { exact: true })).toHaveCount(0)
  await expect(workspace.getByText("已归档草稿", { exact: true })).toHaveCount(0)

  const olderRow = workspace.locator(".novelx-session-row").filter({ hasText: "建立第一批王国" })
  await olderRow.getByRole("button", { name: "置顶快捷方式" }).click()
  const olderShortcut = page.getByRole("button", { name: "快捷方式：建立第一批王国", exact: true })
  await expect(olderShortcut).toBeVisible()
  await olderShortcut.click({ button: "right" })
  await expect(page.getByText("取消固定", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await olderRow.click({ button: "right" })
  await expect(page.getByText("删除会话", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")

  await olderRow.getByRole("button", { name: "建立第一批王国", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${olderID}$`))
  await workspace.getByRole("button", { name: "构建地理", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${currentID}$`))
  await olderShortcut.dragTo(page.getByLabel("垃圾桶", { exact: true }))
  await expect(olderShortcut).toHaveCount(0)

  const resources = page.locator("#file-tree-panel")
  const dock = page.getByRole("navigation", { name: "项目资源" })
  await dock.getByRole("button", { name: "世界", exact: true }).click()
  await expect(resources.getByText("日环档案 · 0/1 份世界档案已提交", { exact: true })).toBeVisible()
  await expect(resources.locator(".novelx-terrain-atlas")).toBeVisible()
  await expect(resources.getByText("世界正在生长", { exact: true })).toBeVisible()
  await expect(resources.getByRole("button", { name: "Growth 总主编", exact: true })).toBeVisible()
  await expect(resources.getByRole("button", { name: "阶段主编", exact: true })).toBeVisible()
  await resources.getByRole("button", { name: "赫利俄斯同步环", exact: true }).click()
  await expect
    .poll(() => messageRequests.filter((item) => item.sessionID === "ses_child" && item.phase === "end").length)
    .toBeGreaterThan(0)
  expect(pageErrors).toEqual([])
  await expect(resources.getByText("流式草稿 · 只读", { exact: true })).toBeVisible()
  await expect(resources.locator(".novelx-geography-stream pre")).toContainText(
    "强辐射与散热上限共同限制同步环的连续输出。",
  )
  await expect(resources.getByText("Context Pack", { exact: true })).toHaveCount(0)
  events.push(childResumeMessageEvent())
  events.push(childResumePartEvent())
  events.push(childResumeDeltaEvent("# 赫利俄斯同步环\n\n实时增量一"))
  await expect(resources.locator(".novelx-geography-stream pre")).toHaveText("# 赫利俄斯同步环\n\n实时增量一")
  await expect(resources.locator('.novelx-geography-draft[data-document-locked="true"]')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/session/${currentID}$`))
  events.push(childResumeDeltaEvent("，实时增量二。"))
  await expect(resources.locator(".novelx-geography-stream pre")).toHaveText(
    "# 赫利俄斯同步环\n\n实时增量一，实时增量二。",
  )
  await expect(resources.locator(".novelx-resource-inspector-heading")).toContainText("赫利俄斯同步环")
  await expect(
    resources.getByText("围绕恒星运行的采能、通信与维护轨道集合，为整个系统提供能源和统一时标。", { exact: true }),
  ).toBeVisible()
  await expect(
    resources.locator(".novelx-growth-tree-label").filter({
      hasText: /(?:地形|地点|区域|大陆|海域|山脉|平原|河流|湖泊|岛屿|群岛)\s*0*\d+/u,
    }),
  ).toHaveCount(0)

  const conversationBox = await page.locator('[data-component="novelx-session-panel"]').boundingBox()
  const navigatorBox = await resources.locator(".novelx-resource-navigator").boundingBox()
  const primaryBox = await resources.locator(".novelx-resource-primary").boundingBox()
  const worldInspectorBox = await resources.locator(".novelx-resource-inspector").boundingBox()
  expect(conversationBox).not.toBeNull()
  expect(navigatorBox).not.toBeNull()
  expect(primaryBox).not.toBeNull()
  expect(worldInspectorBox).not.toBeNull()
  expect(navigatorBox!.x).toBeGreaterThanOrEqual(conversationBox!.x + conversationBox!.width - 1)
  expect(primaryBox!.x).toBeGreaterThanOrEqual(navigatorBox!.x + navigatorBox!.width - 1)
  expect(worldInspectorBox!.x).toBeGreaterThanOrEqual(primaryBox!.x + primaryBox!.width - 1)
  expect(primaryBox!.width).toBeGreaterThan(500)

  await page.setViewportSize({ width: 1024, height: 768 })
  const narrowPrimaryBox = await resources.locator(".novelx-resource-primary").boundingBox()
  const narrowInspectorBox = await resources.locator(".novelx-resource-inspector").boundingBox()
  expect(narrowPrimaryBox).not.toBeNull()
  expect(narrowInspectorBox).not.toBeNull()
  expect(narrowInspectorBox!.x).toBeLessThan(narrowPrimaryBox!.x + narrowPrimaryBox!.width)
  await page.setViewportSize({ width: 1672, height: 941 })

  await page.locator('[aria-label="开发性能诊断"]').evaluate((element) => element.remove())
  await page.screenshot({ path: testInfo.outputPath("novelx-world-expanded.png") })

  completedWorld = true
  useStalePublication = true
  events.push({
    directory,
    payload: {
      type: "file.watcher.updated",
      properties: { file: ".novelx/growth/world-materialization.json" },
    },
  })
  await expect(resources.getByText("1 项", { exact: true })).toBeVisible()
  await expect(resources.getByText("Growth 总主编", { exact: true })).toHaveCount(0)
  await expect(resources.getByText("阶段主编", { exact: true })).toHaveCount(0)

  await page.reload()
  await expect(resources.locator(".novelx-world-atlas")).toBeVisible()
  await expect(resources.getByText("世界生长状态无法读取", { exact: true })).toHaveCount(0)
  await expect(resources.locator(".novelx-world-atlas image")).toHaveCount(1)
  await expect(resources.locator(".novelx-world-atlas image")).toHaveAttribute("data-map-task-id", "image-world-map")
  await expect(resources.getByText(/Growth 总主编|阶段主编|执行 Agent|注册事实|事实依据|因果推演/u)).toHaveCount(0)

  useStalePublication = false
  await page.reload()
  await expect(resources.locator(".novelx-world-atlas")).toBeVisible()

  const mapMain = resources.locator(".novelx-world-atlas-main")
  const geographyRegion = resources.locator(".novelx-world-map-region").first()
  const geographyLabel = resources.locator(".novelx-world-map-label").first()
  await geographyLabel.click()
  await expect(geographyRegion.locator("..")).toHaveClass(/is-selected/u)
  await expect(geographyRegion).toHaveCSS("fill", "rgba(0, 0, 0, 0)")
  await expect(geographyRegion).toHaveCSS("stroke", "rgba(0, 0, 0, 0)")
  await expect(resources.locator(".novelx-world-atlas image")).toHaveAttribute(
    "data-map-task-id",
    "image-world-map-geography-selected",
  )
  await expect(mapMain).not.toHaveClass(/is-focused/u)
  await expect(resources.locator(".novelx-world-map-details")).toHaveCount(0)

  await geographyLabel.click()
  await expect(mapMain).toHaveClass(/is-focused/u)
  await expect(resources.locator(".novelx-world-atlas image")).toHaveAttribute(
    "data-map-task-id",
    "image-world-map-geography-selected",
  )
  const mapDetails = resources.getByRole("complementary", { name: "赫利俄斯同步环详细内容" })
  await expect(mapDetails).toBeVisible()
  await expect(mapDetails.getByText("地理", { exact: true })).toBeVisible()
  await expect(mapDetails).toContainText("环带在晨昏线外侧收拢成一条冷亮弧线")
  await mapDetails.getByRole("button", { name: "纪行", exact: true }).click()
  await expect(mapDetails).toContainText("署名：无名驿路抄写员")
  await expect(mapDetails).toContainText("我是在第三次警报之后看见那道弧光的")

  await geographyLabel.click()
  await expect(mapMain).not.toHaveClass(/is-focused/u)
  await expect(resources.locator(".novelx-world-map-details")).toHaveCount(0)
  await expect(geographyRegion.locator("..")).not.toHaveClass(/is-selected/u)
  await expect(resources.locator(".novelx-world-atlas image")).toHaveAttribute("data-map-task-id", "image-world-map")

  await resources.getByRole("button", { name: "国家", exact: true }).click()
  const humanRegion = resources.locator(".novelx-world-map-region").first()
  const humanLabel = resources.locator(".novelx-world-map-label").first()
  await humanLabel.click()
  await expect(humanRegion.locator("..")).toHaveClass(/is-selected/u)
  await expect(resources.locator(".novelx-world-atlas image")).toHaveAttribute(
    "data-map-task-id",
    "image-world-map-human-selected",
  )
  await humanLabel.click()
  await expect(resources.getByRole("complementary", { name: "赫利俄斯同步环详细内容" })).toContainText("国家")
  await page.screenshot({ path: testInfo.outputPath("novelx-world-completed-map.png") })

  await dock.getByRole("button", { name: "世界包", exact: true }).click()
  const worldPackage = resources.locator(".novelx-world-package-view")
  await expect(worldPackage).toBeVisible()
  await expect(worldPackage.getByRole("button", { name: "导出 .zib" })).toHaveCount(0)
  await worldPackage.getByRole("button", { name: "打开世界包" }).click()
  await expect(worldPackage.locator(".novelx-package-map-page")).toHaveClass(/is-active/u)
  const packageRegion = worldPackage.getByRole("button", { name: "查看赫利俄斯同步环" }).first()
  await packageRegion.press("Enter")
  await worldPackage.locator(".novelx-package-map-caption").click()
  const packageReader = worldPackage.getByRole("article", { name: "世界包正文阅读" })
  await expect(packageReader).toBeVisible()
  await expect(packageReader).toContainText("World/")
  await packageReader.getByRole("button", { name: "返回世界包" }).click()
  await expect(packageReader).toHaveCount(0)
  await expect(packageRegion).toHaveClass(/is-selected/u)

  await worldPackage.getByRole("button", { name: "前往历史与小说" }).click()
  await expect(worldPackage.locator(".novelx-package-archive-page")).toHaveClass(/is-active/u)
  const atlasBook = worldPackage.getByRole("button", { name: /赫利俄斯同步环图志/u })
  await atlasBook.press("Enter")
  await atlasBook.press("Enter")
  await expect(packageReader).toContainText("环带在晨昏线外侧收拢成一条冷亮弧线")
  await page.waitForTimeout(450)
  await page.screenshot({ path: testInfo.outputPath("novelx-world-package-reader.png") })
  await packageReader.getByRole("button", { name: "返回世界包" }).click()
  await expect(packageReader).toHaveCount(0)
  await expect(atlasBook).toHaveClass(/is-selected/u)

  await worldPackage.getByRole("button", { name: "前往世界图谱" }).click()
  await expect(worldPackage.locator(".novelx-package-graph-page")).toHaveClass(/is-active/u)
  const packageGraph = worldPackage.getByRole("region", { name: "世界关系图谱" })
  await expect(packageGraph.locator(".novelx-neural-graph-node")).toHaveCount(1)
  await expect(packageGraph.locator(".novelx-neural-graph-toolbar")).toContainText("1 个节点")
  await expect(worldPackage.locator(".novelx-package-node")).toHaveCount(0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: testInfo.outputPath("novelx-world-package-graph.png") })

  await dock.locator(".novelx-resource-dock-button").nth(3).click()
  const graph = resources.locator(".novelx-neural-graph")
  await expect(graph).toBeVisible()
  await expect(resources.locator('[data-resource="graph"] .novelx-resource-navigator')).toBeHidden()
  await expect(graph.locator(".novelx-neural-graph-node")).toHaveCount(1)
  await expect(graph.locator(".novelx-neural-graph-toolbar")).toContainText("1 个节点")
  await expect(graph.locator(".novelx-neural-graph-toolbar")).toContainText("0 条关系")
  await page.setViewportSize({ width: 1069, height: 809 })
  await expect(graph.getByRole("button", { name: "刷新图谱" })).toBeVisible()
  await graph.getByRole("button", { name: "刷新图谱" }).click()
  await page.setViewportSize({ width: 1672, height: 941 })
  await expect(graph.getByRole("status")).toHaveText("图谱已刷新")
  await expect(graph.locator(".novelx-neural-graph-node")).toHaveCount(1)
  const graphNodeBox = await graph.locator(".novelx-neural-graph-node").boundingBox()
  expect(graphNodeBox).not.toBeNull()
  await page.mouse.click(graphNodeBox!.x + graphNodeBox!.width / 2, graphNodeBox!.y + graphNodeBox!.height / 2)
  const graphCard = graph.locator(".novelx-neural-graph-card")
  await expect(graphCard).toBeVisible()
  await expect(graphCard).toContainText("World/")
  await expect(graphCard).toHaveCSS("opacity", "1")
  await page.screenshot({ path: testInfo.outputPath("novelx-neural-graph.png") })
  await graphCard.click()
  await expect(resources.locator(".novelx-document-editor")).toBeVisible()

  // Regression: a remembered file must never cover the graph surface after switching back.
  await dock.locator(".novelx-resource-dock-button").nth(3).click()
  await expect(resources.locator('[data-resource="graph"] .novelx-neural-graph')).toBeVisible()
  await expect(resources.locator('[data-resource="graph"] .novelx-document-editor')).toHaveCount(0)

  await dock.getByRole("button", { name: "文件", exact: true }).click()
  await expect(resources.locator('[data-resource="files"]')).toBeVisible()
  await resources.getByRole("button", { name: "World\\", exact: true }).click()
  await expect(resources.locator(".novelx-document-editor")).toBeVisible()
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

  // Regression: a remembered file belongs to the file surface and must not replace world/package previews.
  await dock.getByRole("button", { name: "世界", exact: true }).click()
  await expect(resources.locator('[data-resource="world"] .novelx-world-atlas')).toBeVisible()
  await expect(resources.locator('[data-resource="world"] .novelx-document-editor')).toHaveCount(0)
  await dock.getByRole("button", { name: "世界包", exact: true }).click()
  await expect(resources.locator('[data-resource="package"] .novelx-world-package-view')).toBeVisible()
  await expect(resources.locator('[data-resource="package"] .novelx-document-editor')).toHaveCount(0)
  await dock.getByRole("button", { name: "文件", exact: true }).click()
  await expect(resources.locator('[data-resource="files"] .novelx-document-editor')).toBeVisible()

  events.push(toolEvent("running"))
  await expect(editor.getByText("growth 正在编辑这个文件；该操作停止前，此处只读。", { exact: true })).toBeVisible()
  await expect(source).toBeDisabled()
  events.push(toolEvent("completed"))
  await expect(source).toBeEnabled()

  const inspector = resources.locator(".novelx-resource-inspector")
  await expect(inspector).toBeVisible()
  await expect(resources.locator(".novelx-resource-navigator")).toHaveCSS("width", "223px")
  await expect(inspector).toHaveCSS("width", "304px")
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
  await page.locator('[aria-label="开发性能诊断"]').evaluate((element) => element.remove())
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
        agent: "growth",
        model: { providerID: "opencode", modelID: "test" },
      },
      parts: [
        {
          id: "prt_novelx_growth_visible_command",
          sessionID: currentID,
          messageID: userMessageID,
          type: "text",
          text: "/growth 构建一个中土世界",
          ignored: true,
        },
        {
          id: "prt_novelx_growth_private_prompt",
          sessionID: currentID,
          messageID: userMessageID,
          type: "text",
          text: "private Growth orchestration prompt",
          synthetic: true,
        },
        {
          id: "prt_novelx_growth_legacy_private_prompt",
          sessionID: currentID,
          messageID: userMessageID,
          type: "text",
          text: "为当前 NovelX 项目启动 Growth（生长），完成世界工作面。\n用户补充要求：中土世界\n蓝图注册完成不是终点。",
        },
      ],
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
        mode: "growth",
        agent: "growth",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [
        {
          id: "prt_novelx_growth_reasoning",
          sessionID: currentID,
          messageID: assistantID,
          type: "reasoning",
          text: "private chain of thought",
          time: { start: 1700000001000, end: 1700000001500 },
        },
        {
          id: "prt_novelx_geography_task",
          sessionID: currentID,
          messageID: assistantID,
          type: "tool",
          callID: "call_novelx_geography_task",
          tool: "task",
          state: {
            status: "running",
            input: {
              description: "阶段：恒星与轨道环境",
              prompt: "Frozen blueprint and ledger",
              subagent_type: "novelx-stage-editor",
            },
            metadata: { sessionId: stageEditorID, parentSessionId: currentID },
            time: { start: 1700000002000 },
          },
        },
        {
          id: "prt_novelx_growth_public_text",
          sessionID: currentID,
          messageID: assistantID,
          type: "text",
          text: "世界已经开始生长。",
        },
      ],
    },
  ]
}

function stageEditorMessages() {
  return [
    {
      info: {
        id: "msg_stage_editor_user",
        sessionID: stageEditorID,
        role: "user",
        time: { created: 1700000001500 },
        summary: { diffs: [] },
        agent: "novelx-stage-editor",
        model: { providerID: "opencode", modelID: "test" },
      },
      parts: [],
    },
    {
      info: {
        id: "msg_stage_editor_assistant",
        sessionID: stageEditorID,
        role: "assistant",
        time: { created: 1700000001800 },
        parentID: "msg_stage_editor_user",
        modelID: "test",
        providerID: "opencode",
        mode: "novelx-stage-editor",
        agent: "novelx-stage-editor",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [
        {
          id: "prt_stage_world_task",
          sessionID: stageEditorID,
          messageID: "msg_stage_editor_assistant",
          type: "tool",
          callID: "call_stage_world_task",
          tool: "task",
          state: {
            status: "running",
            input: {
              description: "世界：赫利俄斯同步环",
              prompt: "Exact source-bound Context Pack",
              subagent_type: "novelx-world-writer",
            },
            metadata: { sessionId: "ses_child", parentSessionId: stageEditorID },
            time: { start: 1700000002000 },
          },
        },
      ],
    },
  ]
}

function worldChildMessages() {
  return [
    {
      info: {
        id: "msg_novelx_geography_child_user",
        sessionID: "ses_child",
        role: "user",
        time: { created: 1700000002200 },
        summary: { diffs: [] },
        agent: "novelx-world-writer",
        model: { providerID: "opencode", modelID: "test" },
      },
      parts: [
        {
          id: "prt_novelx_geography_context",
          sessionID: "ses_child",
          messageID: "msg_novelx_geography_child_user",
          type: "text",
          text: "Context Pack",
        },
      ],
    },
    {
      info: {
        id: "msg_novelx_geography_child",
        sessionID: "ses_child",
        role: "assistant",
        time: { created: 1700000002500 },
        parentID: "msg_novelx_geography_child_user",
        modelID: "test",
        providerID: "opencode",
        mode: "novelx-world-writer",
        agent: "novelx-world-writer",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [
        {
          id: "prt_novelx_geography_text",
          sessionID: "ses_child",
          messageID: "msg_novelx_geography_child",
          type: "text",
          text: "# 赫利俄斯同步环\n\n## 事实依据\n\n强辐射与散热上限共同限制同步环的连续输出。",
        },
      ],
    },
  ]
}

function childResumeMessageEvent() {
  return {
    directory,
    payload: {
      type: "message.updated",
      properties: {
        info: {
          id: resumedAssistantID,
          sessionID: "ses_child",
          role: "assistant",
          time: { created: 1700000002700 },
          parentID: "msg_novelx_geography_child_user",
          modelID: "test",
          providerID: "opencode",
          mode: "novelx-world-writer",
          agent: "novelx-world-writer",
          path: { cwd: directory, root: directory },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      },
    },
  }
}

function childResumePartEvent() {
  return {
    directory,
    payload: {
      type: "message.part.updated",
      properties: {
        part: {
          id: resumedTextPartID,
          sessionID: "ses_child",
          messageID: resumedAssistantID,
          type: "text",
          text: "",
        },
      },
    },
  }
}

function childResumeDeltaEvent(delta: string) {
  return {
    directory,
    payload: {
      type: "message.part.delta",
      properties: {
        sessionID: "ses_child",
        messageID: resumedAssistantID,
        partID: resumedTextPartID,
        field: "text",
        delta,
      },
    },
  }
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

async function growthManifestFixture() {
  const sha256 = async (value: unknown) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  }
  const profileNodes = [
    terrainProfile(
      "埃兰大陆",
      "continent",
      null,
      "core",
      12,
      10,
      72,
      76,
      "占据世界中央的主大陆，北高南低，山脉与河谷共同切分内部区域。",
      "古老陆块经多次抬升与侵蚀形成，承担整张地图的空间母体。",
    ),
    terrainProfile(
      "西陲苍海",
      "ocean",
      null,
      "major",
      0,
      12,
      18,
      72,
      "包围大陆西侧的深水海域，海岸线曲折并散布外海岛链。",
      "大陆边缘快速沉降形成深水洋盆，为西岸提供明确外部边界。",
    ),
    terrainProfile(
      "南境暖海",
      "sea",
      null,
      "major",
      18,
      78,
      66,
      20,
      "贴近大陆南缘的温暖内海，与主要河口和沿岸浅滩相连。",
      "南部陆架缓慢下沉形成浅海，承接大陆主要水系的入海口。",
    ),
    terrainProfile(
      "北境冠脉",
      "mountain_range",
      0,
      "core",
      24,
      18,
      48,
      16,
      "横贯大陆北部的高大山系，连续雪峰构成最醒目的东西向屏障。",
      "大陆北缘挤压隆起形成连续褶皱山系，控制北部通行与水系源头。",
    ),
    terrainProfile(
      "中央沃原",
      "plain",
      0,
      "major",
      30,
      40,
      38,
      28,
      "位于山脉南侧的广阔冲积平原，地势舒缓并由多条支流切割。",
      "山地沉积物长期向南堆积，形成连片低地与宽阔河谷。",
    ),
    terrainProfile(
      "白河",
      "river",
      0,
      "major",
      48,
      29,
      8,
      55,
      "发源于北境冠脉，穿过中央沃原后向南汇入暖海。",
      "高山融水汇集成稳定干流，把北部高地与南部海岸连接起来。",
    ),
    terrainProfile(
      "西风海岸",
      "coast",
      0,
      "supporting",
      14,
      34,
      12,
      42,
      "大陆西缘面向苍海的狭长海岸，海岬、港湾与陡崖交替出现。",
      "海浪侵蚀抬升岩岸并切出深湾，形成大陆与外海的主要接触带。",
    ),
    terrainProfile(
      "暮潮群岛",
      "archipelago",
      1,
      "supporting",
      3,
      38,
      12,
      24,
      "散布在西陲苍海外缘的岛链，与大陆西岸隔着多条潮汐水道。",
      "沉没山脊的高点露出海面，排列成由东北向西南延伸的群岛。",
    ),
  ]
  const profile = {
    title: "埃兰世界",
    genre: { family: "fantasy", label: "经典中土大世界魔幻", scale: "主大陆及周边海域" },
    designSummary: "一块由北方高山脊柱、中央低地与南部暖海共同塑造的主大陆，东西海岸形成清晰边界。",
    nodes: profileNodes,
    relations: [
      {
        fromNodeIndex: 3,
        toNodeIndex: 4,
        kind: "borders",
        summary: "北境冠脉沿中央沃原北缘延伸，构成高地与低地的清晰边界。",
      },
      {
        fromNodeIndex: 5,
        toNodeIndex: 4,
        kind: "crosses",
        summary: "白河自北向南穿过中央沃原，形成贯穿平原的主水道。",
      },
      { fromNodeIndex: 5, toNodeIndex: 2, kind: "flows_into", summary: "白河在大陆南缘形成河口，并最终汇入南境暖海。" },
      { fromNodeIndex: 6, toNodeIndex: 1, kind: "opens_to", summary: "西风海岸的港湾与海峡全部向西陲苍海敞开。" },
    ],
  }
  const terrainNodes = profileNodes.map((node, index) => ({
    id: `terrain-${index}`,
    name: node.name,
    kind: node.kind,
    parentId: node.parentNodeIndex === null ? null : `terrain-${node.parentNodeIndex}`,
    ordinal: index + 1,
    prominence: node.prominence,
    summary: node.summary,
    formation: node.formation,
    map: node.map,
    status: "registered",
  }))
  const draft = {
    schemaVersion: 2,
    stage: "terrain_registration",
    status: "registered",
    registeredAt: 1,
    source: {
      sessionId: currentID,
      messageId: userMessageID,
      toolCallId: "call_growth",
      profileSha256: await sha256(profile),
    },
    profile,
    terrain: {
      nodes: terrainNodes,
      relations: profile.relations.map((relation, index) => ({
        id: `relation-${index}`,
        fromId: `terrain-${relation.fromNodeIndex}`,
        toId: `terrain-${relation.toNodeIndex}`,
        kind: relation.kind,
        summary: relation.summary,
        status: "registered",
      })),
    },
  }
  return { ...draft, integritySha256: await sha256(draft) }
}

async function geographyMaterializationFixture(skeleton: Awaited<ReturnType<typeof growthManifestFixture>>) {
  const sha256 = async (value: unknown) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  }
  const draft = {
    schemaVersion: 1,
    stage: "geography_materialization",
    status: "running",
    skeletonIntegritySha256: skeleton.integritySha256,
    growthSessionId: currentID,
    startedAt: 1700000002000,
    updatedAt: 1700000002500,
    records: skeleton.terrain.nodes.map((terrain) => ({
      terrainId: terrain.id,
      targetPath: `World/地理/${terrain.name}.md`,
      draftPath: `.novelx/growth/drafts/${terrain.id}.md`,
      status: terrain.name === "北境冠脉" ? "leased" : "registered",
      lease:
        terrain.name === "北境冠脉"
          ? {
              id: "nx-lease-north",
              ownerSessionId: currentID,
              ownerMessageId: userMessageID,
              acquiredAt: 1700000002000,
            }
          : null,
      taskSessionId: null,
      draftSha256: null,
      committedSha256: null,
      updatedAt: 1700000002500,
      errorCode: null,
    })),
  }
  return { ...draft, integritySha256: await sha256(draft) }
}

async function worldBlueprintFixture() {
  const sha256 = async (value: unknown) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  }
  const profile = {
    title: "日环档案",
    genre: { family: "science fiction", label: "轨道殖民科技题材", scale: "单恒星系" },
    designSummary: "从恒星辐射、轨道窗口和能源边界出发，让设施与组织沿真实依赖逐层生长。",
    stages: [
      {
        label: "恒星与轨道环境",
        purpose: "建立后续设施与组织必须遵守的能源、辐射、通信和通行边界。",
        itemCount: 1,
        dependsOnStageIndices: [],
        reasoningFocus: ["辐射怎样限制长期活动", "轨道窗口怎样限制交通和维护"],
        documentSections: ["空间结构", "物理环境", "资源与通行", "风险与边界"],
      },
    ],
  }
  const stage = {
    id: "stage-orbit",
    label: "恒星与轨道环境",
    ordinal: 1,
    purpose: profile.stages[0]!.purpose,
    itemCount: 1,
    dependsOnStageIds: [],
    reasoningFocus: profile.stages[0]!.reasoningFocus,
    documentSections: ["事实依据", "因果推演", ...profile.stages[0]!.documentSections],
    status: "registered",
  }
  const draft = {
    schemaVersion: 1,
    stage: "world_blueprint",
    status: "registered",
    registeredAt: 1700000001000,
    source: {
      sessionId: currentID,
      messageId: userMessageID,
      toolCallId: "call-world-blueprint",
      profileSha256: await sha256(profile),
    },
    profile,
    stages: [stage],
  }
  return { ...draft, integritySha256: await sha256(draft) }
}

async function worldMaterializationFixture(blueprint: Awaited<ReturnType<typeof worldBlueprintFixture>>) {
  const sha256 = async (value: unknown) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  }
  const stage = blueprint.stages[0]!
  const entity = {
    id: "entity-helios-ring",
    stageId: stage.id,
    name: "赫利俄斯同步环",
    typeLabel: "采能与通信轨道带",
    ordinal: 1,
    summary: "围绕恒星运行的采能、通信与维护轨道集合，为整个系统提供能源和统一时标。",
    facts: [
      { label: "轨道", detail: "节点通过共振轨道轮换避开周期性高粒子流。" },
      { label: "能源", detail: "近星阵列输出受散热和材料疲劳限制。" },
      { label: "通信", detail: "恒星遮挡造成周期性断联窗口。" },
    ],
    constraints: ["强辐射与散热上限使载人维护只能在有限窗口进行。"],
    upstreamBindings: [],
    status: "registered",
  }
  const draft = {
    schemaVersion: 2,
    stage: "world_materialization",
    status: "running",
    blueprintIntegritySha256: blueprint.integritySha256,
    growthSessionId: currentID,
    startedAt: 1700000002000,
    updatedAt: 1700000002500,
    stages: [
      {
        stageId: stage.id,
        status: "registered",
        editorSessionId: stageEditorID,
        sourceReads: [],
        preparedContextSha256: "a".repeat(64),
        preparedAt: 1700000002000,
        registeredAt: 1700000002100,
        entities: [entity],
        relations: [],
        handoff: null,
      },
    ],
    documents: [
      {
        entityId: entity.id,
        stageId: stage.id,
        targetPath: "World/01-恒星与轨道环境/赫利俄斯同步环.md",
        draftPath: `.novelx/growth/world-drafts/${entity.id}.md`,
        status: "leased",
        lease: {
          id: "lease-helios",
          ownerSessionId: stageEditorID,
          ownerMessageId: userMessageID,
          acquiredAt: 1700000002200,
        },
        taskSessionId: null,
        draftSha256: null,
        committedSha256: null,
        updatedAt: 1700000002500,
        errorCode: null,
      },
    ],
    memoryCheckpoints: [],
  }
  return { ...draft, integritySha256: await sha256(draft) }
}

function terrainProfile(
  name: string,
  kind: string,
  parentNodeIndex: number | null,
  prominence: string,
  x: number,
  y: number,
  width: number,
  height: number,
  summary: string,
  formation: string,
) {
  return { name, kind, parentNodeIndex, prominence, summary, formation, map: { x, y, width, height } }
}
