import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import {
  GrowthSkeletonError,
  compileNovelXGrowthSkeleton,
  verifyNovelXGrowthSkeleton,
} from "../../src/novelx/growth-skeleton"
import { fantasyTerrain } from "./growth-skeleton.fixture"

const source = {
  sessionId: "session-1",
  messageId: "message-1",
  toolCallId: "call-1",
  registeredAt: 1_721_337_600_000,
}

describe("NovelX Growth terrain compiler", () => {
  test("compiles one deterministic named terrain manifest", () => {
    const first = compileNovelXGrowthSkeleton({ profile: fantasyTerrain, source })
    const second = compileNovelXGrowthSkeleton({ profile: fantasyTerrain, source })

    expect(second).toEqual(first)
    expect(Schema.decodeUnknownSync(NovelXGrowth.Manifest)(first)).toEqual(first)
    expect(verifyNovelXGrowthSkeleton(first)).toBe(first)
    expect(first.schemaVersion).toBe(2)
    expect(first.stage).toBe("terrain_registration")
    expect(first.terrain.nodes.map((node) => node.name)).toContain("北境冠脉")
    expect(first.terrain.nodes.some((node) => /\d+$/u.test(node.name))).toBe(false)
    expect(first.terrain.relations[2]).toMatchObject({ kind: "flows_into", status: "registered" })
  })

  test("rejects numbered placeholders, empty content and invalid topology", () => {
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: {
          ...fantasyTerrain,
          nodes: fantasyTerrain.nodes.map((node, index) => (index === 3 ? { ...node, name: "山脉01" } : node)),
        },
      }),
    ).toThrow("specific place name")
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: {
          ...fantasyTerrain,
          nodes: fantasyTerrain.nodes.map((node, index) =>
            index === 3 ? { ...node, summary: "待填充地貌内容" } : node,
          ),
        },
      }),
    ).toThrow("concrete terrain content")
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: {
          ...fantasyTerrain,
          nodes: fantasyTerrain.nodes.map((node, index) => (index === 3 ? { ...node, parentNodeIndex: 4 } : node)),
        },
      }),
    ).toThrow("earlier parent")
  })

  test("requires a coherent continent, surrounding water, highland, lowland and inland water", () => {
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: {
          ...fantasyTerrain,
          nodes: fantasyTerrain.nodes.filter((node) => node.kind !== "ocean" && node.kind !== "sea"),
        },
      }),
    ).toThrow(GrowthSkeletonError)
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: {
          ...fantasyTerrain,
          nodes: fantasyTerrain.nodes.map((node) => ({ ...node, map: { ...node.map, x: 99 } })),
        },
      }),
    ).toThrow("exceeds the normalized")
  })

  test("detects tampering without rebuilding a local fallback", () => {
    const manifest = compileNovelXGrowthSkeleton({ profile: fantasyTerrain, source })
    const tampered = { ...manifest, profile: { ...manifest.profile, title: "被篡改" } }
    expect(() => verifyNovelXGrowthSkeleton(tampered)).toThrow("integrity check failed")
  })
})
