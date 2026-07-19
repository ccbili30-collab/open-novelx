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
  const growthManifest = await growthManifestFixture()
  const geographyMaterialization = await geographyMaterializationFixture(growthManifest)
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
      { ...session("ses_child", "地理：北境冠脉", 5), parentID: currentID, agent: "novelx-geography" },
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
      path === ".novelx/growth/skeleton.json"
        ? { type: "text", content: JSON.stringify(growthManifest), bom: false }
        : path === ".novelx/growth/geography-materialization.json"
          ? { type: "text", content: JSON.stringify(geographyMaterialization), bom: false }
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
      items: sessionID === currentID ? agentMessages() : sessionID === "ses_child" ? geographyChildMessages() : [],
    }),
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
  await dock.getByRole("button", { name: "世界", exact: true }).click()
  await expect(resources.getByText("埃兰世界 · 0/8 份地理档案已提交", { exact: true })).toBeVisible()
  await expect(resources.locator(".novelx-terrain-atlas")).toBeVisible()
  await expect(resources.getByText("地图尚未生成", { exact: true })).toBeVisible()
  await resources.getByRole("button", { name: "北境冠脉", exact: true }).click()
  await expect(resources.getByText("流式草稿 · 只读", { exact: true })).toBeVisible()
  await expect(resources.locator(".novelx-geography-stream pre")).toContainText(
    "北境冠脉控制大陆北部的高差与主要水系源头。",
  )
  await expect(resources.locator(".novelx-resource-inspector-heading")).toContainText("北境冠脉")
  await expect(
    resources.getByText("横贯大陆北部的高大山系，连续雪峰构成最醒目的东西向屏障。", { exact: true }),
  ).toBeVisible()
  await expect(
    resources.locator(".novelx-growth-tree-label").filter({
      hasText: /(?:地形|地点|区域|大陆|海域|山脉|平原|河流|湖泊|岛屿|群岛)\s*0*\d+/u,
    }),
  ).toHaveCount(0)
  await page.locator('[aria-label="开发性能诊断"]').evaluate((element) => element.remove())
  await page.screenshot({ path: testInfo.outputPath("novelx-world-expanded.png") })
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
      parts: [
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
              description: "地理：北境冠脉",
              prompt: "Context Pack",
              subagent_type: "novelx-geography",
            },
            metadata: { sessionId: "ses_child", parentSessionId: currentID },
            time: { start: 1700000002000 },
          },
        },
      ],
    },
  ]
}

function geographyChildMessages() {
  return [
    {
      info: {
        id: "msg_novelx_geography_child_user",
        sessionID: "ses_child",
        role: "user",
        time: { created: 1700000002200 },
        summary: { diffs: [] },
        agent: "novelx-geography",
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
        mode: "novelx-geography",
        agent: "novelx-geography",
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
          text: "# 北境冠脉\n\n## 事实依据\n\n北境冠脉控制大陆北部的高差与主要水系源头。",
        },
      ],
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
