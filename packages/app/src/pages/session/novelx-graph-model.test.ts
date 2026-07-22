import { describe, expect, test } from "bun:test"
import type { NovelXWorld } from "@opencode-ai/schema"
import {
  evolveNovelXSphereLayout,
  novelXGraphExcerpt,
  parseNovelXSphereLayout,
  projectNovelXGraph,
  selectNovelXGraphLabels,
  type NovelXGraph,
  type NovelXGraphProjectionInput,
} from "./novelx-graph-model"

const sha = "a".repeat(64)

const entity = (id: string, upstreamBindings: NovelXWorld.RegisteredEntity["upstreamBindings"] = []) => ({
  id,
  stageId: "stage",
  name: id === "north" ? "北境山脉" : "河谷王国",
  typeLabel: id === "north" ? "自然地理" : "国家",
  ordinal: id === "north" ? 1 : 2,
  summary: id === "north" ? "终年积雪的北方山脉与冰川源头。" : "依托河谷水运形成的王国。",
  facts: [{ label: "事实", detail: "这是一条足够具体的登记事实。" }],
  constraints: ["不得违背已登记的上游事实。"],
  upstreamBindings,
  status: "registered" as const,
})

test("projects registered world relations and only exposes committed source files", () => {
  const world: NonNullable<NovelXGraphProjectionInput["world"]> = {
    stages: [
      {
        entities: [
          entity("north"),
          entity("kingdom", [
            {
              entityId: "north",
              relation: "受其雪水滋养",
              impact: "雪水决定河谷农业周期。",
              constraints: [],
              sourceSha256: sha,
            },
          ]),
        ],
        relations: [
          {
            id: "relation",
            stageId: "stage",
            fromEntityId: "north",
            toEntityId: "kingdom",
            label: "相邻",
            summary: "山脉位于王国北部边界。",
            status: "registered" as const,
          },
        ],
      },
    ],
    documents: [
      { entityId: "north", targetPath: "World/north.md", status: "committed" as const },
      { entityId: "kingdom", targetPath: "World/kingdom.md", status: "drafting" as const },
    ],
  }
  const graph = projectNovelXGraph({ world })

  expect(graph.nodes.map((node) => [node.id, node.sourcePath])).toEqual([
    ["north", "World/north.md"],
    ["kingdom", undefined],
  ])
  expect(graph.edges.map((edge) => edge.label)).toEqual(["相邻", "受其雪水滋养"])
})

test("falls back to terrain registration and attaches committed geography", () => {
  const skeleton: NonNullable<NovelXGraphProjectionInput["skeleton"]> = {
    terrain: {
      nodes: [{ id: "plain", name: "长风平原", kind: "plain", summary: "大陆中央延展的冲积平原。" }],
      relations: [],
    },
  }
  const geography: NonNullable<NovelXGraphProjectionInput["geography"]> = {
    records: [{ terrainId: "plain", targetPath: "World/plain.md", status: "committed" }],
  }

  expect(projectNovelXGraph({ skeleton, geography }).nodes[0]?.sourcePath).toBe("World/plain.md")
})

test("densifies the graph with story documents linked to source entities and works", () => {
  const story: NonNullable<NovelXGraphProjectionInput["story"]> = {
    historyBooks: [{ id: "history", title: "黑潮纪年", summary: "记录黑潮前后诸国迁徙的历史书。" }],
    novel: {
      id: "novel",
      title: "渡鸦之路",
      summary: "一名信使穿越边境的长篇故事。",
      theme: { id: "theme", title: "失落与归返", summary: "故乡如何在迁徙中被重新理解。" },
    },
    documents: [
      {
        id: "chapter",
        title: "越过雪线",
        kindLabel: "小说章节",
        brief: "信使从北境山脉进入河谷。",
        sourceEntityIds: ["north"],
        upstreamDocumentIds: [],
        workId: "novel",
        targetPath: "Stories/chapter.md",
        status: "committed",
      },
    ],
  }
  const world: NonNullable<NovelXGraphProjectionInput["world"]> = {
    stages: [{ entities: [entity("north")], relations: [] }],
    documents: [],
  }
  const graph = projectNovelXGraph({ world, story })

  expect(graph.nodes.map((node) => node.id)).toEqual(["north", "history", "novel", "theme", "chapter"])
  expect(graph.edges.map((edge) => [edge.source, edge.target])).toContainEqual(["north", "chapter"])
  expect(graph.edges.map((edge) => [edge.source, edge.target])).toContainEqual(["novel", "chapter"])
})

