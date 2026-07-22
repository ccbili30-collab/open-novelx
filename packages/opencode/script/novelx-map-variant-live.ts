import path from "node:path"
import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { Schema } from "effect"
import { NovelXWorldVisual } from "@opencode-ai/schema"
import { worldSha256 } from "@/novelx/world-blueprint"
import { worldMapVariantPrompt } from "@/novelx/world-visual"
import { buildDyWorldMapRequest, DY_WORLD_MAP_MODEL } from "@/novelx/world-map-image-provider"
import { requestImage, validateImage } from "@/novelx/world-image-queue"
import { Effect } from "effect"

const sourceDirectory = path.resolve(process.argv[2] ?? "")
const outputDirectory = path.resolve(
  process.argv[3] ?? path.join(import.meta.dir, "../../../prototypes/map-variant-live"),
)
const endpoint = process.argv[4] ?? process.env.NOVELX_MAP_IMAGE_ENDPOINT
if (!process.argv[2] || !endpoint) {
  throw new Error(
    "Usage: bun run script/novelx-map-variant-live.ts <world-directory> [output-directory] <image-endpoint>",
  )
}

const manifestPath = path.join(sourceDirectory, ".novelx", "visuals", "world-visuals.json")
const sourceManifest = Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(await Bun.file(manifestPath).json())
const oldBase = sourceManifest.tasks.find((task) => task.type === "map")
if (!oldBase || oldBase.status !== "attached") throw new Error("The source project has no attached shared world map.")
const sourceRasterPath = path.join(sourceDirectory, ...sourceManifest.atlas.rasterPath.split("/"))
const sourceRaster = Buffer.from(await Bun.file(sourceRasterPath).arrayBuffer())
const photon = await import("@silvia-odwyer/photon-node")
const decoded = photon.PhotonImage.new_from_byteslice(sourceRaster)
const resized = photon.resize(decoded, 768, 768, photon.SamplingFilter.Lanczos3)
const baseBytes = Buffer.from(resized.get_bytes())
decoded.free()
resized.free()

const assetsDirectory = path.join(outputDirectory, "assets")
const masksDirectory = path.join(assetsDirectory, "masks")
const rawDirectory = path.join(assetsDirectory, "raw")
await Promise.all([
  mkdir(assetsDirectory, { recursive: true }),
  mkdir(masksDirectory, { recursive: true }),
  mkdir(rawDirectory, { recursive: true }),
])
await Bun.write(path.join(assetsDirectory, "map-base.png"), baseBytes)

const now = Date.now()
const baseTask = {
  ...oldBase,
  mapRole: "base" as const,
  layer: null,
  entityId: null,
  baseTaskId: null,
  status: "attached" as const,
  targetPath: NovelXWorldVisual.MAP_RASTER_PATH,
  mime: "image/png" as const,
  assetSha256: sha256(baseBytes),
  model: oldBase.model ?? "existing-world-map/v2",
  completedAt: oldBase.completedAt ?? now,
  errorCode: null,
} satisfies NovelXWorldVisual.ImageTask

const areaFeatures = sourceManifest.atlas.features.filter((feature) => feature.geometry === "area")
const variantTasks = areaFeatures.map(
  (feature) =>
    ({
      id: `nx-visual-task-${sha256(`${sourceManifest.atlas.meshSha256}\0${feature.layer}\0${feature.entityId}`).slice(0, 16)}`,
      type: "map",
      subtype: "region-highlight",
      mapRole: "variant",
      layer: feature.layer,
      entityId: feature.entityId,
      baseTaskId: baseTask.id,
      ownerEntityId: feature.entityId,
      status: "queued",
      title: `${feature.label}选中状态`,
      prompt: worldMapVariantPrompt(feature),
      rationale: `从共享底图派生${feature.label}点亮状态，点击归属仍由权威 Atlas 控制。`,
      sourceEntityIds: [feature.entityId],
      sourceSha256s: [feature.sourceSha256],
      targetPath: `${NovelXWorldVisual.MAP_VARIANT_DIRECTORY}/${feature.layer}/${feature.entityId}.png`,
      mime: null,
      assetSha256: null,
      model: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
    }) satisfies NovelXWorldVisual.ImageTask,
)
const sceneryTasks = sourceManifest.tasks
  .filter((task) => task.type === "scenery")
  .map(
    (task) =>
      ({
        ...task,
        mapRole: null,
        layer: null,
        entityId: null,
        baseTaskId: null,
      }) satisfies NovelXWorldVisual.ImageTask,
  )
let manifest = sealManifest({
  ...sourceManifest,
  schemaVersion: 3,
  status: "partial",
  atlas: { ...sourceManifest.atlas, rasterPath: NovelXWorldVisual.MAP_RASTER_PATH },
  tasks: [baseTask, ...variantTasks, ...sceneryTasks],
  updatedAt: now,
})
manifest = Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(manifest)
await persistProjection()

