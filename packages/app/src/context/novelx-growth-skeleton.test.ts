import { describe, expect, it } from "bun:test"
import { NovelXGrowth } from "@opencode-ai/schema"
import { novelXGrowthNavigationItems, parseNovelXGrowthSkeleton } from "./novelx-growth-skeleton"

async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function manifestFixture(): Promise<NovelXGrowth.Manifest> {
  const profile = {
    title: "中土新纪元",
    genre: { family: "fantasy", label: "中世纪大世界幻想", scale: "大陆" },
    worldLayers: [
      { label: "地理", parentLayerIndex: null, slotCount: 1 },
      { label: "国家", parentLayerIndex: 0, slotCount: 1 },
    ],
    characterGroups: [{ label: "核心角色", slotCount: 1 }],
    graphViews: ["因果链"],
    chapterCount: 1,
  }
  const draft = {
    schemaVersion: 1 as const,
    status: "planned" as const,
    registeredAt: 1,
    source: {
      sessionId: "ses_growth",
      messageId: "msg_growth",
      toolCallId: "call_growth",
      profileSha256: await sha256(profile),
    },
    profile,
    surfaces: {
      files: {
        items: [
          {
            id: "file-1",
            label: "地理 01",
            path: "World/01-地理/001-地理-01.md",
            kind: "document" as const,
            sourceId: "slot-1",
            status: "planned" as const,
          },
        ],
      },
      world: {
        layers: [
          {
            id: "layer-1",
            label: "地理",
            ordinal: 1,
            parentId: null,
            status: "planned" as const,
            slots: [{ id: "slot-1", label: "地理 01", ordinal: 1, status: "planned" as const }],
          },
          {
            id: "layer-2",
            label: "国家",
            ordinal: 2,
            parentId: "layer-1",
            status: "planned" as const,
            slots: [{ id: "slot-2", label: "国家 01", ordinal: 1, status: "planned" as const }],
          },
        ],
      },
      characters: {
        groups: [
          {
            id: "group-1",
            label: "核心角色",
            ordinal: 1,
            status: "planned" as const,
            slots: [{ id: "character-1", label: "核心角色 01", ordinal: 1, status: "planned" as const }],
          },
        ],
      },
      graph: { views: [{ id: "graph-1", label: "因果链", ordinal: 1, status: "planned" as const }] },
      story: {
        id: "story-1",
        label: "中土新纪元·故事",
        status: "planned" as const,
        chapters: [
          { id: "chapter-1", label: "第001章", ordinal: 1, status: "planned" as const, contentState: "empty" as const },
        ],
      },
      package: {
        id: "package-1",
        label: "中土新纪元·世界包",
        status: "planned" as const,
        sections: [{ id: "section-1", label: "封面", ordinal: 1, status: "planned" as const }],
      },
    },
  }
  return { ...draft, integritySha256: await sha256(draft) }
}

describe("NovelX Growth skeleton projection", () => {
  it("validates integrity before accepting the manifest", async () => {
    const manifest = await manifestFixture()
    expect((await parseNovelXGrowthSkeleton(JSON.stringify(manifest))).profile.title).toBe("中土新纪元")
    await expect(parseNovelXGrowthSkeleton(JSON.stringify({ ...manifest, registeredAt: 2 }))).rejects.toThrow(
      "完整性校验失败",
    )
  })

  it("projects world dependencies and planned file paths without inventing content", async () => {
    const manifest = await manifestFixture()
    const world = novelXGrowthNavigationItems(manifest, "world")
    const files = novelXGrowthNavigationItems(manifest, "files")

    expect(world.map((item) => [item.label, item.depth])).toEqual([
      ["地理", 0],
      ["地理 01", 1],
      ["国家", 1],
      ["国家 01", 2],
    ])
    expect(files[1]?.path).toBe("World/01-地理/001-地理-01.md")
  })
})
