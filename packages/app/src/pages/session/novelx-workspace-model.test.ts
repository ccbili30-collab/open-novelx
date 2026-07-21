import { describe, expect, test } from "bun:test"
import {
  isNovelXGrowthSession,
  isNovelXInternalSession,
  novelXRootSessionID,
  projectMonogram,
  projectNovelXDraftText,
  projectNovelXTimelineParts,
  sanitizeNovelXAssistantText,
  selectProjectSessions,
  worldTreeStatus,
} from "./novelx-workspace-model"

describe("projectMonogram", () => {
  test("uses the first visible project-name character without assigning a project color", () => {
    expect(projectMonogram("  novelx world  ")).toBe("N")
    expect(projectMonogram("群山与河谷")).toBe("群")
  })

  test("keeps the rail readable when a project name is empty", () => {
    expect(projectMonogram("   ")).toBe("?")
  })
})

describe("selectProjectSessions", () => {
  test("keeps recent root project sessions and excludes archived or child sessions", () => {
    const sessions = [
      { id: "old", time: { created: 1, updated: 1 } },
      { id: "new", time: { created: 2, updated: 5 } },
      { id: "child", parentID: "new", time: { created: 6, updated: 6 } },
      { id: "archived", time: { created: 7, updated: 7, archived: 8 } },
    ]

    expect(selectProjectSessions(sessions).map((session) => session.id)).toEqual(["new", "old"])
  })

  test("honors the visible session limit without mutating the source", () => {
    const sessions = [
      { id: "one", time: { created: 1, updated: 1 } },
      { id: "two", time: { created: 2, updated: 2 } },
    ]

    expect(selectProjectSessions(sessions, 1).map((session) => session.id)).toEqual(["two"])
    expect(sessions.map((session) => session.id)).toEqual(["one", "two"])
  })
})

describe("worldTreeStatus", () => {
  test("distinguishes load failures from missing or empty World directories", () => {
    expect(
      worldTreeStatus({ root: { error: "offline" }, world: undefined, hasWorldDirectory: false, childCount: 0 }),
    ).toBe("error")
    expect(worldTreeStatus({ root: { loaded: true }, world: undefined, hasWorldDirectory: false, childCount: 0 })).toBe(
      "empty",
    )
    expect(
      worldTreeStatus({
        root: { loaded: true },
        world: { loaded: true },
        hasWorldDirectory: true,
        childCount: 0,
      }),
    ).toBe("empty")
  })

  test("waits for the root before mounting a real World tree", () => {
    expect(worldTreeStatus({ root: undefined, world: undefined, hasWorldDirectory: false, childCount: 0 })).toBe(
      "loading",
    )
    expect(worldTreeStatus({ root: { loaded: true }, world: undefined, hasWorldDirectory: true, childCount: 0 })).toBe(
      "tree",
    )
    expect(
      worldTreeStatus({
        root: { loaded: true },
        world: { loaded: true },
        hasWorldDirectory: true,
        childCount: 2,
      }),
    ).toBe("tree")
  })
})

describe("NovelX child-session projection", () => {
  test("recognizes only NovelX worker sessions as internal navigation targets", () => {
    expect(isNovelXInternalSession({ parentID: "root", agent: "novelx-stage-editor" })).toBe(true)
    expect(isNovelXInternalSession({ parentID: "root", agent: "explore" })).toBe(false)
    expect(isNovelXInternalSession({ agent: "novelx-stage-editor" })).toBe(false)
  })

  test("recognizes Growth from either persisted session metadata or its user turn", () => {
    expect(isNovelXGrowthSession({ agent: "growth" }, [])).toBe(true)
    expect(isNovelXGrowthSession(undefined, [{ role: "user", agent: "growth" }])).toBe(true)
    expect(isNovelXGrowthSession({ agent: "build" }, [{ role: "user", agent: "build" }])).toBe(false)
  })

  test("keeps only public conversation parts in a Growth timeline", () => {
    const visibleCommand = { type: "text", text: "/growth 中土世界", ignored: true }
    const contextPack = { type: "text", text: "private Context Pack", synthetic: true }
    const legacyPrompt = {
      type: "text",
      text: "为当前 NovelX 项目启动 Growth（生长），完成世界工作面。\n用户补充要求：中土世界\n蓝图注册完成不是终点。",
    }
    const image = { type: "file", mime: "image/png" }
    expect(projectNovelXTimelineParts("user", [visibleCommand, contextPack, legacyPrompt, image])).toEqual([
      visibleCommand,
      image,
    ])

    const answer = { type: "text", text: "世界已经开始生长" }
    expect(
      projectNovelXTimelineParts("assistant", [
        { type: "reasoning", text: "private chain of thought" },
        { type: "tool" },
        { type: "text", text: "hidden reminder", synthetic: true },
        { type: "text", text: 'to=functions.novelx_recover_growth_context {"subagent_type":"novelx-stage-editor"}' },
        answer,
      ]),
    ).toEqual([answer])
  })

  test("removes leaked internal tool lines and stops before transport or internal reports", () => {
    expect(
      sanitizeNovelXAssistantText(
        "世界阶段已经完成。\n已调用 `novelx_finish_world` 完成收尾。\nto=functions.novelx_recover_growth_context {}\n可以继续讨论故事。\n\nActive\n- internal stage report",
      ),
    ).toBe("世界阶段已经完成。")
  })

  test("fails closed at a multiline tool-transport boundary", () => {
    expect(
      sanitizeNovelXAssistantText(
        "世界已经开始生长。\nto=functions.novelx_finish_world\n{leaseId:internal-lease,stageId:stage-1}\n不应继续公开",
      ),
    ).toBe("世界已经开始生长。")
    expect(sanitizeNovelXAssistantText('  {"subagent_type": "novelx-stage-editor",\n"prompt": "private"}')).toBe("")
  })

  test("projects only the latest assistant turn and excludes prompts, reasoning, tools, and hidden text", () => {
    const messages = [
      { id: "user", role: "user" },
      { id: "old", role: "assistant" },
      { id: "latest", role: "assistant" },
    ]
    const parts = {
      user: [{ type: "text", text: "private Context Pack" }],
      old: [{ type: "text", text: "obsolete draft" }],
      latest: [
        { type: "reasoning", text: "private chain of thought" },
        { type: "tool", output: "private tool output" },
        { type: "text", text: "hidden reminder", synthetic: true },
        { type: "text", text: "visible first paragraph" },
        { type: "text", text: "visible second paragraph" },
        { type: "text", text: "Relevant Files\n- private path" },
      ],
    }

    expect(projectNovelXDraftText(messages, parts)).toBe("visible first paragraph\nvisible second paragraph")
  })

  test("keeps a newly-started empty assistant turn blank instead of showing an obsolete draft", () => {
    expect(
      projectNovelXDraftText(
        [
          { id: "old", role: "assistant" },
          { id: "latest", role: "assistant" },
        ],
        { old: [{ type: "text", text: "obsolete draft" }], latest: [] },
      ),
    ).toBe("")
  })

  test("resolves a deeply nested internal session back to the root conversation", () => {
    const sessions = [{ id: "root" }, { id: "stage", parentID: "root" }, { id: "writer", parentID: "stage" }]
    expect(novelXRootSessionID(sessions, "writer")).toBe("root")
    expect(novelXRootSessionID(sessions, "root")).toBe("root")
    expect(novelXRootSessionID(sessions, "missing")).toBeUndefined()
  })
})
