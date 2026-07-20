import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { NovelXWorldVisual } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Provider } from "@/provider/provider"
import { loadWorldRuntime, publishWorldFile, withWorldMutation } from "@/tool/novelx-world-runtime"
import { updateImageTask, verifyWorldVisuals, WorldVisualError } from "./world-visual"

const IMAGE_PROVIDER = ProviderV2.ID.make("openai-compatible")
const IMAGE_MODEL = ModelV2.ID.make("gpt-image-2-cheap")

export function runWorldImageQueue(options: { directory: string }) {
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const provider = yield* Provider.Service
    const info = yield* provider.getProvider(IMAGE_PROVIDER)
    yield* provider.getModel(IMAGE_PROVIDER, IMAGE_MODEL)
    const baseURL = typeof info.options.baseURL === "string" ? info.options.baseURL.replace(/\/$/u, "") : undefined
    const apiKey = typeof info.options.apiKey === "string" ? info.options.apiKey : info.key
    if (!baseURL || !apiKey) {
      throw new WorldVisualError("NOVELX_IMAGE_PROVIDER_UNCONFIGURED", "Image provider baseURL or API key is missing.")
    }
    const runtime = yield* loadWorldRuntime(fs)
    if (runtime.directory !== options.directory) {
      throw new WorldVisualError("NOVELX_IMAGE_DIRECTORY_MISMATCH", "Image worker started for another project.")
    }
    const initial = yield* loadManifest(fs, runtime.directory, runtime.materialization)
    const pending = initial.tasks.filter((task) => task.status !== "attached")
    for (const queued of pending) {
      yield* Effect.gen(function* () {
        const current = yield* loadManifest(fs, runtime.directory, runtime.materialization)
        const task = current.tasks.find((item) => item.id === queued.id)
        if (!task || task.status === "attached") return
        const recovered =
          task.status === "generating" || task.status === "validating"
            ? updateImageTask({
                manifest: current,
                taskId: task.id,
                status: "failed",
                now: Date.now(),
                errorCode: "NOVELX_IMAGE_WORKER_INTERRUPTED",
              })
            : current
        if (recovered !== current) yield* persistManifest(fs, events, runtime.directory, recovered)
        const before = recovered.tasks.find((item) => item.id === task.id)!
        if (before.status !== "queued" && before.status !== "failed") return
        const generating = updateImageTask({
          manifest: recovered,
          taskId: before.id,
          status: "generating",
          now: Date.now(),
          model: `${IMAGE_PROVIDER}/${IMAGE_MODEL}`,
        })
        yield* persistManifest(fs, events, runtime.directory, generating)
        const data = yield* generateImage({
          task: before,
          manifest: generating,
          directory: runtime.directory,
          baseURL,
          apiKey,
          fs,
        })
        const validating = updateImageTask({
          manifest: generating,
          taskId: before.id,
          status: "validating",
          now: Date.now(),
        })
        yield* persistManifest(fs, events, runtime.directory, validating)
        const validated = yield* validateImage(data)
        const target = absoluteVisualPath(runtime.directory, before.targetPath)
        const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
        yield* fs.ensureDir(path.dirname(target))
        yield* fs.writeFile(temporary, validated.bytes).pipe(
          Effect.andThen(fs.rename(temporary, target)),
          Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
        )
        const attached = updateImageTask({
          manifest: validating,
          taskId: before.id,
          status: "attached",
          now: Date.now(),
          model: `${IMAGE_PROVIDER}/${IMAGE_MODEL}`,
          mime: validated.mime,
          assetSha256: validated.sha256,
        })
        yield* persistManifest(fs, events, runtime.directory, attached)
        yield* publishWorldFile(events, target, "add")
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            const latest = yield* loadManifest(fs, runtime.directory, runtime.materialization)
            const task = latest.tasks.find((item) => item.id === queued.id)
            if (!task || task.status === "attached" || task.status === "failed") return
            const failed = updateImageTask({
              manifest: latest,
              taskId: task.id,
              status: "failed",
              now: Date.now(),
              errorCode: imageErrorCode(cause),
            })
            yield* persistManifest(fs, events, runtime.directory, failed)
            yield* Effect.logError("NovelX image task failed", { taskId: task.id, cause })
          }),
        ),
      )
    }
  })
}

