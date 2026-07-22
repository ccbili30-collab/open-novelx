import type { NovelXGrowth, NovelXWorld } from "@opencode-ai/schema"
import type * as NovelXStory from "@opencode-ai/schema/novelx-story"

export type NovelXGraphNode = {
  id: string
  label: string
  typeLabel: string
  summary: string
  sourcePath?: string
  status: "registered" | "committed"
}

export type NovelXGraphEdge = {
  id: string
  source: string
  target: string
  label: string
  summary: string
}

export type NovelXGraph = {
  nodes: NovelXGraphNode[]
  edges: NovelXGraphEdge[]
}

export type NovelXVisibleGraph = {
  graph: NovelXGraph
  source: "structured" | "project" | "empty"
}

export function selectNovelXVisibleGraph(input: {
  structured: NovelXGraph
  project?: NovelXGraph
}): NovelXVisibleGraph {
  if (input.structured.nodes.length) return { graph: input.structured, source: "structured" }
  if (input.project?.nodes.length) return { graph: input.project, source: "project" }
  return { graph: { nodes: [], edges: [] }, source: "empty" }
}

export type NovelXSphereVector = { x: number; y: number; z: number }

export type NovelXSphereLayout = {
  version: 1
  positions: Record<string, NovelXSphereVector>
}

export type NovelXGraphProjectionInput = {
  skeleton?: {
    terrain: {
      nodes: readonly Pick<NovelXGrowth.RegisteredTerrainNode, "id" | "name" | "kind" | "summary">[]
      relations: readonly Pick<NovelXGrowth.RegisteredTerrainRelation, "id" | "fromId" | "toId" | "kind" | "summary">[]
    }
  }
  geography?: {
    records: readonly Pick<NovelXGrowth.GeographyDocumentRecord, "terrainId" | "targetPath" | "status">[]
  }
  world?: {
    stages: readonly {
      entities: readonly NovelXWorld.RegisteredEntity[]
      relations: readonly NovelXWorld.RegisteredEntityRelation[]
    }[]
    documents: readonly Pick<NovelXWorld.WorldDocumentRecord, "entityId" | "targetPath" | "status">[]
  }
  story?: {
    historyBooks: readonly Pick<NovelXStory.HistoryBook, "id" | "title" | "summary">[]
    novel: Pick<NovelXStory.NovelWork, "id" | "title" | "summary" | "theme"> | null
    documents: readonly Pick<
      NovelXStory.DocumentRecord,
      | "id"
      | "title"
      | "kindLabel"
      | "brief"
      | "sourceEntityIds"
      | "upstreamDocumentIds"
      | "workId"
      | "targetPath"
      | "status"
    >[]
  }
}

const normalize = (value: NovelXSphereVector): NovelXSphereVector => {
  const length = Math.hypot(value.x, value.y, value.z)
  if (!length) return { x: 0, y: 0, z: 1 }
  return { x: value.x / length, y: value.y / length, z: value.z / length }
}

const hash = (value: string) => {
  let result = 2166136261
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

const fibonacciPoint = (index: number, total: number, phase: number): NovelXSphereVector => {
  const y = 1 - ((index + 0.5) / total) * 2
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  const angle = index * Math.PI * (3 - Math.sqrt(5)) + phase
  return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius }
}

const tangentNear = (anchor: NovelXSphereVector, id: string): NovelXSphereVector => {
  const seed = hash(id)
  const reference = Math.abs(anchor.y) < 0.85 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  const tangent = normalize({
    x: reference.y * anchor.z - reference.z * anchor.y,
    y: reference.z * anchor.x - reference.x * anchor.z,
    z: reference.x * anchor.y - reference.y * anchor.x,
  })
  const bitangent = {
    x: anchor.y * tangent.z - anchor.z * tangent.y,
    y: anchor.z * tangent.x - anchor.x * tangent.z,
    z: anchor.x * tangent.y - anchor.y * tangent.x,
  }
  const angle = ((seed % 360) / 180) * Math.PI
  const spread = 0.24 + ((seed >>> 9) % 9) / 100
  return normalize({
    x: anchor.x + spread * (Math.cos(angle) * tangent.x + Math.sin(angle) * bitangent.x),
    y: anchor.y + spread * (Math.cos(angle) * tangent.y + Math.sin(angle) * bitangent.y),
    z: anchor.z + spread * (Math.cos(angle) * tangent.z + Math.sin(angle) * bitangent.z),
  })
}

