import { describe, expect, test } from "bun:test"
import { selectProjectSessions, worldTreeStatus } from "./novelx-workspace-model"

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
  test("distinguishes an honest load failure from an empty World directory", () => {
    expect(worldTreeStatus({ error: "offline" }, 0)).toBe("error")
    expect(worldTreeStatus({ loaded: true }, 0)).toBe("empty")
  })

  test("keeps the real tree visible while loading or when content exists", () => {
    expect(worldTreeStatus(undefined, 0)).toBe("tree")
    expect(worldTreeStatus({ loaded: true }, 2)).toBe("tree")
  })
})