describe("stable spherical layout", () => {
  const initial: NovelXGraph = {
    nodes: [
      { id: "a", label: "A", typeLabel: "地理", summary: "A 节点的摘要信息。", status: "registered" },
      { id: "b", label: "B", typeLabel: "国家", summary: "B 节点的摘要信息。", status: "registered" },
    ],
    edges: [],
  }

  test("preserves existing positions while placing related additions nearby", () => {
    const first = evolveNovelXSphereLayout(initial)
    const expanded = evolveNovelXSphereLayout(
      {
        nodes: [
          ...initial.nodes,
          { id: "c", label: "C", typeLabel: "人物", summary: "C 节点的摘要信息。", status: "registered" },
        ],
        edges: [{ id: "a-c", source: "a", target: "c", label: "相关", summary: "C 与 A 相关。" }],
      },
      first,
    )
    expect(expanded.positions.a).toEqual(first.positions.a)
    expect(expanded.positions.b).toEqual(first.positions.b)
    const a = expanded.positions.a
    const c = expanded.positions.c
    expect(a.x * c.x + a.y * c.y + a.z * c.z).toBeGreaterThan(0.9)
  })

  test("spreads a connected first layout across the sphere instead of collapsing into one cap", () => {
    const nodes = Array.from({ length: 30 }, (_, index) => ({
      id: `node-${String(index).padStart(2, "0")}`,
      label: `节点 ${index}`,
      typeLabel: "世界实体",
      summary: `节点 ${index} 的摘要。`,
      status: "committed" as const,
    }))
    const edges = nodes
      .slice(1)
      .flatMap((node, index) => [
        { id: `chain-${index}`, source: nodes[index]!.id, target: node.id, label: "相邻", summary: "链式关系。" },
        ...(index > 1
          ? [{ id: `hub-${index}`, source: nodes[0]!.id, target: node.id, label: "相关", summary: "中心关系。" }]
          : []),
      ])
    const result = evolveNovelXSphereLayout({ nodes, edges })
    const points = Object.values(result.positions)
    const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), {
      x: 0,
      y: 0,
      z: 0,
    })
    const centroidMagnitude = Math.hypot(centroid.x, centroid.y, centroid.z) / points.length
    const nearest = points.map((point, index) =>
      Math.min(
        ...points
          .filter((_, other) => other !== index)
          .map((other) => Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z)),
      ),
    )

    expect(centroidMagnitude).toBeLessThan(0.15)
    expect(Math.min(...nearest)).toBeGreaterThan(0.25)
  })

  test("rejects corrupt cached layout", () => {
    expect(parseNovelXSphereLayout('{"version":1,"positions":{"a":{"x":"bad"}}}')).toBeUndefined()
    expect(parseNovelXSphereLayout('{"version":1,"positions":{"a":{"x":0,"y":0,"z":1}}}')).toBeUndefined()
    expect(parseNovelXSphereLayout('{"version":2,"positions":{"a":{"x":0,"y":0,"z":1}}}')).toEqual({
      version: 2,
      positions: { a: { x: 0, y: 0, z: 1 } },
    })
    expect(parseNovelXSphereLayout("not json")).toBeUndefined()
  })

  test("keeps important labels while hiding colliding and rear labels", () => {
    const labels = selectNovelXGraphLabels(
      [
        { id: "front", x: 100, y: 100, z: 0.8, width: 80, height: 28, priority: 10 },
        { id: "collision", x: 110, y: 102, z: 0.9, width: 80, height: 28 },
        { id: "rear", x: 260, y: 100, z: -0.5, width: 80, height: 28, priority: 100 },
        { id: "selected", x: 400, y: 105, z: -0.7, width: 80, height: 28, pinned: true },
      ],
      8,
    )

    expect(labels).toContain("selected")
    expect(labels).toContain("front")
    expect(labels).not.toContain("collision")
    expect(labels).not.toContain("rear")
  })
})

test("turns markdown source into a short readable excerpt", () => {
  expect(novelXGraphExcerpt("# 北境\n\n**寒风**穿过山口。", "fallback", 12)).toBe("北境 寒风穿过山口。")
  expect(novelXGraphExcerpt("", "登记摘要", 3)).toBe("登记…")
})