const isolatedPosition = (id: string, occupied: NovelXSphereVector[]): NovelXSphereVector => {
  const total = 160
  const phase = ((hash(id) % 360) / 180) * Math.PI
  if (!occupied.length) return fibonacciPoint(hash(id) % total, total, phase)
  let selected = fibonacciPoint(0, total, phase)
  let best = -Infinity
  for (let index = 0; index < total; index++) {
    const candidate = fibonacciPoint(index, total, phase)
    const separation = Math.min(
      ...occupied.map((point) => 1 - (candidate.x * point.x + candidate.y * point.y + candidate.z * point.z)),
    )
    if (separation <= best) continue
    best = separation
    selected = candidate
  }
  return selected
}

const addEdge = (edges: Map<string, NovelXGraphEdge>, edge: NovelXGraphEdge) => {
  if (edge.source === edge.target) return
  if (!edges.has(edge.id)) edges.set(edge.id, edge)
}

export function projectNovelXGraph(input: NovelXGraphProjectionInput): NovelXGraph {
  const nodes = new Map<string, NovelXGraphNode>()
  const edges = new Map<string, NovelXGraphEdge>()
  const worldDocuments = new Map(input.world?.documents.map((record) => [record.entityId, record]) ?? [])
  const geographyDocuments = new Map(input.geography?.records.map((record) => [record.terrainId, record]) ?? [])
  const worldEntities = input.world?.stages.flatMap((stage) => stage.entities) ?? []

  if (worldEntities.length) {
    for (const entity of worldEntities) {
      const document = worldDocuments.get(entity.id)
      nodes.set(entity.id, {
        id: entity.id,
        label: entity.name,
        typeLabel: entity.typeLabel,
        summary: entity.summary,
        sourcePath: document?.status === "committed" ? document.targetPath : undefined,
        status: document?.status === "committed" ? "committed" : "registered",
      })
    }
    for (const stage of input.world?.stages ?? []) {
      for (const relation of stage.relations) {
        addEdge(edges, {
          id: relation.id,
          source: relation.fromEntityId,
          target: relation.toEntityId,
          label: relation.label,
          summary: relation.summary,
        })
      }
      for (const entity of stage.entities) {
        for (const binding of entity.upstreamBindings) {
          addEdge(edges, {
            id: `binding:${binding.entityId}:${entity.id}:${binding.relation}`,
            source: binding.entityId,
            target: entity.id,
            label: binding.relation,
            summary: binding.impact,
          })
        }
      }
    }
  } else {
    for (const terrain of input.skeleton?.terrain.nodes ?? []) {
      const document = geographyDocuments.get(terrain.id)
      nodes.set(terrain.id, {
        id: terrain.id,
        label: terrain.name,
        typeLabel: terrain.kind,
        summary: terrain.summary,
        sourcePath: document?.status === "committed" ? document.targetPath : undefined,
        status: document?.status === "committed" ? "committed" : "registered",
      })
    }
    for (const relation of input.skeleton?.terrain.relations ?? []) {
      addEdge(edges, {
        id: relation.id,
        source: relation.fromId,
        target: relation.toId,
        label: relation.kind,
        summary: relation.summary,
      })
    }
  }

  const story = input.story
  if (story) {
    for (const book of story.historyBooks) {
      nodes.set(book.id, {
        id: book.id,
        label: book.title,
        typeLabel: "历史书",
        summary: book.summary,
        status: "registered",
      })
    }
    if (story.novel) {
      nodes.set(story.novel.id, {
        id: story.novel.id,
        label: story.novel.title,
        typeLabel: "小说",
        summary: story.novel.summary,
        status: "registered",
      })
      nodes.set(story.novel.theme.id, {
        id: story.novel.theme.id,
        label: story.novel.theme.title,
        typeLabel: "故事主题",
        summary: story.novel.theme.summary,
        status: "registered",
      })
      addEdge(edges, {
        id: `story-theme:${story.novel.id}:${story.novel.theme.id}`,
        source: story.novel.id,
        target: story.novel.theme.id,
        label: "主题",
        summary: story.novel.theme.summary,
      })
    }
    for (const document of story.documents) {
      nodes.set(document.id, {
        id: document.id,
        label: document.title,
        typeLabel: document.kindLabel,
        summary: document.brief,
        sourcePath: document.status === "committed" ? document.targetPath : undefined,
        status: document.status === "committed" ? "committed" : "registered",
      })
      for (const source of document.sourceEntityIds) {
        addEdge(edges, {
          id: `story-source:${source}:${document.id}`,
          source,
          target: document.id,
          label: "取材于",
          summary: document.brief,
        })
      }
      for (const upstream of document.upstreamDocumentIds) {
        addEdge(edges, {
          id: `story-upstream:${upstream}:${document.id}`,
          source: upstream,
          target: document.id,
          label: "承接",
          summary: document.brief,
        })
      }
      if (document.workId) {
        addEdge(edges, {
          id: `story-work:${document.workId}:${document.id}`,
          source: document.workId,
          target: document.id,
          label: "收录",
          summary: document.brief,
        })
      }
    }
  }

  const known = new Set(nodes.keys())
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter((edge) => known.has(edge.source) && known.has(edge.target)),
  }
}

