import { describe, expect, it } from "bun:test"
import { NovelXGrowth } from "@opencode-ai/schema"
import { novelXGrowthNavigationItems, parseNovelXGrowthSkeleton } from "./novelx-growth-skeleton"

async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function manifestFixture(): Promise<NovelXGrowth.Manifest> {
  const profileNodes: NovelXGrowth.TerrainNodeProfile[] = [
    profileNode("埃兰大陆", "continent", null, 8, 10, 72, 76),
    profileNode("西陲苍海", "ocean", null, 0, 0, 100, 100),
    profileNode("北境冠脉", "mountain_range", 0, 25, 16, 42, 12),
    profileNode("中央沃原", "plain", 0, 31, 42, 36, 24),
    profileNode("白河流域", "river", 0, 46, 29, 8, 42),
    profileNode("灰烬高原", "plateau", 0, 59, 52, 24, 18),
    profileNode("晨星群岛", "archipelago", 1, 80, 34, 14, 20),
    profileNode("南境暖海", "sea", 1, 18, 78, 66, 18),
  ]
  const profile: NovelXGrowth.Profile = {
    title: "埃兰世界",
    genre: { family: "fantasy", label: "经典中土大世界魔幻", scale: "主大陆及周边海域" },
    designSummary: "北部高山、中央平原与南部暖海组成主大陆的基本地貌骨架。",
    nodes: profileNodes,
    relations: [
      {
        fromNodeIndex: 4,
        toNodeIndex: 7,
        kind: "flows_into",
        summary: "白河由中央沃原向南延伸，最终汇入南境暖海。",
      },
    ],
  }
  const nodes = profileNodes.map((item, index) =>
    node(
      `terrain-${index}`,
      item.name,
      item.kind,
      item.parentNodeIndex === null ? null : `terrain-${item.parentNodeIndex}`,
      index + 1,
      item.map,
    ),
  )
  const relations: NovelXGrowth.RegisteredTerrainRelation[] = [
    {
      id: "relation-0",
      fromId: "terrain-4",
      toId: "terrain-7",
      kind: "flows_into",
      summary: "白河由中央沃原向南延伸，最终汇入南境暖海。",
      status: "registered",
    },
  ]
  const draft = {
    schemaVersion: 2 as const,
    stage: "terrain_registration" as const,
    status: "registered" as const,
    registeredAt: 1,
    source: {
      sessionId: "ses_growth",
      messageId: "msg_growth",
      toolCallId: "call_growth",
      profileSha256: await sha256(profile),
    },
    profile,
    terrain: { nodes, relations },
  }
  return { ...draft, integritySha256: await sha256(draft) }
}

describe("NovelX Growth terrain projection", () => {
  it("validates integrity before accepting the manifest", async () => {
    const manifest = await manifestFixture()
    expect((await parseNovelXGrowthSkeleton(JSON.stringify(manifest))).profile.title).toBe("埃兰世界")
    await expect(parseNovelXGrowthSkeleton(JSON.stringify({ ...manifest, registeredAt: 2 }))).rejects.toThrow(
      "完整性校验失败",
    )
  })

  it("projects named terrain hierarchy without empty numbered slots", async () => {
    const manifest = await manifestFixture()
    const world = novelXGrowthNavigationItems(manifest, "world")

    expect(world.map((item) => [item.label, item.depth])).toEqual([
      ["埃兰大陆", 0],
      ["北境冠脉", 1],
      ["中央沃原", 1],
      ["白河流域", 1],
      ["灰烬高原", 1],
      ["西陲苍海", 0],
      ["晨星群岛", 1],
      ["南境暖海", 1],
    ])
    expect(world.some((item) => /\d+$/u.test(item.label))).toBe(false)
    expect(novelXGrowthNavigationItems(manifest, "characters")).toEqual([])
  })
})

function node(
  id: string,
  name: string,
  kind: NovelXGrowth.TerrainKind,
  parentId: string | null,
  ordinal: number,
  map: NovelXGrowth.TerrainNodeProfile["map"],
): NovelXGrowth.RegisteredTerrainNode {
  return {
    id,
    name,
    kind,
    parentId,
    ordinal,
    prominence: ordinal === 1 ? "core" : "major",
    summary: `${name}拥有清晰而具体的地貌结构与空间边界。`,
    formation: `${name}由长期地质活动和侵蚀过程共同塑造。`,
    map,
    status: "registered",
  }
}

function profileNode(
  name: string,
  kind: NovelXGrowth.TerrainKind,
  parentNodeIndex: number | null,
  x: number,
  y: number,
  width: number,
  height: number,
): NovelXGrowth.TerrainNodeProfile {
  return {
    name,
    kind,
    parentNodeIndex,
    prominence: parentNodeIndex === null && kind === "continent" ? "core" : "major",
    summary: `${name}拥有清晰而具体的地貌结构与空间边界。`,
    formation: `${name}由长期地质活动和侵蚀过程共同塑造。`,
    map: { x, y, width, height },
  }
}
