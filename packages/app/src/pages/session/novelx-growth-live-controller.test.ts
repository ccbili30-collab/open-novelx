import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { NovelXLiveGrowthInput } from "./novelx-growth-live-projection"
import { createNovelXGrowthLiveController } from "./novelx-growth-live-controller"

const source = (text = ""): NovelXLiveGrowthInput => ({
  blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
  materialization: {
    growthSessionId: "ses_root",
    status: "running",
    stages: [
      {
        stageId: "natural",
        status: "registered",
        editorSessionId: "ses_editor",
        entities: [{ id: "river", name: "灰潮河" }],
      },
    ],
    documents: [
      {
        entityId: "river",
        stageId: "natural",
        targetPath: "World/自然地理/灰潮河.md",
        status: "drafting",
        taskSessionId: "ses_writer",
        updatedAt: 20,
      },
    ],
  },
  sessions: [
    {
      id: "ses_root",
      agent: "growth",
      title: "Growth",
      time: { created: 1, updated: 1 },
    },
    {
      id: "ses_editor",
      parentID: "ses_root",
      agent: "novelx-stage-editor",
      title: "自然地理",
      time: { created: 2, updated: 2 },
    },
    {
      id: "ses_writer",
      parentID: "ses_editor",
      agent: "novelx-world-writer",
      title: "灰潮河",
      time: { created: 3, updated: 30 },
    },
  ],
  statuses: { ses_writer: { type: "busy" } },
  messages: { ses_writer: [{ id: "msg_writer", role: "assistant" }] },
  parts: { msg_writer: [{ type: "text", text }] },
})

const twoWriters = (riverUpdated: number): NovelXLiveGrowthInput => {
  const current = source("灰潮河正文")
  return {
    ...current,
    materialization: {
      ...current.materialization!,
      stages: current.materialization!.stages.map((stage) => ({
        ...stage,
        entities: [...stage.entities, { id: "bay", name: "盐镜湾" }],
      })),
      documents: [
        ...current.materialization!.documents,
        {
          entityId: "bay",
          stageId: "natural",
          targetPath: "World/自然地理/盐镜湾.md",
          status: "drafting",
          taskSessionId: "ses_bay",
          updatedAt: 20,
        },
      ],
    },
    sessions: [
      ...current.sessions.map((session) =>
        session.id === "ses_writer" ? { ...session, time: { ...session.time, updated: riverUpdated } } : session,
      ),
      {
        id: "ses_bay",
        parentID: "ses_editor",
        agent: "novelx-world-writer",
        title: "盐镜湾",
        time: { created: 4, updated: 100 },
      },
    ],
    statuses: { ...current.statuses, ses_bay: { type: "busy" } },
    messages: { ...current.messages, ses_bay: [{ id: "msg_bay", role: "assistant" }] },
    parts: { ...current.parts, msg_bay: [{ type: "text", text: "盐镜湾正文" }] },
  }
}

test("synchronizes a newly discovered Writer once while deltas keep updating", async () => {
  const synchronized: string[] = []
  const mounted = createRoot((dispose) => {
    const [current, setCurrent] = createSignal(source("第一段"))
    const controller = createNovelXGrowthLiveController({
      currentSessionId: () => "ses_root",
      source: current,
      syncSession: async (sessionId) => {
        synchronized.push(sessionId)
      },
    })
    return { controller, setCurrent, dispose }
  })

  await Promise.resolve()
  expect(synchronized).toEqual(["ses_writer"])
  expect(mounted.controller.projection().artifacts[0]?.text).toBe("第一段")

  mounted.setCurrent(source("第一段第二段"))
  await Promise.resolve()
  expect(synchronized).toEqual(["ses_writer"])
  expect(mounted.controller.projection().artifacts[0]?.text).toBe("第一段第二段")
  mounted.dispose()
})

