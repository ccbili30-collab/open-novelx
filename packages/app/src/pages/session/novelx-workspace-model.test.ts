import { describe, expect, test } from "bun:test"
import { projectMonogram, selectProjectSessions, worldTreeStatus } from "./novelx-workspace-model"

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