const configuredLimit = Number.parseInt(process.env.NOVELX_MAP_VARIANT_LIMIT ?? "", 10)
const tasksToRun =
  Number.isFinite(configuredLimit) && configuredLimit > 0 ? variantTasks.slice(0, configuredLimit) : variantTasks
for (const queued of tasksToRun) {
  const task = manifest.tasks.find((candidate) => candidate.id === queued.id)!
  const feature = manifest.atlas.features.find(
    (candidate) => candidate.layer === task.layer && candidate.entityId === task.entityId,
  )!
  const startedAt = Date.now()
  console.log(JSON.stringify({ event: "map.variant.started", label: feature.label, taskId: task.id }))
  const generating = { ...task, status: "generating" as const, startedAt, model: DY_WORLD_MAP_MODEL, errorCode: null }
  replaceTask(generating)
  await persistProjection()
  try {
    const request = await buildDyWorldMapRequest({ endpoint, manifest, task: generating, source: baseBytes })
    if (request.editMask) {
      await Bun.write(path.join(masksDirectory, `${feature.layer}-${feature.entityId}.png`), request.editMask)
    }
    const generated = await Effect.runPromise(requestImage(request.url, request.init, 600_000))
    await Bun.write(path.join(rawDirectory, `${feature.layer}-${feature.entityId}.png`), generated)
    const validated = await Effect.runPromise(validateImage(generated))
    const relativeAsset = `assets/${feature.layer}-${feature.entityId}.png`
    await Bun.write(path.join(outputDirectory, relativeAsset), validated.bytes)
    replaceTask({
      ...generating,
      status: "attached",
      mime: validated.mime,
      assetSha256: validated.sha256,
      completedAt: Date.now(),
      errorCode: null,
    })
    console.log(
      JSON.stringify({
        event: "map.variant.attached",
        label: feature.label,
        taskId: task.id,
        durationMs: Date.now() - startedAt,
        relativeAsset,
      }),
    )
  } catch (cause) {
    replaceTask({
      ...generating,
      status: "failed",
      completedAt: Date.now(),
      errorCode: cause instanceof Error ? cause.message.slice(0, 160) : String(cause).slice(0, 160),
    })
    console.error(
      JSON.stringify({
        event: "map.variant.failed",
        label: feature.label,
        taskId: task.id,
        durationMs: Date.now() - startedAt,
        error: cause instanceof Error ? cause.message : String(cause),
      }),
    )
  }
  await persistProjection()
}

const attached = manifest.tasks.filter(
  (task) => task.type === "map" && task.mapRole === "variant" && task.status === "attached",
).length
const failed = manifest.tasks.filter(
  (task) => task.type === "map" && task.mapRole === "variant" && task.status === "failed",
).length
manifest = sealManifest({
  ...manifest,
  status: failed === 0 && attached === variantTasks.length ? "ready" : "partial",
  updatedAt: Date.now(),
})
await persistProjection()
console.log(
  JSON.stringify({
    event: "map.variant.finished",
    attached,
    failed,
    attempted: tasksToRun.length,
    total: variantTasks.length,
    outputDirectory,
  }),
)

function replaceTask(task: NovelXWorldVisual.ImageTask) {
  const tasks = manifest.tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
  manifest = sealManifest({
    ...manifest,
    status: tasks.some((candidate) => candidate.status === "failed") ? "partial" : "generating",
    tasks,
    updatedAt: Date.now(),
  })
}

async function persistProjection() {
  const variants = Object.fromEntries(
    manifest.tasks
      .filter((task) => task.type === "map" && task.mapRole === "variant" && task.status === "attached")
      .map((task) => [`${task.layer}:${task.entityId}`, `assets/${task.layer}-${task.entityId}.png`]),
  )
  const preview = {
    title: manifest.atlas.title,
    base: "assets/map-base.png",
    areaCount: areaFeatures.length,
    variants,
    cells: manifest.atlas.cells,
    features: manifest.atlas.features,
  }
  await Promise.all([
    Bun.write(path.join(outputDirectory, "data.js"), `window.NOVELX_MAP_PREVIEW=${JSON.stringify(preview)};\n`),
    Bun.write(path.join(outputDirectory, "world-visuals.v3.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  ])
}

function sealManifest(input: Omit<NovelXWorldVisual.Manifest, "integritySha256"> | NovelXWorldVisual.Manifest) {
  const { integritySha256: _, ...draft } = input as NovelXWorldVisual.Manifest
  return { ...draft, integritySha256: worldSha256(draft) } as NovelXWorldVisual.Manifest
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex")
}