test("manual selection pauses following until the user resumes it", () => {
  const mounted = createRoot((dispose) => {
    const [current, setCurrent] = createSignal(twoWriters(200))
    const controller = createNovelXGrowthLiveController({
      currentSessionId: () => "ses_root",
      source: current,
      syncSession: () => undefined,
    })
    return { controller, setCurrent, dispose }
  })

  mounted.controller.projection()
  expect(mounted.controller.selectedArtifactKey()).toBe("world:river")
  mounted.controller.selectArtifact("world:bay")
  mounted.setCurrent(twoWriters(300))
  mounted.controller.projection()
  expect(mounted.controller.followMode()).toBe("manual")
  expect(mounted.controller.selectedArtifactKey()).toBe("world:bay")

  mounted.controller.resumeFollow()
  expect(mounted.controller.followMode()).toBe("auto")
  expect(mounted.controller.selectedArtifactKey()).toBe("world:river")
  mounted.dispose()
})

test("a manual World selection can pause following without selecting another artifact", () => {
  const mounted = createRoot((dispose) => {
    const [current, setCurrent] = createSignal(twoWriters(200))
    const controller = createNovelXGrowthLiveController({
      currentSessionId: () => "ses_root",
      source: current,
      syncSession: () => undefined,
    })
    return { controller, setCurrent, dispose }
  })

  mounted.controller.projection()
  expect(mounted.controller.selectedArtifactKey()).toBe("world:river")
  mounted.controller.pauseFollow()
  mounted.setCurrent(twoWriters(300))
  mounted.controller.projection()

  expect(mounted.controller.followMode()).toBe("manual")
  expect(mounted.controller.selectedArtifactKey()).toBeUndefined()
  mounted.dispose()
})

test("reveals a newly committed nested file once in parent order", async () => {
  const actions: string[] = []
  const mounted = createRoot((dispose) => {
    const [current, setCurrent] = createSignal(source("正文"))
    const controller = createNovelXGrowthLiveController({
      currentSessionId: () => "ses_root",
      source: current,
      syncSession: () => undefined,
      fileSurfaceVisible: () => true,
      refreshDirectory: async (path) => {
        actions.push(`refresh:${path || "."}`)
      },
      expandDirectory: (path) => {
        actions.push(`expand:${path || "."}`)
      },
    })
    return { controller, setCurrent, dispose }
  })

  mounted.controller.projection()
  mounted.setCurrent({
    ...source("正文"),
    materialization: {
      ...source("正文").materialization!,
      documents: source("正文").materialization!.documents.map((document) => ({
        ...document,
        status: "committed" as const,
        updatedAt: 40,
      })),
    },
  })
  mounted.controller.projection()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(actions).toEqual([
    "refresh:.",
    "expand:.",
    "refresh:World",
    "expand:World",
    "refresh:World/自然地理",
    "expand:World/自然地理",
  ])

  mounted.controller.projection()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(actions).toHaveLength(6)
  mounted.dispose()
})

test("refreshes committed parents without expanding when the compact file surface is hidden", async () => {
  const refreshes: string[] = []
  const expanded: string[] = []
  const mounted = createRoot((dispose) => {
    const [current, setCurrent] = createSignal(source("正文"))
    const controller = createNovelXGrowthLiveController({
      currentSessionId: () => "ses_root",
      source: current,
      syncSession: () => undefined,
      fileSurfaceVisible: () => false,
      refreshDirectory: async (path) => {
        refreshes.push(path)
      },
      expandDirectory: (path) => expanded.push(path),
    })
    return { controller, setCurrent, dispose }
  })

  mounted.controller.projection()
  mounted.setCurrent({
    ...source("正文"),
    materialization: {
      ...source("正文").materialization!,
      documents: source("正文").materialization!.documents.map((document) => ({
        ...document,
        status: "committed" as const,
      })),
    },
  })
  mounted.controller.projection()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(refreshes).toEqual(["", "World", "World/自然地理"])
  expect(expanded).toEqual([])
  mounted.dispose()
})

test("ignores ordinary sessions outside the authoritative Growth root", () => {
  const synchronized: string[] = []
  const current = source("不应读取")
  const controller = createRoot(() =>
    createNovelXGrowthLiveController({
      currentSessionId: () => "ses_chat",
      source: () => ({
        ...current,
        sessions: [
          ...current.sessions,
          {
            id: "ses_chat",
            agent: "build",
            title: "普通会话",
            time: { created: 100, updated: 100 },
          },
        ],
      }),
      syncSession: (sessionId) => {
        synchronized.push(sessionId)
      },
    }),
  )

  expect(controller.projection()).toEqual({ artifacts: [] })
  expect(synchronized).toEqual([])
})
