import { createHash } from "node:crypto"
import { NovelXGrowth } from "@opencode-ai/schema"

const ROOT_KINDS = new Set<NovelXGrowth.TerrainKind>(["continent", "ocean", "sea"])
const LOWLAND_KINDS = new Set<NovelXGrowth.TerrainKind>(["plain", "basin", "valley", "plateau"])
const WATER_KINDS = new Set<NovelXGrowth.TerrainKind>(["ocean", "sea"])

export class GrowthSkeletonError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function compileNovelXGrowthSkeleton(input: {
  profile: NovelXGrowth.Profile
  source: {
    sessionId: string
    messageId: string
    toolCallId: string | null
    registeredAt: number
  }
}): NovelXGrowth.Manifest {
  const profile = normalizeProfile(input.profile)
  const profileSha256 = sha256(profile)
  const nodes = profile.nodes.map((node, index) => ({
    id: stableId("terrain", index, node.kind, node.name),
    name: node.name,
    kind: node.kind,
    parentId:
      node.parentNodeIndex === null
        ? null
        : stableId(
            "terrain",
            node.parentNodeIndex,
            profile.nodes[node.parentNodeIndex]!.kind,
            profile.nodes[node.parentNodeIndex]!.name,
          ),
    ordinal: index + 1,
    prominence: node.prominence,
    summary: node.summary,
    formation: node.formation,
    map: node.map,
    status: "registered" as const,
  }))
  const relations = profile.relations.map((relation, index) => ({
    id: stableId("terrain-relation", index, relation.fromNodeIndex, relation.toNodeIndex, relation.kind),
    fromId: nodes[relation.fromNodeIndex]!.id,
    toId: nodes[relation.toNodeIndex]!.id,
    kind: relation.kind,
    summary: relation.summary,
    status: "registered" as const,
  }))
  const draft = {
    schemaVersion: 2 as const,
    stage: "terrain_registration" as const,
    status: "registered" as const,
    registeredAt: input.source.registeredAt,
    source: {
      sessionId: input.source.sessionId,
      messageId: input.source.messageId,
      toolCallId: input.source.toolCallId,
      profileSha256,
    },
    profile,
    terrain: { nodes, relations },
  }
  return { ...draft, integritySha256: sha256(draft) }
}

export function verifyNovelXGrowthSkeleton(manifest: NovelXGrowth.Manifest) {
  const { integritySha256, ...draft } = manifest
  if (sha256(draft) !== integritySha256) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_INTEGRITY_INVALID", "Growth terrain integrity check failed.")
  }
  if (sha256(manifest.profile) !== manifest.source.profileSha256) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_PROFILE_HASH_INVALID", "Growth terrain profile hash check failed.")
  }
  return manifest
}

