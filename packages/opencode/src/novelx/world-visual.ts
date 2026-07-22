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
  const profile = normalizeVisualProfile(input.profile)
  for (const claim of profile.claims) requireCommittedSource(claim.entityId, entities, documents)
  for (const scenery of profile.scenery) requireCommittedSource(scenery.ownerEntityId, entities, documents)
  validateScenery(profile)

  validateSpatialClaims(profile.claims)
  const seed = `${blueprint.integritySha256}:world-atlas-v2`
  const baseCells = voronoiCells(seed, input.cellCount ?? 72)
  const claims = new Map(profile.claims.map((claim) => [claim.entityId, claim]))
  const children = new Map<string, string[]>()
  for (const claim of profile.claims) {
    if (!claim.parentEntityId) continue
    children.set(claim.parentEntityId, [...(children.get(claim.parentEntityId) ?? []), claim.entityId])
  }
  const geographyAreas = assignAreaCells(
    baseCells,
    profile.claims.filter(
      (claim) => claim.layer === "geography" && claim.geometry === "area" && !children.has(claim.entityId),
    ),
    "geography",
  )
  const humanAreas = assignAreaCells(
    baseCells,
    profile.claims.filter(
      (claim) => claim.layer === "human" && claim.geometry === "area" && !children.has(claim.entityId),
    ),
    "human",
  )
  const directCells = new Map(
    profile.claims.map((claim) => [
      claim.entityId,
      claim.geometry === "area"
        ? baseCells
            .filter(
              (cell) => (claim.layer === "geography" ? geographyAreas : humanAreas).get(cell.id) === claim.entityId,
            )
            .map((cell) => cell.id)
        : claim.geometry === "line"
          ? selectLineCells(baseCells, claim.anchors)
          : [nearestCell(baseCells, claim.anchors[0]!).id],
    ]),
  )
  const featureCells = (entityId: string, stack: string[] = []): string[] => {
    if (stack.includes(entityId)) {
      throw new WorldVisualError("NOVELX_VISUAL_HIERARCHY_CYCLE", "Atlas area hierarchy contains a cycle.")
    }
    const descendants = children.get(entityId)
    if (!descendants?.length) return directCells.get(entityId) ?? []
    return [...new Set(descendants.flatMap((child) => featureCells(child, [...stack, entityId])))]
  }
  const features = profile.claims.map((claim) => {
    const source = requireCommittedSource(claim.entityId, entities, documents)
    const cellIds = featureCells(claim.entityId)
    if (!cellIds.length) {
      throw new WorldVisualError(
        "NOVELX_VISUAL_FEATURE_EMPTY",
        `Spatial feature ${claim.label} does not own any atlas geometry.`,
      )
    }
    const featureCellRecords = cellIds.map((cellId) => baseCells.find((cell) => cell.id === cellId)!)
    const path = claim.geometry === "line" ? claim.anchors.map((point) => ({ ...point })) : []
    return {
      entityId: claim.entityId,
      layer: claim.layer,
      kind: claim.kind,
      geometry: claim.geometry,
      parentEntityId: claim.parentEntityId,
      surface: claim.surface,
      cellIds,
      rings: claim.geometry === "area" ? externalRings(featureCellRecords) : [],
      path,
      label: claim.label,
      labelPoint:
        claim.geometry === "area"
          ? areaLabelPoint(featureCellRecords)
          : claim.geometry === "line"
            ? path[Math.floor(path.length / 2)]!
            : claim.anchors[0]!,
      summary: claim.summary,
      sourceSha256: source.committedSha256!,
      importance: claim.importance,
    } satisfies NovelXWorldVisual.AtlasFeature
  })
  const cells = baseCells.map((cell) => {
    const geographyAreaEntityId = geographyAreas.get(cell.id) ?? null
    const humanAreaEntityId = humanAreas.get(cell.id) ?? null
    const geographyLineEntityIds = features
      .filter(
        (feature) => feature.layer === "geography" && feature.geometry === "line" && feature.cellIds.includes(cell.id),
      )
      .map((feature) => feature.entityId)
    const humanLineEntityIds = features
      .filter(
        (feature) => feature.layer === "human" && feature.geometry === "line" && feature.cellIds.includes(cell.id),
      )
      .map((feature) => feature.entityId)
    const pointEntityIds = features
      .filter((feature) => feature.geometry === "point" && feature.cellIds.includes(cell.id))
      .map((feature) => feature.entityId)
    const surface = geographyAreaEntityId ? claims.get(geographyAreaEntityId)?.surface : undefined
    return {
      ...cell,
      surface: surface ?? (cell.center.x < 0.08 || cell.center.x > 0.92 || cell.center.y < 0.06 ? "ocean" : "plain"),
      geographyAreaEntityId,
      humanAreaEntityId,
      geographyLineEntityIds,
      humanLineEntityIds,
      pointEntityIds,
    } satisfies NovelXWorldVisual.AtlasCell
  })
  const mapSources = features.filter((feature) => feature.layer === "geography" && feature.geometry === "area")
  if (!mapSources.length) {
    throw new WorldVisualError("NOVELX_VISUAL_GEOGRAPHY_REQUIRED", "A world map requires geography claims.")
  }
  const maskBytes = await renderSemanticMask(cells)
  const semanticMaskSha256 = createHash("sha256").update(maskBytes).digest("hex")
  const meshSha256 = worldSha256(cells)
  const visualLanguageSha256 = worldSha256(profile.visualLanguage)
  const mapPrompt = [
    profile.mapPrompt,
    "Authoritative placements (normalized x,y; north is y=0):",
    ...mapSources.map(
      (feature) =>
        `${feature.label}: ${feature.surface}, label near (${feature.labelPoint.x.toFixed(2)},${feature.labelPoint.y.toFixed(2)}).`,
    ),
  ]
    .join("\n")
    .slice(0, 2000)
  const mapTask = {
    id: stableId("visual-task", "world-map", meshSha256, semanticMaskSha256),
    type: "map" as const,
    subtype: "world-map" as const,
    mapRole: "base" as const,
    layer: null,
    entityId: null,
    baseTaskId: null,
    ownerEntityId: null,
    status: "queued" as const,
    title: `${blueprint.profile.title}地图`,
    prompt: mapPrompt,
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
  const mapVariantTasks = features
    .filter((feature) => feature.geometry === "area")
    .map((feature) => {
      const sources = [feature, ...mapSources].filter(
        (candidate, index, candidates) =>
          candidates.findIndex((other) => other.entityId === candidate.entityId) === index,
      )
      return {
        id: stableId("visual-task", "map-variant", meshSha256, feature.layer, feature.entityId),
        type: "map" as const,
        subtype: "region-highlight" as const,
        mapRole: "variant" as const,
        layer: feature.layer,
        entityId: feature.entityId,
        baseTaskId: mapTask.id,
        ownerEntityId: feature.entityId,
        status: "queued" as const,
        title: `${feature.label}选中状态`,
        prompt: mapVariantPrompt(feature),
        rationale: `从同一张世界底图派生${feature.label}的${feature.layer === "geography" ? "自然地理" : "人文疆域"}选中状态；名称、点击范围和档案绑定仍由权威 Atlas 投影。`,
        sourceEntityIds: sources.map((source) => source.entityId),
        sourceSha256s: sources.map((source) => source.sourceSha256),
        targetPath: `${NovelXWorldVisual.MAP_VARIANT_DIRECTORY}/${feature.layer}/${feature.entityId}.png`,
        mime: null,
        assetSha256: null,
        model: null,
        startedAt: null,
        completedAt: null,
        errorCode: null,
      } satisfies NovelXWorldVisual.ImageTask
    })
  const sceneryTasks = profile.scenery.map((item) => {
    const source = documents.get(item.ownerEntityId)!
    return {
      id: stableId("visual-task", "scenery", item.ownerEntityId, item.subtype, item.title),
      type: "scenery" as const,
      subtype: item.subtype,
      mapRole: null,
      layer: null,
      entityId: null,
      baseTaskId: null,
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
    schemaVersion: 3 as const,
    stage: "world_visuals" as const,
    status: "queued" as const,
    worldMaterializationIntegritySha256: materialization.integritySha256,
    visualLanguage: profile.visualLanguage,
    visualLanguageSha256,
    atlas,
    tasks: [mapTask, ...mapVariantTasks, ...sceneryTasks],
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
  if (featureIds.size !== input.manifest.atlas.features.length) {
    throw new WorldVisualError("NOVELX_VISUAL_FEATURE_SET_INVALID", "Atlas feature IDs must be unique.")
  }
  for (const cell of input.manifest.atlas.cells) {
    if (
      [
        cell.geographyAreaEntityId,
        cell.humanAreaEntityId,
        ...cell.geographyLineEntityIds,
        ...cell.humanLineEntityIds,
        ...cell.pointEntityIds,
      ].some((entityId) => entityId !== null && !featureIds.has(entityId))
    ) {
      throw new WorldVisualError("NOVELX_VISUAL_CELL_REFERENCE_INVALID", "Atlas cell references an unknown feature.")
    }
  }
  validateAtlasGeometry(input.manifest)
  const tasks = new Set(input.manifest.tasks.map((task) => task.id))
  if (tasks.size !== input.manifest.tasks.length) {
    throw new WorldVisualError("NOVELX_VISUAL_TASK_SET_INVALID", "World visual task IDs must be unique.")
  }
  validateMapTasks(input.manifest)
  return input.manifest
}

/**
 * Stable identity of the registered visual plan. Worker progress and attached
 * media deliberately do not participate, so later image updates cannot make
 * source-anchored atlas and travelogue prose stale.
 */
export function worldVisualRegistrationSha256(manifest: NovelXWorldVisual.Manifest) {
  return worldSha256({
    schemaVersion: manifest.schemaVersion,
    stage: manifest.stage,
    worldMaterializationIntegritySha256: manifest.worldMaterializationIntegritySha256,
    visualLanguageSha256: manifest.visualLanguageSha256,
    atlas: manifest.atlas,
    tasks: manifest.tasks.map((task) => ({
      id: task.id,
      type: task.type,
      subtype: task.subtype,
      mapRole: task.mapRole ?? null,
      layer: task.layer ?? null,
      entityId: task.entityId ?? null,
      baseTaskId: task.baseTaskId ?? null,
      ownerEntityId: task.ownerEntityId,
      title: task.title,
      prompt: task.prompt,
      rationale: task.rationale,
      sourceEntityIds: task.sourceEntityIds,
      sourceSha256s: task.sourceSha256s,
      targetPath: task.targetPath,
    })),
  })
}

function mapVariantPrompt(feature: NovelXWorldVisual.AtlasFeature) {
  const points = feature.rings.flat()
  const extent = points.length
    ? `Target normalized extent: x ${Math.min(...points.map((point) => point.x)).toFixed(2)}-${Math.max(...points.map((point) => point.x)).toFixed(2)}, y ${Math.min(...points.map((point) => point.y)).toFixed(2)}-${Math.max(...points.map((point) => point.y)).toFixed(2)}.`
    : ""
  return [
    "Create one selected-state variant from the supplied shared base map.",
    `Target ${feature.layer === "geography" ? "geographic region" : "human realm"}: ${feature.label}.`,
    `Target context: ${feature.summary}`,
    `Approximate target label position: (${feature.labelPoint.x.toFixed(2)}, ${feature.labelPoint.y.toFixed(2)}).`,
    extent,
    "Keep the camera, canvas, coastline, terrain placement, proportions, palette, and every non-target region substantially unchanged.",
    "Only emphasize the target region with a restrained warm-gold perimeter, soft internal lift, and subtle outward glow suitable for a selected map state.",
    "Do not add text, legends, grids, UI, signatures, watermarks, or new borders outside the selected region.",
  ]
    .join("\n")
    .slice(0, 2000)
}

function validateMapTasks(manifest: NovelXWorldVisual.Manifest) {
  const issue = NovelXWorldVisual.mapVariantSetIssue(manifest)
  if (issue) throw new WorldVisualError(issue.code, issue.message)
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

function normalizeVisualProfile(
  profile: NovelXWorldVisual.VisualRegistrationProfile,
): NovelXWorldVisual.VisualRegistrationProfile {
  const records = new Map(profile.claims.map((claim) => [claim.entityId, claim]))
  const claims = profile.claims.map((claim) => {
    if (!claim.parentEntityId) return claim
    const parent = records.get(claim.parentEntityId)
    if (!parent || parent.geometry !== "area" || claim.geometry !== "area" || parent.layer !== claim.layer) {
      return { ...claim, parentEntityId: null }
    }
    const seen = new Set([claim.entityId])
    let cursor: NovelXWorldVisual.SpatialClaimProfile | undefined = parent
    while (cursor) {
      if (seen.has(cursor.entityId)) return { ...claim, parentEntityId: null }
      seen.add(cursor.entityId)
      cursor = cursor.parentEntityId ? records.get(cursor.parentEntityId) : undefined
    }
    return claim
  })
  const scenery = [...profile.scenery]
  for (const claim of claims) {
    if (claim.layer !== "human" || claim.importance !== "required") continue
    const present = scenery.some(
      (item) => item.ownerEntityId === claim.entityId && ["capital", "fleet", "emblem"].includes(item.subtype),
    )
    if (present) continue
    scenery.push({
      ownerEntityId: claim.entityId,
      subtype: "emblem",
      title: `${claim.label}徽记`,
      rationale: "补齐公开展示所需的最低限度人文视觉入口。",
      prompt: `为${claim.label}生成一枚符合世界共享画风的代表性徽记。依据：${claim.summary}。不出现现代 UI、边框或水印。`,
    })
  }
  return { ...profile, claims, scenery }
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

function validateSpatialClaims(claims: readonly NovelXWorldVisual.SpatialClaimProfile[]) {
  const records = new Map(claims.map((claim) => [claim.entityId, claim]))
  if (records.size !== claims.length) {
    throw new WorldVisualError("NOVELX_VISUAL_FEATURE_SET_INVALID", "Spatial claim entity IDs must be unique.")
  }
  for (const claim of claims) {
    if (!claim.parentEntityId) continue
    const parent = records.get(claim.parentEntityId)
    if (!parent || parent.geometry !== "area" || claim.geometry !== "area" || parent.layer !== claim.layer) {
      throw new WorldVisualError(
        "NOVELX_VISUAL_HIERARCHY_INVALID",
        `Spatial parent ${claim.parentEntityId} must be an area in the same layer.`,
      )
    }
    const seen = new Set([claim.entityId])
    let cursor: NovelXWorldVisual.SpatialClaimProfile | undefined = parent
    while (cursor) {
      if (seen.has(cursor.entityId)) {
        throw new WorldVisualError("NOVELX_VISUAL_HIERARCHY_CYCLE", "Atlas area hierarchy contains a cycle.")
      }
      seen.add(cursor.entityId)
      cursor = cursor.parentEntityId ? records.get(cursor.parentEntityId) : undefined
    }
  }
}

function assignAreaCells(
  cells: ReturnType<typeof voronoiCells>,
  claims: readonly NovelXWorldVisual.SpatialClaimProfile[],
  layer: "geography" | "human",
) {
  const assignments = new Map<string, string>()
  if (!claims.length) return assignments
  for (const cell of cells) {
    const ranked = claims
      .map((claim) => ({
        claim,
        score: Math.min(...claim.anchors.map((anchor) => distance(cell.center, anchor))) / claim.radius,
      }))
      .toSorted((left, right) => left.score - right.score || left.claim.entityId.localeCompare(right.claim.entityId))
    const best = ranked[0]!
    if (layer === "human" && best.score > 1) continue
    const edge = cell.center.x < 0.08 || cell.center.x > 0.92 || cell.center.y < 0.06 || cell.center.y > 0.97
    if (layer === "geography" && edge && best.score > 1 && best.claim.surface !== "ocean") continue
    assignments.set(cell.id, best.claim.entityId)
  }
  return assignments
}

function selectLineCells(cells: ReturnType<typeof voronoiCells>, anchors: readonly Point[]) {
  const anchorCells = anchors.map((anchor) => nearestCell(cells, anchor))
  return [
    ...new Set(
      anchorCells.flatMap((cell, index) => {
        const next = anchorCells[index + 1]
        return next ? shortestCellPath(cells, cell.id, next.id) : [cell.id]
      }),
    ),
  ]
}

function shortestCellPath(cells: ReturnType<typeof voronoiCells>, start: string, target: string) {
  if (start === target) return [start]
  const records = new Map(cells.map((cell) => [cell.id, cell]))
  const queue = [start]
  const previous = new Map<string, string>()
  const visited = new Set(queue)
  while (queue.length) {
    const current = queue.shift()!
    for (const neighbor of records.get(current)?.neighborIds ?? []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      previous.set(neighbor, current)
      if (neighbor === target) {
        const path = [target]
        while (path[0] !== start) path.unshift(previous.get(path[0]!)!)
        return path
      }
      queue.push(neighbor)
    }
  }
  throw new WorldVisualError("NOVELX_VISUAL_LINE_DISCONNECTED", "Atlas line anchors are disconnected.")
}

function nearestCell(cells: ReturnType<typeof voronoiCells>, point: Point) {
  return cells.reduce((best, candidate) =>
    distance(point, candidate.center) < distance(point, best.center) ? candidate : best,
  )
}

function externalRings(cells: ReturnType<typeof voronoiCells>) {
  const edges = new Map<string, { left: Point; right: Point; count: number }>()
  for (const cell of cells) {
    cell.polygon.forEach((left, index) => {
      const right = cell.polygon[(index + 1) % cell.polygon.length]!
      const key = edgeKey(left, right)
      const current = edges.get(key)
      edges.set(key, current ? { ...current, count: current.count + 1 } : { left, right, count: 1 })
    })
  }
  const boundary = [...edges.values()].filter((edge) => edge.count === 1)
  const pointKey = (point: Point) => `${point.x.toFixed(5)},${point.y.toFixed(5)}`
  const remaining = new Map(boundary.map((edge) => [edgeKey(edge.left, edge.right), edge]))
  const rings: Point[][] = []
  while (remaining.size) {
    const first = remaining.values().next().value as { left: Point; right: Point }
    remaining.delete(edgeKey(first.left, first.right))
    const ring = [first.left, first.right]
    while (pointKey(ring.at(-1)!) !== pointKey(ring[0]!)) {
      const end = ring.at(-1)!
      const next = [...remaining.values()].find(
        (edge) => pointKey(edge.left) === pointKey(end) || pointKey(edge.right) === pointKey(end),
      )
      if (!next) {
        throw new WorldVisualError("NOVELX_VISUAL_OUTLINE_OPEN", "Atlas area boundary is not a closed ring.")
      }
      remaining.delete(edgeKey(next.left, next.right))
      ring.push(pointKey(next.left) === pointKey(end) ? next.right : next.left)
    }
    rings.push(ring.slice(0, -1))
  }
  return rings
}

function areaLabelPoint(cells: ReturnType<typeof voronoiCells>) {
  const centroid = {
    x: cells.reduce((sum, cell) => sum + cell.center.x, 0) / cells.length,
    y: cells.reduce((sum, cell) => sum + cell.center.y, 0) / cells.length,
  }
  return nearestCell(cells, centroid).center
}

function validateAtlasGeometry(manifest: NovelXWorldVisual.Manifest) {
  const cells = new Map(manifest.atlas.cells.map((cell) => [cell.id, cell]))
  const features = new Map(manifest.atlas.features.map((feature) => [feature.entityId, feature]))
  for (const feature of manifest.atlas.features) {
    if (feature.cellIds.some((cellId) => !cells.has(cellId))) {
      throw new WorldVisualError("NOVELX_VISUAL_FEATURE_CELL_INVALID", "Atlas feature references an unknown cell.")
    }
    if (feature.geometry === "area" && !feature.rings.length) {
      throw new WorldVisualError("NOVELX_VISUAL_OUTLINE_REQUIRED", "Atlas areas require an external outline.")
    }
    if (feature.geometry === "line" && feature.path.length < 2) {
      throw new WorldVisualError("NOVELX_VISUAL_LINE_PATH_REQUIRED", "Atlas lines require an ordered path.")
    }
    if (feature.parentEntityId) {
      const parent = features.get(feature.parentEntityId)
      if (!parent || parent.geometry !== "area" || parent.layer !== feature.layer) {
        throw new WorldVisualError("NOVELX_VISUAL_HIERARCHY_INVALID", "Atlas feature parent is invalid.")
      }
      if (feature.cellIds.some((cellId) => !parent.cellIds.includes(cellId))) {
        throw new WorldVisualError("NOVELX_VISUAL_PARENT_UNION_INVALID", "Atlas parent does not contain its child.")
      }
    }
  }
  for (const layer of ["geography", "human"] as const) {
    const leafAreas = manifest.atlas.features.filter(
      (feature) =>
        feature.layer === layer &&
        feature.geometry === "area" &&
        !manifest.atlas.features.some((candidate) => candidate.parentEntityId === feature.entityId),
    )
    const ownership = new Set<string>()
    for (const feature of leafAreas) {
      for (const cellId of feature.cellIds) {
        if (ownership.has(cellId)) {
          throw new WorldVisualError("NOVELX_VISUAL_AREA_OVERLAP", "Sibling atlas areas may not overlap.")
        }
        ownership.add(cellId)
      }
    }
  }
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
      const unitX = (x + 0.5) / size
      const unitY = (y + 0.5) / size
      let cell = cells[0]!
      let bestDistance = Number.POSITIVE_INFINITY
      for (const candidate of cells) {
        const deltaX = unitX - candidate.center.x
        const deltaY = unitY - candidate.center.y
        const candidateDistance = deltaX * deltaX + deltaY * deltaY
        if (candidateDistance >= bestDistance) continue
        cell = candidate
        bestDistance = candidateDistance
      }
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
