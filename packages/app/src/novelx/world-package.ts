import type { NovelXWorldVisual } from "@opencode-ai/schema"
import type { NovelXGraph } from "@/pages/session/novelx-graph-model"

export const WORLD_PACKAGE_SCHEMA_VERSION = 1 as const

export const WORLD_PACKAGE_SECTIONS = [
  "cover",
  "overview",
  "map",
  "publications",
  "story",
  "characters",
  "graph",
] as const

export type NovelXWorldPackageSection = (typeof WORLD_PACKAGE_SECTIONS)[number]
export type NovelXWorldPackageAssetStatus = "attached" | "queued" | "missing"

export type NovelXWorldPackageRegion = {
  id: string
  label: string
  kind: string
  surface: NovelXWorldVisual.Surface
  summary: string
  polygon: readonly { x: number; y: number }[]
  labelPoint: { x: number; y: number }
  sourcePath?: string
}

export type NovelXWorldPackage = {
  schemaVersion: typeof WORLD_PACKAGE_SCHEMA_VERSION
  title: string
  summary: string
  sections: readonly NovelXWorldPackageSection[]
  cover: { status: NovelXWorldPackageAssetStatus; source?: string }
  overview: { title: string; text: string }
  map: {
    status: "ready" | "pending" | "missing"
    raster?: string
    regions: readonly NovelXWorldPackageRegion[]
  }
  publications: readonly {
    id: string
    title: string
    kind: "atlas" | "travelogue"
    summary: string
    sourcePath?: string
  }[]
  story: {
    status: "ready" | "pending" | "missing"
    title?: string
    summary?: string
    chapters: readonly { id: string; title: string; summary: string; sourcePath?: string }[]
  }
  characters: readonly {
    id: string
    name: string
    summary: string
    sourcePath?: string
    portrait?: string
  }[]
  graph: NovelXGraph
}

export type NovelXWorldPackageInput = {
  title?: string
  summary?: string
  cover?: { status?: NovelXWorldPackageAssetStatus; source?: string }
  overview?: { title?: string; text?: string }
  map?: {
    status?: "ready" | "pending" | "missing"
    raster?: string
    atlas?: Pick<NovelXWorldVisual.Manifest["atlas"], "cells" | "features">
    sourcePaths?: Readonly<Record<string, string>>
  }
  publications?: readonly {
    id: string
    title: string
    kind: "atlas" | "travelogue"
    summary?: string
    sourcePath?: string
  }[]
  story?: {
    status?: "ready" | "pending" | "missing"
    title?: string
    summary?: string
    chapters?: readonly { id: string; title: string; summary?: string; sourcePath?: string }[]
  }
  characters?: readonly {
    id: string
    name: string
    summary?: string
    sourcePath?: string
    portrait?: string
  }[]
  graph?: NovelXGraph
}

const text = (value: string | undefined, fallback: string, max = 2000) => {
  const normalized = value?.replaceAll(/\s+/gu, " ").trim()
  if (!normalized) return fallback
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`
}

const safePath = (value: string | undefined) => {
  if (!value || value.startsWith(".") || value.includes("\\") || value.includes("..")) return undefined
  return value
}

export function createNovelXWorldPackage(input: NovelXWorldPackageInput): NovelXWorldPackage {
  const sourcePaths = input.map?.sourcePaths ?? {}
  const features = input.map?.atlas?.features ?? []
  const regions = features
    .filter((feature) => feature.geometry === "area")
    .map((feature) => ({
      id: feature.entityId,
      label: text(feature.label, "未命名区域", 120),
      kind: feature.kind,
      surface: feature.surface,
      summary: text(feature.summary, "该区域的正式档案尚未提交。"),
      polygon: feature.rings[0] ?? [],
      labelPoint: feature.labelPoint,
      sourcePath: safePath(sourcePaths[feature.entityId]),
    }))
    .filter((feature) => feature.polygon.length >= 3)

  const graph = input.graph ?? { nodes: [], edges: [] }
  return {
    schemaVersion: WORLD_PACKAGE_SCHEMA_VERSION,
    title: text(input.title, "未命名世界", 120),
    summary: text(input.summary, "一个正在生长中的世界。"),
    sections: WORLD_PACKAGE_SECTIONS,
    cover: {
      status: input.cover?.status ?? (input.cover?.source ? "attached" : "missing"),
      source: input.cover?.source,
    },
    overview: {
      title: text(input.overview?.title, "世界总览", 120),
      text: text(input.overview?.text, text(input.summary, "世界事实、地理与故事的公开总览。")),
    },
    map: {
      status: input.map?.status ?? (regions.length ? "ready" : "missing"),
      raster: input.map?.raster,
      regions,
    },
    publications: (input.publications ?? []).map((publication) => ({
      id: publication.id,
      title: text(publication.title, "未命名文稿", 120),
      kind: publication.kind,
      summary: text(publication.summary, "文稿尚未提交。"),
      sourcePath: safePath(publication.sourcePath),
    })),
    story: {
      status: input.story?.status ?? (input.story?.title ? "ready" : "missing"),
      title: input.story?.title ? text(input.story.title, "未命名故事", 120) : undefined,
      summary: input.story?.summary ? text(input.story.summary, "故事尚未提交。") : undefined,
      chapters: (input.story?.chapters ?? []).map((chapter) => ({
        id: chapter.id,
        title: text(chapter.title, "未命名章节", 120),
        summary: text(chapter.summary, "章节尚未提交。"),
        sourcePath: safePath(chapter.sourcePath),
      })),
    },
    characters: (input.characters ?? []).map((character) => ({
      id: character.id,
      name: text(character.name, "未命名角色", 120),
      summary: text(character.summary, "角色档案尚未提交。"),
      sourcePath: safePath(character.sourcePath),
      portrait: character.portrait,
    })),
    graph: {
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        label: text(node.label, "未命名节点", 120),
        typeLabel: text(node.typeLabel, "节点", 60),
        summary: text(node.summary, "暂无公开摘要。"),
        sourcePath: safePath(node.sourcePath),
        status: node.status,
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: text(edge.label, "关联", 60),
        summary: text(edge.summary, "暂无关系摘要。"),
      })),
    },
  }
}

export function excerptNovelXWorldPackage(value: string, max = 180) {
  return text(value, "", max)
}

export type NovelXWorldPackageStar = {
  x: number
  y: number
  size: number
  opacity: number
  duration: number
  delay: number
  driftX: number
  driftY: number
  tone: "paper" | "blue" | "gold"
  depth: "far" | "middle" | "near"
}

export function createNovelXWorldPackageStars(seed: string, count = 220): readonly NovelXWorldPackageStar[] {
  let state = 2166136261
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }
  const random = () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: count }, (_, index) => {
    const depth = index % 11 === 0 ? "near" : index % 3 === 0 ? "middle" : "far"
    const scale = depth === "near" ? 2 : depth === "middle" ? 1.25 : 0.84
    const angle = random() * Math.PI * 2
    const distance = 20 + random() * 78
    return {
      x: random() * 100,
      y: random() * 100,
      size: (0.65 + random() * 1.35) * scale,
      opacity: 0.3 + random() * (depth === "near" ? 0.68 : 0.54),
      duration: (depth === "near" ? 22 : depth === "middle" ? 34 : 52) + random() * 38,
      delay: -random() * 58,
      driftX: Math.cos(angle) * distance,
      driftY: Math.sin(angle) * distance,
      tone: random() > 0.9 ? "gold" : random() > 0.72 ? "blue" : "paper",
      depth,
    }
  })
}
