import { createHash } from "node:crypto"
import { NovelXWorldVisual } from "@opencode-ai/schema"
import { WorldVisualError } from "./world-visual"
import { renderWorldMapVariantAreaMask, resolveWorldMapEditPlan } from "./world-map-variant"

export const DY_WORLD_MAP_MODEL = "dy-parse/z-image-turbo"

export type DyWorldMapRequest = {
  url: string
  init: RequestInit
  model: typeof DY_WORLD_MAP_MODEL
  editMask?: Buffer
}

export async function buildDyWorldMapRequest(input: {
  endpoint: string
  apiKey?: string
  manifest: NovelXWorldVisual.Manifest
  task: NovelXWorldVisual.ImageTask
  source: Buffer
}): Promise<DyWorldMapRequest> {
  const endpoint = normalizeEndpoint(input.endpoint)
  const plan = resolveWorldMapEditPlan({ manifest: input.manifest, task: input.task })
  const dimensions = await imageDimensions(input.source)
  if (dimensions.width !== dimensions.height || dimensions.width < 32 || dimensions.width > 2048) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_SOURCE_DIMENSIONS_INVALID",
      `World map editing requires a square 32-2048 px source, received ${dimensions.width}x${dimensions.height}.`,
    )
  }
  const form = new FormData()
  form.append("image", pngBlob(input.source), plan.sourceFilename)
  form.append(
    "prompt",
    [
      input.manifest.visualLanguage,
      input.task.prompt,
      plan.instruction,
      "Do not render text, labels, legends, borders, grids, UI, signatures, or watermarks.",
    ].join("\n\n"),
  )
  form.append(
    "negative_prompt",
    "text, labels, legend, grid, user interface, watermark, signature, altered outside region, broken outline, disconnected selection, dull edge",
  )
  form.append("strength", "0.72")
  form.append("width", String(dimensions.width))
  form.append("height", String(dimensions.height))
  form.append("num_inference_steps", "9")
  form.append("guidance_scale", "1")
  form.append("seed", String(stableSeed(input.task.id)))
  form.append("num_images", "1")
  form.append("response_format", "b64_json")
  let editMask: Buffer | undefined
  if (plan.kind === "variant") {
    editMask = await renderWorldMapVariantAreaMask({
      manifest: input.manifest,
      task: input.task,
      size: dimensions.width,
    })
    form.append("mask_image", pngBlob(editMask), `${input.task.entityId}-selected-area.png`)
  }
  return {
    url: `${endpoint}/${plan.kind === "variant" ? "inpaint" : "img2img"}`,
    init: {
      method: "POST",
      headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : undefined,
      body: form,
    },
    model: DY_WORLD_MAP_MODEL,
    editMask,
  }
}

function normalizeEndpoint(value: string) {
  const endpoint = value.trim().replace(/\/+$/u, "")
  if (!endpoint) {
    throw new WorldVisualError("NOVELX_IMAGE_MAP_ENDPOINT_MISSING", "World map image endpoint is missing.")
  }
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new WorldVisualError("NOVELX_IMAGE_MAP_ENDPOINT_INVALID", "World map image endpoint is invalid.")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new WorldVisualError("NOVELX_IMAGE_MAP_ENDPOINT_INVALID", "World map image endpoint must use HTTP or HTTPS.")
  }
  return endpoint
}

async function imageDimensions(bytes: Buffer) {
  const photon = await import("@silvia-odwyer/photon-node")
  let image: InstanceType<typeof photon.PhotonImage>
  try {
    image = photon.PhotonImage.new_from_byteslice(bytes)
  } catch (cause) {
    throw new WorldVisualError(
      "NOVELX_IMAGE_MAP_SOURCE_INVALID",
      cause instanceof Error ? cause.message : "World map source is not a valid raster image.",
    )
  }
  try {
    return { width: image.get_width(), height: image.get_height() }
  } finally {
    image.free()
  }
}

function pngBlob(bytes: Buffer) {
  return new Blob([Uint8Array.from(bytes).buffer], { type: "image/png" })
}

function stableSeed(value: string) {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16) & 0x7fffffff
}
