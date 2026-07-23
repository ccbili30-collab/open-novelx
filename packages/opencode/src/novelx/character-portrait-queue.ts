import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { Effect } from "effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Provider } from "@/provider/provider"
import { BackgroundJob } from "@/background/job"
import { CharacterVisualError, characterPortraitProviderPrompt, updateCharacterPortraitTask } from "./character-visual"
import { requestImage, validateImage } from "./world-image-queue"
import { loadCharacterVisualRuntime, persistCharacterVisual } from "@/tool/novelx-character-visual-runtime"
import { publishWorldFile } from "@/tool/novelx-world-runtime"
import { growthImageQueuePaused } from "./image-queue-control-state"

const IMAGE_PROVIDER = ProviderV2.ID.make("openai-compatible")
export const CHARACTER_PORTRAIT_MODEL = ModelV2.ID.make("gpt-image-2")
export const CHARACTER_PORTRAIT_SIZE = "1024x1536"

export function characterPortraitJobId(directory: string) {
  return `novelx-character-portrait-${createHash("sha256").update(directory.toLocaleLowerCase("en-US")).digest("hex").slice(0, 24)}`
}

export function launchCharacterPortraitQueue(input: {
  directory: string
  fs: FSUtil.Interface
  events: EventV2.Interface
  provider: Provider.Interface
  background: BackgroundJob.Interface
}) {
  return input.background.start({
    id: characterPortraitJobId(input.directory),
    type: "novelx-character-portrait-queue",
    title: "角色立绘图片队列",
    metadata: { directory: input.directory },
    run: runCharacterPortraitQueue({ directory: input.directory }).pipe(
      Effect.provideService(FSUtil.Service, input.fs),
      Effect.provideService(EventV2Bridge.Service, input.events),
      Effect.provideService(Provider.Service, input.provider),
      Effect.as("Character portrait queue reached an authoritative terminal projection."),
    ),
  })
}

export function runCharacterPortraitQueue(options: { directory: string }) {
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const provider = yield* Provider.Service
    const initial = yield* loadCharacterVisualRuntime(fs)
    if (initial.character.world.directory !== options.directory) {
      throw new CharacterVisualError("NOVELX_IMAGE_DIRECTORY_MISMATCH", "Portrait worker project mismatch.")
    }
    while (true) {
      if (yield* growthImageQueuePaused(fs, options.directory)) return
      const runtime = yield* loadCharacterVisualRuntime(fs)
      const task = runtime.manifest.task
      if (task.status === "attached" || (task.status === "failed" && task.attempts >= 3)) return
      if (task.status === "generating" || task.status === "validating") {
        const recovered = updateCharacterPortraitTask({
          manifest: runtime.manifest,
          status: "failed",
          now: Date.now(),
          errorCode: "NOVELX_IMAGE_WORKER_INTERRUPTED",
        })
        yield* persistCharacterVisual(fs, events, runtime, recovered)
        continue
      }
      const generating = updateCharacterPortraitTask({
        manifest: runtime.manifest,
        status: "generating",
        now: Date.now(),
        model: `${IMAGE_PROVIDER}/${CHARACTER_PORTRAIT_MODEL}`,
      })
      yield* persistCharacterVisual(fs, events, runtime, generating)
      const attempt = Effect.gen(function* () {
        const info = yield* provider.getProvider(IMAGE_PROVIDER)
        yield* provider.getModel(IMAGE_PROVIDER, CHARACTER_PORTRAIT_MODEL)
        const baseURL = typeof info.options.baseURL === "string" ? info.options.baseURL.replace(/\/$/u, "") : undefined
        const apiKey = typeof info.options.apiKey === "string" ? info.options.apiKey : info.key
        if (!baseURL || !apiKey) {
          throw new CharacterVisualError("NOVELX_IMAGE_PROVIDER_UNCONFIGURED", "Image Provider is missing.")
        }
        const bytes = yield* requestImage(
          `${baseURL}/images/generations`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              model: CHARACTER_PORTRAIT_MODEL,
              prompt: characterPortraitProviderPrompt(generating),
              size: CHARACTER_PORTRAIT_SIZE,
              quality: "low",
              response_format: "b64_json",
            }),
          },
          600_000,
        )
        const validating = updateCharacterPortraitTask({
          manifest: generating,
          status: "validating",
          now: Date.now(),
        })
        yield* persistCharacterVisual(fs, events, runtime, validating)
        const image = yield* validateImage(bytes)
        const target = path.join(options.directory, ...task.targetPath.split("/"))
        const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
        yield* fs.ensureDir(path.dirname(target))
        yield* fs.writeFile(temporary, image.bytes).pipe(
          Effect.andThen(fs.rename(temporary, target)),
          Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
        )
        const attached = updateCharacterPortraitTask({
          manifest: validating,
          status: "attached",
          now: Date.now(),
          mime: image.mime,
          assetSha256: image.sha256,
        })
        yield* persistCharacterVisual(fs, events, runtime, attached)
        yield* publishWorldFile(events, target, "add")
      })
      const exit = yield* Effect.exit(attempt)
      if (exit._tag === "Failure") {
        const latest = yield* loadCharacterVisualRuntime(fs)
        const current = latest.manifest.task
        if (current.status === "generating" || current.status === "validating") {
          const failed = updateCharacterPortraitTask({
            manifest: latest.manifest,
            status: "failed",
            now: Date.now(),
            errorCode: imageErrorCode(exit.cause),
          })
          yield* persistCharacterVisual(fs, events, latest, failed)
        }
        yield* Effect.logError("NovelX character portrait attempt failed", { taskId: task.id, cause: exit.cause })
      }
    }
  })
}

function imageErrorCode(cause: unknown) {
  const value = String(cause)
  if (/timeout|timed out/iu.test(value)) return "NOVELX_IMAGE_PROVIDER_TIMEOUT"
  if (value.includes("NOVELX_IMAGE_MEDIA_INVALID")) return "NOVELX_IMAGE_MEDIA_INVALID"
  return "NOVELX_IMAGE_PROVIDER_FAILED"
}
