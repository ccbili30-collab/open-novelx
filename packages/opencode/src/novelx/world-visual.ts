import { createHash } from "node:crypto"
import { NovelXWorld, NovelXWorldVisual } from "@opencode-ai/schema"
import { verifyWorldBlueprint, worldSha256 } from "./world-blueprint"
import { verifyWorldMaterialization } from "./world-materialization"

export class WorldVisualError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

type Point = { x: number; y: number }

export async function compileWorldVisuals(input: {
  blueprint: NovelXWorld.BlueprintManifest
  materialization: NovelXWorld.WorldMaterialization
  profile: NovelXWorldVisual.VisualRegistrationProfile
  now: number
  cellCount?: number
}): Promise<{ manifest: NovelXWorldVisual.Manifest; maskBytes: Buffer }> {
  const blueprint = verifyWorldBlueprint(input.blueprint)
  const materialization = verifyWorldMaterialization({ manifest: input.materialization, blueprint })
  if (materialization.status !== "completed") {
    throw new WorldVisualError(
      "NOVELX_VISUAL_WORLD_INCOMPLETE",
      "World visuals require a completed world materialization.",
    )
  }
  const documents = new Map(materialization.documents.map((document) => [document.entityId, document]))
  const entities = new Map(
    materialization.stages.flatMap((stage) => stage.entities.map((entity) => [entity.id, entity])),
  )
  for (const claim of input.profile.claims) requireCommittedSource(claim.entityId, entities, documents)
  for (const scenery of input.profile.scenery) requireCommittedSource(scenery.ownerEntityId, entities, documents)
  validateScenery(input.profile)

  const seed = `${blueprint.integritySha256}:world-atlas-v1`
  const baseCells = voronoiCells(seed, input.cellCount ?? 72)
  const features = input.profile.claims.map((claim) => {
    const source = requireCommittedSource(claim.entityId, entities, documents)
    const ranked = baseCells
      .map((cell) => ({
        cell,
        distance: Math.min(...claim.anchors.map((anchor) => distance(cell.center, anchor))),
        order: Math.min(...claim.anchors.map((anchor, index) => distance(cell.center, anchor) + index * 0.00001)),
      }))
      .sort((left, right) => left.order - right.order)
    const selected = ranked.filter((item) => item.distance <= claim.radius)
    const cellIds = (selected.length ? selected : ranked.slice(0, 1)).map((item) => item.cell.id)
    return {
      entityId: claim.entityId,
      layer: claim.layer,
      kind: claim.kind,
      surface: claim.surface,
      cellIds,
      label: claim.label,
      labelPoint: claim.anchors[0]!,
      summary: claim.summary,
      sourceSha256: source.committedSha256!,
      importance: claim.importance,
    } satisfies NovelXWorldVisual.AtlasFeature
  })
  const cells = baseCells.map((cell) => {
    const geography = features.filter((feature) => feature.layer === "geography" && feature.cellIds.includes(cell.id))
    const human = features.filter((feature) => feature.layer === "human" && feature.cellIds.includes(cell.id))
    const surface = geography
      .toSorted((left, right) => surfacePriority(right.surface) - surfacePriority(left.surface))
      .at(0)?.surface
    return {
      ...cell,
      surface: surface ?? (cell.center.x < 0.08 || cell.center.x > 0.92 || cell.center.y < 0.06 ? "ocean" : "plain"),
      geographyEntityIds: geography.map((feature) => feature.entityId),
      humanEntityIds: human.map((feature) => feature.entityId),
    } satisfies NovelXWorldVisual.AtlasCell
  })
  const mapSources = features.filter((feature) => feature.layer === "geography")
  if (!mapSources.length) {
    throw new WorldVisualError("NOVELX_VISUAL_GEOGRAPHY_REQUIRED", "A world map requires geography claims.")
  }
  const maskBytes = await renderSemanticMask(cells)
  const semanticMaskSha256 = createHash("sha256").update(maskBytes).digest("hex")
  const meshSha256 = worldSha256(cells.map(({ geographyEntityIds, humanEntityIds, ...cell }) => cell))
  const visualLanguageSha256 = worldSha256(input.profile.visualLanguage)
  const mapTask = {
    id: stableId("visual-task", "world-map", meshSha256, semanticMaskSha256),
    type: "map" as const,
    subtype: "world-map" as const,
    ownerEntityId: null,
    status: "queued" as const,
    title: `${blueprint.profile.title}世界地图`,
    prompt: input.profile.mapPrompt,
    rationale: "以已封存自然档案和权威语义网格生成无字底图，地理与国家文字由 UI 图层投影。",
    sourceEntityIds: mapSources.map((feature) => feature.entityId),
    sourceSha256s: mapSources.map((feature) => feature.sourceSha256),
    targetPath: NovelXWorldVisual.MAP_RASTER_PATH,
    mime: null,
    assetSha256: null,
    model: null,
    startedAt: null,
    completedAt: null,
    errorCode: null,
  } satisfies NovelXWorldVisual.ImageTask
  const sceneryTasks = input.profile.scenery.map((item) => {
    const source = documents.get(item.ownerEntityId)!
    return {
      id: stableId("visual-task", "scenery", item.ownerEntityId, item.subtype, item.title),
      type: "scenery" as const,
      subtype: item.subtype,
      ownerEntityId: item.ownerEntityId,
      status: "queued" as const,
      title: item.title,
      prompt: item.prompt,
      rationale: item.rationale,
      sourceEntityIds: [item.ownerEntityId],
      sourceSha256s: [source.committedSha256!],
      targetPath: `${NovelXWorldVisual.SCENERY_DIRECTORY}/${item.ownerEntityId}-${item.subtype}.png`,
      mime: null,
      assetSha256: null,
      model: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
    } satisfies NovelXWorldVisual.ImageTask
  })
  const atlas = {
    id: stableId("atlas", blueprint.integritySha256),
    title: blueprint.profile.title,
    width: 1024 as const,
    height: 1024 as const,
    seed,
    meshSha256,
    semanticMaskPath: NovelXWorldVisual.SEMANTIC_MASK_PATH,
    semanticMaskSha256,
    rasterPath: NovelXWorldVisual.MAP_RASTER_PATH,
    cells,
    features,
  }
  const draft = {
    schemaVersion: 1 as const,
    stage: "world_visuals" as const,
    status: "queued" as const,
    worldMaterializationIntegritySha256: materialization.integritySha256,
    visualLanguage: input.profile.visualLanguage,
    visualLanguageSha256,
    atlas,
    tasks: [mapTask, ...sceneryTasks],
    createdAt: input.now,
    updatedAt: input.now,
  }
  const manifest = { ...draft, integritySha256: worldSha256(draft) } satisfies NovelXWorldVisual.Manifest
  return { manifest, maskBytes }
}

