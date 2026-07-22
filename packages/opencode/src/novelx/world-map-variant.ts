import { NovelXWorldVisual } from "@opencode-ai/schema"
import { WorldVisualError } from "./world-visual"

export type WorldMapEditPlan = {
  kind: "base" | "variant"
  sourcePath: string
  sourceFilename: string
  sourceTaskId: string | null
  instruction: string
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
    (candidate) =>
      candidate.id === input.task.baseTaskId && candidate.type === "map" && candidate.mapRole === "base",
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
      "Use the supplied shared base map as the immutable visual source. Preserve its complete composition and alter only the selected-region lighting and perimeter described by the task prompt.",
  }
}
