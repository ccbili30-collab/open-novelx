import { describe, expect, test } from "bun:test"
import {
  DEFAULT_NOVELX_PROJECT_LAYOUT,
  activateNovelXResource,
  mergeNovelXOrder,
  normalizeNovelXProjectLayout,
  reorderNovelXItems,
  pinNovelXShortcut,
  removeNovelXProjectShortcuts,
  removeNovelXSessionShortcuts,
  toggleNovelXRight,
  toggleNovelXShortcut,
} from "./novelx-workspace"

describe("NovelX workspace layout", () => {
  test("opens one resource, switches in place, and returns home on repeated activation", () => {
    const files = activateNovelXResource(DEFAULT_NOVELX_PROJECT_LAYOUT, "files")
    expect(files.activeResource).toBe("files")
    expect(files.rightCollapsed).toBe(false)
    expect(files.leftExpanded).toBe(false)

    const world = activateNovelXResource(files, "world")
    expect(world.activeResource).toBe("world")

    const home = activateNovelXResource(world, "world")
    expect(home.activeResource).toBeUndefined()
    expect(home.conversationCollapsed).toBe(false)
    expect(home.leftExpanded).toBe(true)
  })

  test("right collapse preserves the active resource for restoration", () => {
    const active = activateNovelXResource(DEFAULT_NOVELX_PROJECT_LAYOUT, "story")
    const collapsed = toggleNovelXRight(active)
    expect(collapsed.rightCollapsed).toBe(true)
    expect(collapsed.activeResource).toBe("story")
    expect(toggleNovelXRight(collapsed)).toEqual(active)
  })

  test("normalizes incomplete persisted snapshots without inventing a resource", () => {
    expect(normalizeNovelXProjectLayout({ leftExpanded: false, activeResource: "unknown" as "files" })).toEqual({
      ...DEFAULT_NOVELX_PROJECT_LAYOUT,
      leftExpanded: false,
      homeLeftExpanded: false,
    })
  })

  test("persists the active NovelX document without coupling it to resource expansion", () => {
    const normalized = normalizeNovelXProjectLayout({ activeFile: "World/北境.md" })
    expect(normalized.activeFile).toBe("World/北境.md")
    expect(activateNovelXResource(normalized, "graph").activeFile).toBe("World/北境.md")
    expect(normalizeNovelXProjectLayout({ activeFile: 12 as unknown as string }).activeFile).toBe("")
  })
})

describe("NovelX project navigation", () => {
  test("pinning adds and removes shortcuts without changing their source objects", () => {
    const project = { type: "project" as const, directory: "C:/NovelX/World" }
    const session = { type: "session" as const, directory: project.directory, sessionID: "ses_one" }
    const pinned = toggleNovelXShortcut(toggleNovelXShortcut([], project), session)
    expect(pinned).toEqual([project, session])
    expect(toggleNovelXShortcut(pinned, project)).toEqual([session])
  })

  test("reorders only known IDs and merges persisted order with newly discovered sessions", () => {
    expect(reorderNovelXItems(["one", "two", "three"], "three", 1)).toEqual(["one", "three", "two"])
    expect(reorderNovelXItems(["one", "two"], "missing", 0)).toEqual(["one", "two"])
    expect(mergeNovelXOrder(["one", "two", "three"], ["two", "gone"])).toEqual(["two", "one", "three"])
  })

  test("pinning by drop is idempotent and removing a shortcut never toggles it back on", () => {
    const project = { type: "project" as const, directory: "C:/NovelX/World" }
    const session = { type: "session" as const, directory: project.directory, sessionID: "ses_one" }

    expect(pinNovelXShortcut([project], project)).toEqual([project])
    expect(pinNovelXShortcut([project], session)).toEqual([project, session])
    expect(removeNovelXSessionShortcuts([project, session], project.directory, [session.sessionID])).toEqual([project])
    expect(removeNovelXSessionShortcuts([project], project.directory, [session.sessionID])).toEqual([project])
  })

  test("removing a project clears both project and session shortcuts from that directory", () => {
    const other = { type: "project" as const, directory: "C:/NovelX/Other" }
    const shortcuts = [
      { type: "project" as const, directory: "C:/NovelX/World" },
      { type: "session" as const, directory: "C:/NovelX/World", sessionID: "ses_one" },
      other,
    ]

    expect(removeNovelXProjectShortcuts(shortcuts, "c:\\novelx\\world")).toEqual([other])
  })
})
