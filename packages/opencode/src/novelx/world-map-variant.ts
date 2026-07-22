import { NovelXWorldVisual } from "@opencode-ai/schema"
import { WorldVisualError } from "./world-visual"

export type WorldMapEditPlan = {
  kind: "base" | "variant"
  sourcePath: string
  sourceFilename: string
  sourceTaskId: string | null
  instruction: string
}

export type WorldMapVariantAreaMaskInput = {
  manifest: NovelXWorldVisual.Manifest
  task: NovelXWorldVisual.ImageTask
  size?: number
}

export function resolveWorldMapEditPlan(input: {
  manifest: NovelXWorldVisual.Manifest
  task: NovelXWorldVisual.ImageTask
}): WorldMapEditPlan {
  if (input.task.type !== "map") {
    throw new WorldVisualError("NOVELX_IMAGE_MAP_TASK_REQUIRED", "World map edit planning requires a map task.")
  }
  if (input.manifest.schemaVersion === 2 || input.task.mapRole === "base") {
    return {
      kind: "base",
      sourcePath: input.manifest.atlas.semanticMaskPath,
      sourceFilename: "semantic-mask.png",
      sourceTaskId: null,
      instruction:
        "Use the supplied semantic color mask as a strict topology reference. Preserve coast, mountain, plain, desert, marsh, forest and ice placement while replacing flat colors with finished cartographic art.",
    }
  }
  if (
    input.task.mapRole !== "variant" ||
    input.task.subtype !== "region-highlight" ||
    !input.task.layer ||
    !input.task.entityId ||
    !input.task.baseTaskId
  ) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_VARIANT_INVALID",
      "Map variant tasks require a layer, entity, and shared base task.",
    )
  }
  const base = input.manifest.tasks.find(
    (candidate) => candidate.id === input.task.baseTaskId && candidate.type === "map" && candidate.mapRole === "base",
  )
  if (!base) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_BASE_MISSING",
      "Map variant task references a missing shared base map.",
    )
  }
  if (base.status !== "attached" || !base.assetSha256 || !base.mime) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_BASE_NOT_ATTACHED",
      "Map variant cannot run because the shared base map is not attached.",
    )
  }
  return {
    kind: "variant",
    sourcePath: base.targetPath,
    sourceFilename: "world-map-base.png",
    sourceTaskId: base.id,
    instruction:
      "Treat the supplied shared base map as the immutable world composition. The white mask is the complete selected region. Re-render that complete region as one clearly selected, visually coherent raised map plate while preserving its terrain identity and connection to the surrounding world. Draw a continuous luminous warm-gold perimeter around the selected plate, with a bright core, soft halo, slight inner lift, and subtle outer shadow. The entire selected region must be unmistakably distinguishable at a glance. Preserve every pixel outside the mask and do not add text, labels, legends, grids, UI, signatures, or watermarks.",
  }
}

export async function renderWorldMapVariantAreaMask(input: WorldMapVariantAreaMaskInput) {
  const { size, membership } = rasterizeWorldMapVariantMembership(input)
  const rgba = new Uint8Array(size * size * 4)
  for (let index = 0; index < membership.length; index++) {
    const value = membership[index] ? 255 : 0
    const offset = index * 4
    rgba[offset] = value
    rgba[offset + 1] = value
    rgba[offset + 2] = value
    rgba[offset + 3] = 255
  }
  const photon = await import("@silvia-odwyer/photon-node")
  const image = new photon.PhotonImage(rgba, size, size)
  try {
    return Buffer.from(image.get_bytes())
  } finally {
    image.free()
  }
}

function rasterizeWorldMapVariantMembership(input: WorldMapVariantAreaMaskInput) {
  const plan = resolveWorldMapEditPlan({ manifest: input.manifest, task: input.task })
  if (plan.kind !== "variant" || !input.task.layer || !input.task.entityId) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_VARIANT_REQUIRED",
      "A selected-region inpaint mask requires a map variant task.",
    )
  }
  const feature = input.manifest.atlas.features.find(
    (candidate) =>
      candidate.layer === input.task.layer &&
      candidate.entityId === input.task.entityId &&
      candidate.geometry === "area",
  )
  if (!feature) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_VARIANT_FEATURE_MISSING",
      "Map variant does not bind an authoritative Atlas area feature.",
    )
  }
  const cells = input.manifest.atlas.cells
  const cellIds = new Set(cells.map((cell) => cell.id))
  if (feature.cellIds.some((cellId) => !cellIds.has(cellId))) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_VARIANT_CELL_MISSING",
      "Map variant feature references an Atlas cell that does not exist.",
    )
  }
  const size = Math.floor(input.size ?? 1024)
  if (size < 32 || size > 2048) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_VARIANT_MASK_DIMENSIONS_INVALID",
      "Map variant mask dimensions are outside the supported range.",
    )
  }
  const selectedCells = new Set(feature.cellIds)
  const membership = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    const unitY = (y + 0.5) / size
    for (let x = 0; x < size; x++) {
      const unitX = (x + 0.5) / size
      let nearest = cells[0]!
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const candidate of cells) {
        const deltaX = unitX - candidate.center.x
        const deltaY = unitY - candidate.center.y
        const distance = deltaX * deltaX + deltaY * deltaY
        if (distance >= nearestDistance) continue
        nearest = candidate
        nearestDistance = distance
      }
      membership[y * size + x] = selectedCells.has(nearest.id) ? 1 : 0
    }
  }
  return { size, membership }
}