function generateImage(input: {
  task: NovelXWorldVisual.ImageTask
  manifest: NovelXWorldVisual.Manifest
  directory: string
  baseURL: string
  apiKey: string
  fs: FSUtil.Interface
}) {
  const prompt = [
    input.manifest.visualLanguage,
    input.task.prompt,
    "Do not render text, labels, legends, borders, grids, UI, signatures, or watermarks.",
  ].join("\n\n")
  if (input.task.type === "map") {
    return Effect.gen(function* () {
      const mask = yield* input.fs.readFile(absoluteVisualPath(input.directory, input.manifest.atlas.semanticMaskPath))
      const form = new FormData()
      form.append("model", IMAGE_MODEL)
      form.append(
        "prompt",
        `${prompt}\n\nUse the supplied semantic color mask as a strict topology reference. Preserve coast, mountain, plain, desert, marsh, forest and ice placement while replacing flat colors with finished cartographic art.`,
      )
      form.append("image", new Blob([Uint8Array.from(mask).buffer], { type: "image/png" }), "semantic-mask.png")
      form.append("size", "1024x1024")
      form.append("quality", "low")
      form.append("response_format", "b64_json")
      return yield* requestImage(
        `${input.baseURL}/images/edits`,
        { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}` }, body: form },
        600_000,
      )
    })
  }
  return requestImage(`${input.baseURL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      quality: "low",
      response_format: "b64_json",
    }),
  })
}

function requestImage(url: string, init: RequestInit, timeout = 300_000) {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
      const text = await response.text()
      if (!response.ok) throw new Error(`NOVELX_IMAGE_PROVIDER_HTTP_${response.status}: ${text.slice(0, 500)}`)
      const parsed = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> }
      const first = parsed.data?.[0]
      if (first?.b64_json) return Buffer.from(first.b64_json, "base64")
      if (first?.url) {
        const asset = await fetch(first.url, { signal: AbortSignal.timeout(120_000) })
        if (!asset.ok) throw new Error(`NOVELX_IMAGE_ASSET_HTTP_${asset.status}`)
        return Buffer.from(await asset.arrayBuffer())
      }
      throw new Error("NOVELX_IMAGE_PROVIDER_EMPTY: No image payload returned.")
    },
    catch: (cause) =>
      new WorldVisualError("NOVELX_IMAGE_PROVIDER_FAILED", cause instanceof Error ? cause.message : String(cause)),
  })
}

function validateImage(bytes: Buffer) {
  return Effect.tryPromise({
    try: async () => {
      const photon = await import("@silvia-odwyer/photon-node")
      const image = photon.PhotonImage.new_from_byteslice(bytes)
      try {
        const width = image.get_width()
        const height = image.get_height()
        if (width < 768 || height < 768) throw new Error(`NOVELX_IMAGE_DIMENSIONS_INVALID: ${width}x${height}`)
        const png = Buffer.from(image.get_bytes())
        return { bytes: png, mime: "image/png" as const, sha256: createHash("sha256").update(png).digest("hex") }
      } finally {
        image.free()
      }
    },
    catch: (cause) =>
      new WorldVisualError("NOVELX_IMAGE_MEDIA_INVALID", cause instanceof Error ? cause.message : String(cause)),
  })
}

function loadManifest(
  fs: FSUtil.Interface,
  directory: string,
  materialization: Parameters<typeof verifyWorldVisuals>[0]["materialization"],
) {
  return Effect.gen(function* () {
    const text = yield* fs.readFileStringSafe(absoluteVisualPath(directory, NovelXWorldVisual.MANIFEST_PATH))
    if (!text) throw new WorldVisualError("NOVELX_VISUAL_MANIFEST_REQUIRED", "World visual manifest is missing.")
    return verifyWorldVisuals({
      manifest: Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(text)),
      materialization,
    })
  })
}

function persistManifest(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  directory: string,
  manifest: NovelXWorldVisual.Manifest,
) {
  return withWorldMutation(
    Effect.gen(function* () {
      const target = absoluteVisualPath(directory, NovelXWorldVisual.MANIFEST_PATH)
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
      yield* fs.ensureDir(path.dirname(target))
      yield* fs.writeFileString(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }).pipe(
        Effect.andThen(fs.rename(temporary, target)),
        Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
      )
      yield* events.publish(FileSystem.Event.Edited, { file: target })
      yield* events.publish(Watcher.Event.Updated, { file: target, event: "change" })
    }),
  )
}

function imageErrorCode(cause: unknown) {
  const value = String(cause)
  if (value.includes("TimeoutError") || value.toLocaleLowerCase().includes("timed out")) {
    return "NOVELX_IMAGE_PROVIDER_TIMEOUT"
  }
  if (value.includes("NOVELX_IMAGE_MEDIA_INVALID")) return "NOVELX_IMAGE_MEDIA_INVALID"
  return "NOVELX_IMAGE_PROVIDER_FAILED"
}

function absoluteVisualPath(directory: string, relative: string) {
  return path.join(directory, ...relative.split("/"))
}