export function verifyWorldVisuals(input: {
  manifest: NovelXWorldVisual.Manifest
  materialization: NovelXWorld.WorldMaterialization
}) {
  const { integritySha256, ...draft } = input.manifest
  if (worldSha256(draft) !== integritySha256) {
    throw new WorldVisualError("NOVELX_VISUAL_INTEGRITY_INVALID", "World visual manifest integrity check failed.")
  }
  if (input.manifest.worldMaterializationIntegritySha256 !== input.materialization.integritySha256) {
    throw new WorldVisualError("NOVELX_VISUAL_SOURCE_DRIFT", "World visual manifest belongs to stale world facts.")
  }
  const featureIds = new Set(input.manifest.atlas.features.map((feature) => feature.entityId))
  for (const cell of input.manifest.atlas.cells) {
    if ([...cell.geographyEntityIds, ...cell.humanEntityIds].some((entityId) => !featureIds.has(entityId))) {
      throw new WorldVisualError("NOVELX_VISUAL_CELL_REFERENCE_INVALID", "Atlas cell references an unknown feature.")
    }
  }
  const tasks = new Set(input.manifest.tasks.map((task) => task.id))
  if (
    tasks.size !== input.manifest.tasks.length ||
    input.manifest.tasks.filter((task) => task.type === "map").length !== 1
  ) {
    throw new WorldVisualError("NOVELX_VISUAL_TASK_SET_INVALID", "World visuals require one unique map task.")
  }
  return input.manifest
}

