import { describe, expect, test } from "bun:test"
import { isNovelXHiddenProjectPath } from "./novelx-project-files"

describe("NovelX visible project files", () => {
  test("keeps real author files and hides runtime, dependency and credential data", () => {
    expect(isNovelXHiddenProjectPath("World/北境.md")).toBe(false)
    expect(isNovelXHiddenProjectPath("Stories/小说/雪线以北/01.md")).toBe(false)
    expect(isNovelXHiddenProjectPath("notes/cache-design.md")).toBe(false)
    expect(isNovelXHiddenProjectPath(".novelx/growth/story-materialization.json")).toBe(true)
    expect(isNovelXHiddenProjectPath("node_modules/pkg/index.js")).toBe(true)
    expect(isNovelXHiddenProjectPath(".git/config")).toBe(true)
    expect(isNovelXHiddenProjectPath(".env.local")).toBe(true)
    expect(isNovelXHiddenProjectPath("opencode.db-wal")).toBe(true)
  })
})
