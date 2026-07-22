import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import * as http from "node:http"
import * as https from "node:https"
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
import { BackgroundJob } from "@/background/job"
import { loadWorldRuntime, publishWorldFile, withWorldMutation } from "@/tool/novelx-world-runtime"
import { updateImageTask, verifyWorldVisuals, WorldVisualError } from "./world-visual"
import { resolveWorldMapEditPlan } from "./world-map-variant"
import { buildDyWorldMapRequest, DY_WORLD_MAP_MODEL } from "./world-map-image-provider"

const IMAGE_PROVIDER = ProviderV2.ID.make("openai-compatible")
export const WORLD_IMAGE_MODEL = ModelV2.ID.make("gpt-image-2")
export const NOVELX_IMAGE_SIZE = "1024x1024"

export function worldImageJobId(directory: string) {
  return `novelx-world-images-${createHash("sha256").update(directory.toLocaleLowerCase("en-US")).digest("hex").slice(0, 24)}`
}

export function launchWorldImageQueue(input: {
  directory: string
  fs: FSUtil.Interface
  events: EventV2.Interface
  provider: Provider.Interface
  background: BackgroundJob.Interface
}) {
  return input.background.start({
    id: worldImageJobId(input.directory),
    type: "novelx-world-image-queue",
    title: "世界地图与风貌图片队列",
    metadata: { directory: input.directory },
    run: runWorldImageQueue({ directory: input.directory }).pipe(
      Effect.provideService(FSUtil.Service, input.fs),
      Effect.provideService(EventV2Bridge.Service, input.events),
      Effect.provideService(Provider.Service, input.provider),
      Effect.as("World image queue reached an authoritative terminal projection."),
    ),
  })
}

export function runWorldImageQueue(options: { directory: string }) {
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const provider = yield* Provider.Service
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
        const mapEndpoint = before.type === "map" ? process.env.NOVELX_MAP_IMAGE_ENDPOINT?.trim() : undefined
        const imageModel = mapEndpoint ? DY_WORLD_MAP_MODEL : `${IMAGE_PROVIDER}/${WORLD_IMAGE_MODEL}`
        const generating = updateImageTask({
          manifest: recovered,
          taskId: before.id,
          status: "generating",
          now: Date.now(),
          model: imageModel,
        })
        yield* persistManifest(fs, events, runtime.directory, generating)
        let baseURL: string | undefined
        let apiKey: string | undefined
        if (!mapEndpoint) {
          const info = yield* provider.getProvider(IMAGE_PROVIDER)
          yield* provider.getModel(IMAGE_PROVIDER, WORLD_IMAGE_MODEL)
          baseURL = typeof info.options.baseURL === "string" ? info.options.baseURL.replace(/\/$/u, "") : undefined
          apiKey = typeof info.options.apiKey === "string" ? info.options.apiKey : info.key
          if (!baseURL || !apiKey) {
            throw new WorldVisualError(
              "NOVELX_IMAGE_PROVIDER_UNCONFIGURED",
              "Image provider baseURL or API key is missing.",
            )
          }
        }
        const data = yield* generateImage({
          task: before,
          manifest: generating,
          directory: runtime.directory,
          baseURL,
          apiKey,
          mapEndpoint,
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
          model: imageModel,
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
  baseURL?: string
  apiKey?: string
  mapEndpoint?: string
  fs: FSUtil.Interface
}) {
  const prompt = [
    input.manifest.visualLanguage,
    input.task.prompt,
    "Do not render text, labels, legends, borders, grids, UI, signatures, or watermarks.",
  ].join("\n\n")
  if (input.task.type === "map") {
    return Effect.gen(function* () {
      const plan = resolveWorldMapEditPlan({ manifest: input.manifest, task: input.task })
      const source = yield* input.fs.readFile(absoluteVisualPath(input.directory, plan.sourcePath))
      if (input.mapEndpoint) {
        const request = yield* Effect.tryPromise({
          try: () =>
            buildDyWorldMapRequest({
              endpoint: input.mapEndpoint!,
              manifest: input.manifest,
              task: input.task,
              source: Buffer.from(source),
            }),
          catch: (cause) =>
            cause instanceof WorldVisualError
              ? cause
              : new WorldVisualError(
                  "NOVELX_IMAGE_MAP_REQUEST_INVALID",
                  cause instanceof Error ? cause.message : String(cause),
                ),
        })
        return yield* requestImage(request.url, request.init, 600_000)
      }
      if (!input.baseURL || !input.apiKey) {
        throw new WorldVisualError(
          "NOVELX_IMAGE_PROVIDER_UNCONFIGURED",
          "Image provider baseURL or API key is missing.",
        )
      }
      const form = new FormData()
      form.append("model", WORLD_IMAGE_MODEL)
      form.append("prompt", `${prompt}\n\n${plan.instruction}`)
      form.append("image", new Blob([Uint8Array.from(source).buffer], { type: "image/png" }), plan.sourceFilename)
      form.append("size", NOVELX_IMAGE_SIZE)
      form.append("quality", "low")
      form.append("response_format", "b64_json")
      return yield* requestImage(
        `${input.baseURL}/images/edits`,
        { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}` }, body: form },
        600_000,
      )
    })
  }
  if (!input.baseURL || !input.apiKey) {
    return Effect.fail(
      new WorldVisualError("NOVELX_IMAGE_PROVIDER_UNCONFIGURED", "Image provider baseURL or API key is missing."),
    )
  }
  return requestImage(`${input.baseURL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      model: WORLD_IMAGE_MODEL,
      prompt,
      size: NOVELX_IMAGE_SIZE,
      quality: "low",
      response_format: "b64_json",
    }),
  })
}

export function requestImage(url: string, init: RequestInit, timeout = 300_000) {
  return Effect.tryPromise({
    try: async () => {
      const response = shouldUseNativeNodeHttp(init.body)
        ? await requestWithNodeHttp(url, init, timeout)
        : await requestWithFetch(url, init, timeout)
      const text = response.body.toString("utf8")
      if (!response.ok) throw new Error(`NOVELX_IMAGE_PROVIDER_HTTP_${response.status}: ${text.slice(0, 500)}`)
      const parsed = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> }
      const first = parsed.data?.[0]
      if (first?.b64_json) return Buffer.from(first.b64_json, "base64")
      if (first?.url) {
        const asset = shouldUseNativeNodeHttp(undefined)
          ? await requestWithNodeHttp(first.url, { method: "GET" }, 120_000)
          : await requestWithFetch(first.url, { method: "GET" }, 120_000)
        if (!asset.ok) throw new Error(`NOVELX_IMAGE_ASSET_HTTP_${asset.status}`)
        return asset.body
      }
      throw new Error("NOVELX_IMAGE_PROVIDER_EMPTY: No image payload returned.")
    },
    catch: (cause) =>
      new WorldVisualError("NOVELX_IMAGE_PROVIDER_FAILED", cause instanceof Error ? cause.message : String(cause)),
  })
}

type ImageHttpResponse = {
  status: number
  ok: boolean
  body: Buffer
}

function shouldUseNativeNodeHttp(body: RequestInit["body"]) {
  return !process.versions.bun && (body === undefined || typeof body === "string" || Buffer.isBuffer(body))
}

async function requestWithFetch(url: string, init: RequestInit, timeout: number): Promise<ImageHttpResponse> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
  return {
    status: response.status,
    ok: response.ok,
    body: Buffer.from(await response.arrayBuffer()),
  }
}

