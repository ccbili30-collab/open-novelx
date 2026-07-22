import { expect, test } from "bun:test"
import { selectNovelXVisibleGraph, type NovelXGraph } from "./novelx-graph-model"

const graph = (id: string): NovelXGraph => ({
  nodes: [{ id, label: id, typeLabel: "测试", summary: id, status: "committed" }],
  edges: [],
})

test("formal NovelX graph remains authoritative when both sources exist", () => {
  const structured = graph("formal")
  const result = selectNovelXVisibleGraph({ structured, project: graph("fallback") })

  expect(result.source).toBe("structured")
  expect(result.graph).toBe(structured)
})

test("project document graph is used only when the formal graph is empty", () => {
  const project = graph("fallback")
  const result = selectNovelXVisibleGraph({ structured: { nodes: [], edges: [] }, project })

  expect(result.source).toBe("project")
  expect(result.graph).toBe(project)
})

test("reports an empty graph when neither source has nodes", () => {
  const result = selectNovelXVisibleGraph({ structured: { nodes: [], edges: [] } })

  expect(result.source).toBe("empty")
  expect(result.graph).toEqual({ nodes: [], edges: [] })
})
