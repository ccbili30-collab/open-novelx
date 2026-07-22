import { describe, expect, test } from "bun:test"
import { isNovelXGrowthAgent } from "../../src/novelx/growth-agent"

describe("isNovelXGrowthAgent", () => {
  test("recognizes Growth orchestration and worker identities", () => {
    expect(isNovelXGrowthAgent("growth")).toBe(true)
    expect(isNovelXGrowthAgent("novelx-stage-editor")).toBe(true)
    expect(isNovelXGrowthAgent("novelx-world-writer")).toBe(true)
    expect(isNovelXGrowthAgent("novelx-character-writer")).toBe(true)
    expect(isNovelXGrowthAgent("novelx-story-writer")).toBe(true)
  })

  test("does not grant Growth retry semantics to ordinary agents", () => {
    expect(isNovelXGrowthAgent("build")).toBe(false)
    expect(isNovelXGrowthAgent("compaction")).toBe(false)
    expect(isNovelXGrowthAgent(undefined)).toBe(false)
  })
})