export function requestImageWithNodeHttp(url: string, init: RequestInit, timeout: number): Promise<ImageHttpResponse> {
  return requestWithNodeHttp(url, init, timeout)
}

function requestWithNodeHttp(
  url: string,
  init: RequestInit,
  timeout: number,
  redirects = 0,
): Promise<ImageHttpResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const transport = target.protocol === "https:" ? https : http
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const body = init.body
    if ((typeof body === "string" || Buffer.isBuffer(body)) && headers["content-length"] === undefined) {
      headers["content-length"] = String(Buffer.byteLength(body))
    }
    const request = transport.request(
      target,
      {
        method: init.method ?? "GET",
        headers,
      },
      (response) => {
        const status = response.statusCode ?? 0
        const location = response.headers.location
        if (status >= 300 && status < 400 && location) {
          response.resume()
          if (redirects >= 5) {
            reject(new Error("NOVELX_IMAGE_PROVIDER_REDIRECT_LIMIT"))
            return
          }
          resolve(requestWithNodeHttp(new URL(location, target).toString(), { method: "GET" }, timeout, redirects + 1))
          return
        }
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer | Uint8Array | string) => chunks.push(Buffer.from(chunk)))
        response.once("end", () => {
          resolve({ status, ok: status >= 200 && status < 300, body: Buffer.concat(chunks) })
        })
        response.once("error", reject)
      },
    )
    const timer = setTimeout(() => request.destroy(new Error(`NOVELX_IMAGE_PROVIDER_TIMEOUT_${timeout}`)), timeout)
    timer.unref()
    request.once("close", () => clearTimeout(timer))
    request.once("error", reject)
    if (typeof body === "string" || Buffer.isBuffer(body)) request.end(body)
    else request.end()
  })
}

export function validateImage(bytes: Buffer) {
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