export function evolveNovelXSphereLayout(graph: NovelXGraph, previous?: NovelXSphereLayout): NovelXSphereLayout {
  const active = new Set(graph.nodes.map((node) => node.id))
  const positions: Record<string, NovelXSphereVector> = {}
  for (const [id, position] of Object.entries(previous?.positions ?? {})) {
    if (active.has(id) && [position.x, position.y, position.z].every(Number.isFinite)) positions[id] = position
  }
  const neighbors = new Map<string, string[]>()
  for (const edge of graph.edges) {
    neighbors.set(edge.source, [...(neighbors.get(edge.source) ?? []), edge.target])
    neighbors.set(edge.target, [...(neighbors.get(edge.target) ?? []), edge.source])
  }
  for (const node of [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (positions[node.id]) continue
    const anchors = (neighbors.get(node.id) ?? []).flatMap((id) => {
      const position = positions[id]
      return position ? [position] : []
    })
    if (anchors.length) {
      const sum = anchors.reduce(
        (result, point) => ({ x: result.x + point.x, y: result.y + point.y, z: result.z + point.z }),
        { x: 0, y: 0, z: 0 },
      )
      const anchor = Math.hypot(sum.x, sum.y, sum.z) > 0.1 ? normalize(sum) : anchors[0]
      if (!anchor) continue
      positions[node.id] = tangentNear(anchor, node.id)
      continue
    }
    positions[node.id] = isolatedPosition(node.id, Object.values(positions))
  }
  return { version: 1, positions }
}

export function parseNovelXSphereLayout(value: string | null): NovelXSphereLayout | undefined {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1) return undefined
    if (!("positions" in parsed) || !parsed.positions || typeof parsed.positions !== "object") return undefined
    const positions: Record<string, NovelXSphereVector> = {}
    for (const [id, point] of Object.entries(parsed.positions)) {
      if (!point || typeof point !== "object") return undefined
      if (!("x" in point) || !("y" in point) || !("z" in point)) return undefined
      if (typeof point.x !== "number" || typeof point.y !== "number" || typeof point.z !== "number") return undefined
      if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined
      positions[id] = { x: point.x, y: point.y, z: point.z }
    }
    return { version: 1, positions }
  } catch {
    return undefined
  }
}

export function novelXGraphExcerpt(content: string, fallback: string, limit = 220) {
  const source = content
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/[*_>`~|]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
  const text = source || fallback.trim()
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}
