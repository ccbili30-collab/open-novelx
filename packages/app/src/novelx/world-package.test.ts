import { describe, expect, test } from "bun:test"
import { createNovelXWorldPackage, createNovelXWorldPackageStars } from "./world-package"
import { createNovelXWorldPackageHtml, createNovelXWorldPackageZip } from "./world-package-export"

const source = {
  title: "群山与河谷",
  summary: "一片由冰海、山脉与河谷共同塑造的大陆。",
  map: {
    atlas: {
      cells: [],
      features: [
        {
          entityId: "north",
          layer: "geography" as const,
          kind: "region" as const,
          geometry: "area" as const,
          parentEntityId: null,
          surface: "mountain" as const,
          cellIds: ["cell-1"],
          rings: [[{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.25, y: 0.4 }]],
          path: [],
          label: "北境山脉",
          labelPoint: { x: 0.25, y: 0.2 },
          summary: "冰雪覆盖的北境山脉。",
          sourceSha256: "a".repeat(64),
          importance: "required" as const,
        },
      ],
    },
    sourcePaths: { north: "World/North.md" },
  },
  publications: [{ id: "pub", title: "北境图志", kind: "atlas" as const, summary: "北境的地理志。" }],
  graph: {
    nodes: [{ id: "north", label: "北境山脉", typeLabel: "自然地理", summary: "山脉", status: "committed" as const }],
    edges: [],
  },
}

describe("NovelX world package", () => {
  test("projects only public fields and preserves the fixed exhibition order", () => {
    const pkg = createNovelXWorldPackage(source)
    expect(pkg.sections).toEqual(["cover", "overview", "map", "publications", "story", "characters", "graph"])
    expect(pkg.map.regions[0]?.sourcePath).toBe("World/North.md")
    expect(JSON.stringify(pkg)).not.toContain("prompt")
    expect(JSON.stringify(pkg)).not.toContain("agent")
  })

  test("creates a self-contained html document and a zip blob", async () => {
    const pkg = createNovelXWorldPackage(source)
    const html = createNovelXWorldPackageHtml(pkg)
    expect(html).toContain("群山与河谷")
    expect(html).toContain("const PKG=")
    expect(html).toContain('class="stage"')
    expect(html).toContain("const STARS=")
    expect(html).not.toContain('class="shell"')
    const bytes = new Uint8Array(await createNovelXWorldPackageZip(pkg).arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("PK\u0003\u0004")
  })

  test("creates a stable irregular drifting starfield for each world", () => {
    const first = createNovelXWorldPackageStars("群山与河谷")
    const second = createNovelXWorldPackageStars("群山与河谷")
    expect(first).toEqual(second)
    expect(first).toHaveLength(220)
    expect(new Set(first.map((star) => `${star.x}:${star.y}:${star.duration}`)).size).toBe(first.length)
    expect(new Set(first.map((star) => star.depth))).toEqual(new Set(["far", "middle", "near"]))
  })
})
