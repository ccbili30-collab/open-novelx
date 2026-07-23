import { describe, expect, test } from "bun:test"
import { projectNovelXLiveGrowth } from "./novelx-growth-live-projection"

describe("projectNovelXLiveGrowth", () => {
  test("projects a prepared empty stage as registering", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
        status: "running",
        stages: [
          {
            stageId: "natural",
            status: "prepared",
            editorSessionId: "ses_editor",
            entities: [],
          },
        ],
        documents: [],
      },
      sessions: [],
      statuses: {},
      messages: {},
      parts: {},
    })

    expect(projection.stage).toEqual({
      id: "natural",
      label: "自然地理",
      state: "registering",
    })
    expect(projection.artifacts).toEqual([])
  })

  test("creates a locked artifact from an authoritative registered document", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
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
            status: "registered",
            taskSessionId: null,
            updatedAt: 10,
          },
        ],
      },
      sessions: [],
      statuses: {},
      messages: {},
      parts: {},
    })

    expect(projection.artifacts).toEqual([
      {
        key: "world:river",
        entityId: "river",
        stageId: "natural",
        title: "灰潮河",
        targetPath: "World/自然地理/灰潮河.md",
        state: "registered",
        locked: true,
        text: "",
      },
    ])
  })

  test("maps a running Writer from task metadata without reading its prompt", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
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
            status: "leased",
            taskSessionId: null,
            updatedAt: 20,
          },
        ],
      },
      sessions: [
        {
          id: "ses_writer",
          parentID: "ses_editor",
          agent: "novelx-world-writer",
          title: "灰潮河 (@novelx-world-writer subagent)",
          time: { created: 10, updated: 30 },
        },
      ],
      statuses: { ses_writer: { type: "busy" } },
      messages: { ses_editor: [{ id: "msg_editor", role: "assistant" }] },
      parts: {
        msg_editor: [
          {
            type: "tool",
            tool: "task",
            state: {
              status: "running",
              input: {
                subagent_type: "novelx-world-writer",
                description: "世界：灰潮河",
                prompt: "这段隐藏 Prompt 故意写成另一个实体：盐镜湾",
              },
              title: "世界：灰潮河",
              metadata: { sessionId: "ses_writer" },
            },
          },
        ],
      },
    })

    expect(projection.artifacts[0]).toMatchObject({
      entityId: "river",
      state: "drafting",
      writerSessionId: "ses_writer",
    })
    expect(projection.primaryArtifactKey).toBe("world:river")
  })

  test("projects accumulated Writer text through the public draft sanitizer", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
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
            status: "leased",
            taskSessionId: "ses_writer",
            updatedAt: 20,
          },
        ],
      },
      sessions: [
        {
          id: "ses_writer",
          parentID: "ses_editor",
          agent: "novelx-world-writer",
          title: "灰潮河",
          time: { created: 10, updated: 30 },
        },
      ],
      statuses: { ses_writer: { type: "busy" } },
      messages: { ses_writer: [{ id: "msg_writer", role: "assistant" }] },
      parts: {
        msg_writer: [
          { type: "text", text: "灰潮河从北境冰原蜿蜒南下。" },
          { type: "text", text: "河谷两岸保留着季节性洪泛地。\n\nActive:\n内部报告不得显示。" },
        ],
      },
    })

    expect(projection.artifacts[0]?.text).toBe("灰潮河从北境冰原蜿蜒南下。\n河谷两岸保留着季节性洪泛地。")
  })

  test("keeps the stable artifact key and unlocks the committed file", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
        status: "completed",
        stages: [
          {
            stageId: "natural",
            status: "completed",
            editorSessionId: "ses_editor",
            entities: [{ id: "river", name: "灰潮河" }],
          },
        ],
        documents: [
          {
            entityId: "river",
            stageId: "natural",
            targetPath: "World/自然地理/灰潮河.md",
            status: "committed",
            taskSessionId: "ses_writer",
            updatedAt: 40,
          },
        ],
      },
      sessions: [],
      statuses: {},
      messages: {},
      parts: {},
    })

    expect(projection.stage).toEqual({ id: "natural", label: "自然地理", state: "completed" })
    expect(projection.artifacts[0]).toMatchObject({
      key: "world:river",
      targetPath: "World/自然地理/灰潮河.md",
      state: "committed",
      locked: false,
    })
  })

  test("keeps safe partial text when a Writer fails", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
        status: "running",
        stages: [
          {
            stageId: "natural",
            status: "reviewing",
            editorSessionId: "ses_editor",
            entities: [{ id: "river", name: "灰潮河" }],
          },
        ],
        documents: [
          {
            entityId: "river",
            stageId: "natural",
            targetPath: "World/自然地理/灰潮河.md",
            status: "failed",
            taskSessionId: "ses_writer",
            updatedAt: 50,
          },
        ],
      },
      sessions: [
        {
          id: "ses_writer",
          parentID: "ses_editor",
          agent: "novelx-world-writer",
          title: "灰潮河",
          time: { created: 10, updated: 50 },
        },
      ],
      statuses: { ses_writer: { type: "idle" } },
      messages: { ses_writer: [{ id: "msg_writer", role: "assistant" }] },
      parts: { msg_writer: [{ type: "text", text: "冰层下仍有缓慢流动的暗河。" }] },
    })

    expect(projection.artifacts[0]).toMatchObject({
      state: "failed",
      locked: true,
      text: "冰层下仍有缓慢流动的暗河。",
    })
  })

  test("never attaches text from an unmapped Writer", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
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
            status: "leased",
            taskSessionId: null,
            updatedAt: 20,
          },
        ],
      },
      sessions: [
        {
          id: "ses_other",
          parentID: "ses_editor",
          agent: "novelx-world-writer",
          title: "盐镜湾",
          time: { created: 10, updated: 60 },
        },
      ],
      statuses: { ses_other: { type: "busy" } },
      messages: { ses_other: [{ id: "msg_other", role: "assistant" }] },
      parts: { msg_other: [{ type: "text", text: "这段文字属于另一个实体。" }] },
    })

    expect(projection.artifacts[0]).toMatchObject({ state: "leased", text: "" })
    expect(projection.artifacts[0]?.writerSessionId).toBeUndefined()
    expect(projection.primaryArtifactKey).toBeUndefined()
  })

  test("excludes prompt-like, reasoning, tool, synthetic, ignored, and internal text", () => {
    const projection = projectNovelXLiveGrowth({
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
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
          id: "ses_writer",
          parentID: "ses_editor",
          agent: "novelx-world-writer",
          title: "灰潮河",
          time: { created: 10, updated: 70 },
        },
      ],
      statuses: { ses_writer: { type: "busy" } },
      messages: { ses_writer: [{ id: "msg_writer", role: "assistant" }] },
      parts: {
        msg_writer: [
          { type: "reasoning", text: "隐藏推理" },
          { type: "tool", text: "隐藏工具参数" },
          { type: "text", text: "隐藏 Prompt", synthetic: true },
          { type: "text", text: "忽略文本", ignored: true },
          { type: "text", text: "公开河谷正文。\nSHA-256 内部哈希不得显示。" },
        ],
      },
    })

    expect(projection.artifacts[0]?.text).toBe("公开河谷正文。")
  })

  test("selects the most recently updated mapped Writer with deterministic ties", () => {
    const input = {
      blueprint: { stages: [{ id: "natural", label: "自然地理" }] },
      materialization: {
        status: "running" as const,
        stages: [
          {
            stageId: "natural",
            status: "registered" as const,
            editorSessionId: "ses_editor",
            entities: [
              { id: "river", name: "灰潮河" },
              { id: "bay", name: "盐镜湾" },
            ],
          },
        ],
        documents: [
          {
            entityId: "river",
            stageId: "natural",
            targetPath: "World/自然地理/灰潮河.md",
            status: "drafting" as const,
            taskSessionId: "ses_river",
            updatedAt: 100,
          },
          {
            entityId: "bay",
            stageId: "natural",
            targetPath: "World/自然地理/盐镜湾.md",
            status: "drafting" as const,
            taskSessionId: "ses_bay",
            updatedAt: 100,
          },
        ],
      },
      sessions: [
        {
          id: "ses_river",
          parentID: "ses_editor",
          agent: "novelx-world-writer",
          title: "灰潮河",
          time: { created: 10, updated: 200 },
        },
        {
          id: "ses_bay",
          parentID: "ses_editor",
          agent: "novelx-world-writer",
          title: "盐镜湾",
          time: { created: 10, updated: 100 },
        },
      ],
      statuses: { ses_river: { type: "busy" as const }, ses_bay: { type: "busy" as const } },
      messages: {},
      parts: {},
    }

    expect(projectNovelXLiveGrowth(input).primaryArtifactKey).toBe("world:river")
    expect(
      projectNovelXLiveGrowth({
        ...input,
        sessions: input.sessions.map((session) => ({ ...session, time: { ...session.time, updated: 200 } })),
      }).primaryArtifactKey,
    ).toBe("world:bay")
  })
})