export function updateImageTask(input: {
  manifest: NovelXWorldVisual.Manifest
  taskId: string
  status: NovelXWorldVisual.ImageTaskStatus
  now: number
  model?: string
  mime?: "image/png" | "image/jpeg" | "image/webp"
  assetSha256?: string
  errorCode?: string
}) {
  const task = input.manifest.tasks.find((item) => item.id === input.taskId)
  if (!task) throw new WorldVisualError("NOVELX_VISUAL_TASK_UNKNOWN", "Unknown world image task.")
  const allowed: Record<NovelXWorldVisual.ImageTaskStatus, NovelXWorldVisual.ImageTaskStatus[]> = {
    queued: ["generating"],
    generating: ["validating", "failed"],
    validating: ["attached", "failed"],
    attached: [],
    failed: ["generating"],
  }
  if (!allowed[task.status].includes(input.status)) {
    throw new WorldVisualError(
      "NOVELX_VISUAL_TASK_TRANSITION_INVALID",
      `Image task may not transition from ${task.status} to ${input.status}.`,
    )
  }
  if (input.status === "attached" && (!input.mime || !input.assetSha256 || !input.model)) {
    throw new WorldVisualError("NOVELX_VISUAL_ASSET_REQUIRED", "Attached image tasks require validated media evidence.")
  }
  const tasks = input.manifest.tasks.map(
    (item): NovelXWorldVisual.ImageTask =>
      item.id !== task.id
        ? item
        : {
            ...item,
            status: input.status,
            model: input.model ?? item.model,
            mime: input.mime ?? item.mime,
            assetSha256: input.assetSha256 ?? item.assetSha256,
            startedAt: input.status === "generating" ? input.now : item.startedAt,
            completedAt:
              input.status === "generating"
                ? null
                : input.status === "attached" || input.status === "failed"
                  ? input.now
                  : item.completedAt,
            errorCode: input.status === "failed" ? (input.errorCode ?? "NOVELX_IMAGE_PROVIDER_FAILED") : null,
          },
  )
  const attached = tasks.filter((item) => item.status === "attached").length
  const failed = tasks.filter((item) => item.status === "failed").length
  const status: NovelXWorldVisual.Manifest["status"] =
    attached === tasks.length
      ? "ready"
      : failed && attached
        ? "partial"
        : failed === tasks.length
          ? "failed"
          : "generating"
  const draft = { ...input.manifest, status, tasks, updatedAt: input.now, integritySha256: undefined }
  const { integritySha256: _ignored, ...withoutIntegrity } = draft
  return { ...withoutIntegrity, integritySha256: worldSha256(withoutIntegrity) } satisfies NovelXWorldVisual.Manifest
}

function validateScenery(profile: NovelXWorldVisual.VisualRegistrationProfile) {
  if (profile.scenery.filter((item) => item.subtype === "wonder").length > 3) {
    throw new WorldVisualError("NOVELX_VISUAL_WONDER_BUDGET_EXCEEDED", "A world may select at most three wonders.")
  }
  const humanRequired = profile.claims.filter((claim) => claim.layer === "human" && claim.importance === "required")
  for (const claim of humanRequired) {
    const present = profile.scenery.some(
      (item) => item.ownerEntityId === claim.entityId && ["capital", "fleet", "emblem"].includes(item.subtype),
    )
    if (!present) {
      throw new WorldVisualError(
        "NOVELX_VISUAL_REQUIRED_HUMAN_SCENERY_MISSING",
        `Important polity or organization ${claim.label} requires a capital, headquarters/fleet, or emblem task.`,
      )
    }
  }
}

function requireCommittedSource(
  entityId: string,
  entities: Map<string, NovelXWorld.RegisteredEntity>,
  documents: Map<string, NovelXWorld.WorldDocumentRecord>,
) {
  if (!entities.has(entityId)) {
    throw new WorldVisualError("NOVELX_VISUAL_ENTITY_UNKNOWN", `Unknown visual source entity ${entityId}.`)
  }
  const source = documents.get(entityId)
  if (source?.status !== "committed" || !source.committedSha256) {
    throw new WorldVisualError("NOVELX_VISUAL_SOURCE_UNCOMMITTED", `Visual source ${entityId} is not committed.`)
  }
  return source
}

