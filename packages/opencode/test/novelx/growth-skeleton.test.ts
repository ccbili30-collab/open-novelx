import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import {
  GrowthSkeletonError,
  compileNovelXGrowthSkeleton,
  verifyNovelXGrowthSkeleton,
} from "../../src/novelx/growth-skeleton"

const source = {
  sessionId: "session-1",
  messageId: "message-1",
  toolCallId: "call-1",
  registeredAt: 1_721_337_600_000,
}

const fantasy = {
  title: "阿尔达斯",
  genre: { family: "fantasy", label: "中世纪大世界幻想", scale: "大陆" },
  worldLayers: [
    { label: "天文", parentLayerIndex: null, slotCount: 1 },
    { label: "地理", parentLayerIndex: null, slotCount: 4 },
    { label: "国家", parentLayerIndex: 1, slotCount: 6 },
    { label: "文明", parentLayerIndex: 2, slotCount: 6 },
  ],
  characterGroups: [
    { label: "核心角色", slotCount: 4 },
    { label: "阵营代表", slotCount: 6 },
  ],
  graphViews: ["地理依赖", "国家关系", "事件因果"],
  chapterCount: 12,
} satisfies NovelXGrowth.Profile

describe("NovelX Growth skeleton compiler", () => {
  test("compiles one deterministic six-surface planned manifest", () => {
    const first = compileNovelXGrowthSkeleton({ profile: fantasy, source })
    const second = compileNovelXGrowthSkeleton({ profile: fantasy, source })

    expect(second).toEqual(first)
    expect(Schema.decodeUnknownSync(NovelXGrowth.Manifest)(first)).toEqual(first)
    expect(verifyNovelXGrowthSkeleton(first)).toBe(first)
    expect(first.surfaces.world.layers.map((layer) => layer.label)).toEqual(["天文", "地理", "国家", "文明"])
    expect(first.surfaces.world.layers[2]?.parentId).toBe(first.surfaces.world.layers[1]?.id)
    expect(first.surfaces.story.chapters).toHaveLength(12)
    expect(first.surfaces.story.chapters[0]).toMatchObject({ label: "第001章", contentState: "empty" })
    expect(first.surfaces.story.chapters[11]).toMatchObject({ label: "第012章", contentState: "empty" })
    expect(first.surfaces.files.items.some((item) => item.path === "Story/第001章.md")).toBe(true)
    expect(first.surfaces.package.sections.map((section) => section.label)).toEqual([
      "封面",
      "简介",
      "世界总览",
      "角色总览",
      "因果图谱",
      "故事目录",
    ])
  })

  test("keeps genre-specific world roads while chapters remain standard", () => {
    const scienceFiction = compileNovelXGrowthSkeleton({
      source,
      profile: {
        ...fantasy,
        title: "群星航路",
        genre: { family: "science_fiction", label: "星际文明科幻", scale: "银河系" },
        worldLayers: [
          { label: "宇宙结构", parentLayerIndex: null, slotCount: 1 },
          { label: "星域", parentLayerIndex: 0, slotCount: 5 },
          { label: "星系", parentLayerIndex: 1, slotCount: 10 },
          { label: "星际政体", parentLayerIndex: 1, slotCount: 6 },
          { label: "技术体系", parentLayerIndex: null, slotCount: 4 },
        ],
      },
    })

    expect(scienceFiction.surfaces.world.layers.map((layer) => layer.label)).toEqual([
      "宇宙结构",
      "星域",
      "星系",
      "星际政体",
      "技术体系",
    ])
    expect(scienceFiction.surfaces.story.chapters[0]?.label).toBe("第001章")
    expect(scienceFiction.source.profileSha256).not.toBe(
      compileNovelXGrowthSkeleton({ profile: fantasy, source }).source.profileSha256,
    )
  })

  test("rejects forward parents, duplicates and oversized skeletons", () => {
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: {
          ...fantasy,
          worldLayers: [{ label: "国家", parentLayerIndex: 0, slotCount: 1 }],
        },
      }),
    ).toThrow(GrowthSkeletonError)
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: { ...fantasy, graphViews: ["因果", " 因果 "] },
      }),
    ).toThrow("Duplicate graph view")
    expect(() =>
      compileNovelXGrowthSkeleton({
        source,
        profile: {
          ...fantasy,
          worldLayers: Array.from({ length: 6 }, (_, index) => ({
            label: `层级${index}`,
            parentLayerIndex: null,
            slotCount: 40,
          })),
        },
      }),
    ).toThrow("World slots exceed 200")
  })

  test("detects tampering without rebuilding a local fallback", () => {
    const manifest = compileNovelXGrowthSkeleton({ profile: fantasy, source })
    const tampered = {
      ...manifest,
      profile: { ...manifest.profile, title: "被篡改" },
    }
    expect(() => verifyNovelXGrowthSkeleton(tampered)).toThrow("integrity check failed")
  })
})