function normalizeProfile(profile: NovelXGrowth.Profile): NovelXGrowth.Profile {
  const normalized = {
    title: text(profile.title, "title"),
    genre: {
      family: profile.genre.family,
      label: text(profile.genre.label, "genre.label"),
      scale: profile.genre.scale,
    },
    designSummary: detail(profile.designSummary, "designSummary"),
    nodes: profile.nodes.map((node, index) => ({
      name: placeName(node.name, `nodes[${index}].name`),
      kind: node.kind,
      parentNodeIndex: node.parentNodeIndex,
      prominence: node.prominence,
      summary: detail(node.summary, `nodes[${index}].summary`),
      formation: detail(node.formation, `nodes[${index}].formation`),
      map: node.map,
    })),
    relations: profile.relations.map((relation, index) => ({
      fromNodeIndex: relation.fromNodeIndex,
      toNodeIndex: relation.toNodeIndex,
      kind: relation.kind,
      summary: detail(relation.summary, `relations[${index}].summary`),
    })),
  }
  unique(
    normalized.nodes.map((node) => node.name),
    "terrain name",
  )
  normalized.nodes.forEach((node, index) => {
    if (node.map.x + node.map.width > 100 || node.map.y + node.map.height > 100) {
      throw new GrowthSkeletonError(
        "NOVELX_GROWTH_TERRAIN_MAP_INVALID",
        `Terrain node ${index + 1} exceeds the normalized 100 by 100 map.`,
      )
    }
    if (node.parentNodeIndex === null) {
      if (!ROOT_KINDS.has(node.kind)) {
        throw new GrowthSkeletonError(
          "NOVELX_GROWTH_TERRAIN_ROOT_INVALID",
          `Terrain node ${index + 1} must belong to an earlier parent.`,
        )
      }
      return
    }
    if (!Number.isInteger(node.parentNodeIndex) || node.parentNodeIndex < 0 || node.parentNodeIndex >= index) {
      throw new GrowthSkeletonError(
        "NOVELX_GROWTH_TERRAIN_TOPOLOGY_INVALID",
        `Terrain node ${index + 1} must reference an earlier parent node.`,
      )
    }
  })
  const continents = normalized.nodes.filter((node) => node.kind === "continent" && node.parentNodeIndex === null)
  if (continents.length !== 1 || continents[0]?.prominence !== "core") {
    throw new GrowthSkeletonError(
      "NOVELX_GROWTH_PRIMARY_CONTINENT_REQUIRED",
      "Terrain registration requires exactly one core root continent.",
    )
  }
  if (!normalized.nodes.some((node) => WATER_KINDS.has(node.kind) && node.parentNodeIndex === null)) {
    throw new GrowthSkeletonError(
      "NOVELX_GROWTH_SURROUNDING_WATER_REQUIRED",
      "Terrain registration requires at least one surrounding root ocean or sea.",
    )
  }
  if (!normalized.nodes.some((node) => node.kind === "mountain_range")) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_MOUNTAIN_REQUIRED", "Terrain registration requires a mountain range.")
  }
  if (!normalized.nodes.some((node) => LOWLAND_KINDS.has(node.kind))) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_LOWLAND_REQUIRED", "Terrain registration requires a lowland region.")
  }
  if (!normalized.nodes.some((node) => node.kind === "river" || node.kind === "lake")) {
    throw new GrowthSkeletonError(
      "NOVELX_GROWTH_INLAND_WATER_REQUIRED",
      "Terrain registration requires a river or lake.",
    )
  }
  const relationKeys = normalized.relations.map((relation, index) => {
    if (
      relation.fromNodeIndex >= normalized.nodes.length ||
      relation.toNodeIndex >= normalized.nodes.length ||
      relation.fromNodeIndex === relation.toNodeIndex
    ) {
      throw new GrowthSkeletonError(
        "NOVELX_GROWTH_TERRAIN_RELATION_INVALID",
        `Terrain relation ${index + 1} has an invalid endpoint.`,
      )
    }
    return `${relation.fromNodeIndex}:${relation.toNodeIndex}:${relation.kind}`
  })
  unique(relationKeys, "terrain relation")
  return normalized
}

function text(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (!normalized || normalized.length > 120) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_LABEL_INVALID", `${field} must contain 1 to 120 characters.`)
  }
  return normalized
}

function detail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 8 || normalized.length > 800 || /(?:待填充|待补充|尚未生成|TODO|TBD)/iu.test(normalized)) {
    throw new GrowthSkeletonError(
      "NOVELX_GROWTH_TERRAIN_DETAIL_INVALID",
      `${field} must contain concrete terrain content rather than an empty-content marker.`,
    )
  }
  return normalized
}

function placeName(value: string, field: string) {
  const normalized = text(value, field)
  if (
    /\d+$/u.test(normalized) ||
    /^(?:地形|地点|区域|大陆|海洋|海域|山脉|平原|河流|湖泊|岛屿|群岛)$/u.test(normalized) ||
    /(?:待命名|未命名|占位|待填充)/u.test(normalized)
  ) {
    throw new GrowthSkeletonError(
      "NOVELX_GROWTH_TERRAIN_NAME_PLACEHOLDER",
      `${field} must be a specific place name, not a numbered or generic placeholder.`,
    )
  }
  return normalized
}

function unique(values: string[], kind: string) {
  const keys = values.map((value) => value.toLocaleLowerCase("zh-CN"))
  if (new Set(keys).size !== keys.length) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_LABEL_DUPLICATE", `Duplicate ${kind} values are not allowed.`)
  }
}

function stableId(...parts: Array<string | number>) {
  return `nx-${sha256(parts).slice(0, 24)}`
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")
}