function voronoiCells(seed: string, count: number) {
  if (count < 24 || count > 160)
    throw new WorldVisualError("NOVELX_VISUAL_CELL_COUNT_INVALID", "Cell count is out of range.")
  const columns = Math.ceil(Math.sqrt(count * 1.2))
  const rows = Math.ceil(count / columns)
  const random = seededRandom(seed)
  const sites = Array.from({ length: count }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      x: clamp((column + 0.5 + (random() - 0.5) * 0.56) / columns),
      y: clamp((row + 0.5 + (random() - 0.5) * 0.56) / rows),
    }
  })
  const polygons = sites.map((site, index) =>
    sites.reduce<Point[]>(
      (polygon, other, otherIndex) => {
        if (index === otherIndex || polygon.length === 0) return polygon
        return clipHalfPlane(polygon, site, other)
      },
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    ),
  )
  const edges = new Map<string, number[]>()
  polygons.forEach((polygon, index) =>
    polygon.forEach((point, pointIndex) => {
      const next = polygon[(pointIndex + 1) % polygon.length]!
      const key = edgeKey(point, next)
      edges.set(key, [...(edges.get(key) ?? []), index])
    }),
  )
  const neighbors = sites.map(() => new Set<number>())
  for (const indexes of edges.values()) {
    if (indexes.length !== 2) continue
    neighbors[indexes[0]!]!.add(indexes[1]!)
    neighbors[indexes[1]!]!.add(indexes[0]!)
  }
  return sites.map((center, index) => ({
    id: `cell-${String(index + 1).padStart(3, "0")}`,
    center,
    polygon: polygons[index]!.map((point) => ({ x: round(point.x), y: round(point.y) })),
    neighborIds: [...neighbors[index]!]
      .sort((left, right) => left - right)
      .map((item) => `cell-${String(item + 1).padStart(3, "0")}`),
  }))
}

function clipHalfPlane(polygon: Point[], site: Point, other: Point) {
  const midpoint = { x: (site.x + other.x) / 2, y: (site.y + other.y) / 2 }
  const normal = { x: other.x - site.x, y: other.y - site.y }
  const inside = (point: Point) => (point.x - midpoint.x) * normal.x + (point.y - midpoint.y) * normal.y <= 0.0000001
  return polygon.flatMap((current, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!
    const currentInside = inside(current)
    const previousInside = inside(previous)
    if (currentInside === previousInside) return currentInside ? [current] : []
    const direction = { x: current.x - previous.x, y: current.y - previous.y }
    const denominator = direction.x * normal.x + direction.y * normal.y
    const t =
      denominator === 0
        ? 0
        : ((midpoint.x - previous.x) * normal.x + (midpoint.y - previous.y) * normal.y) / denominator
    const crossing = { x: previous.x + direction.x * t, y: previous.y + direction.y * t }
    return currentInside ? [crossing, current] : [crossing]
  })
}

async function renderSemanticMask(cells: NovelXWorldVisual.AtlasCell[]) {
  const size = 1024
  const rgba = new Uint8Array(size * size * 4)
  const colors: Record<NovelXWorldVisual.Surface, readonly [number, number, number]> = {
    ocean: [42, 91, 124],
    plain: [124, 145, 89],
    mountain: [104, 101, 94],
    desert: [180, 144, 81],
    marsh: [61, 118, 109],
    coast: [176, 164, 115],
    forest: [55, 103, 72],
    ice: [198, 211, 211],
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const point = { x: (x + 0.5) / size, y: (y + 0.5) / size }
      const cell = cells.reduce((best, candidate) =>
        distance(point, candidate.center) < distance(point, best.center) ? candidate : best,
      )
      const color = colors[cell.surface]
      const offset = (y * size + x) * 4
      rgba[offset] = color[0]
      rgba[offset + 1] = color[1]
      rgba[offset + 2] = color[2]
      rgba[offset + 3] = 255
    }
  }
  const photon = await import("@silvia-odwyer/photon-node")
  const image = new photon.PhotonImage(rgba, size, size)
  try {
    return Buffer.from(image.get_bytes())
  } finally {
    image.free()
  }
}

function surfacePriority(surface: NovelXWorldVisual.Surface) {
  return { ocean: 0, plain: 1, coast: 2, forest: 3, marsh: 4, desert: 5, ice: 6, mountain: 7 }[surface]
}

function distance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function edgeKey(left: Point, right: Point) {
  const point = (value: Point) => `${value.x.toFixed(5)},${value.y.toFixed(5)}`
  return [point(left), point(right)].sort().join("|")
}

function seededRandom(seed: string) {
  let value = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) || 1
  return () => {
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return (value >>> 0) / 4294967296
  }
}

function stableId(...parts: string[]) {
  return `nx-${parts[0]}-${createHash("sha256").update(parts.slice(1).join("\0")).digest("hex").slice(0, 16)}`
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}

function round(value: number) {
  return Math.round(clamp(value) * 1_000_000) / 1_000_000
}
