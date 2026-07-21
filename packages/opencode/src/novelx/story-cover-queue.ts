import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { Effect } from "effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Provider } from "@/provider/provider"
import { BackgroundJob } from "@/background/job"
import { StoryVisualError, storyCoverProviderPrompt, updateStoryImageTask } from "./story-visual"
import { requestImage, validateImage } from "./world-image-queue"
import { loadStoryCoverRuntime, persistStoryCovers } from "@/tool/novelx-story-cover-runtime"
import { publishWorldFile } from "@/tool/novelx-world-runtime"

const IMAGE_PROVIDER = ProviderV2.ID.make("openai-compatible")
export const STORY_COVER_MODEL = ModelV2.ID.make("gpt-image-2")

export function launchStoryCoverQueue(input: {
  directory: string
  fs: FSUtil.Interface
  events: EventV2.Interface
  provider: Provider.Interface
  background: BackgroundJob.Interface
}) {
  const jobId = `novelx-story-covers-${createHash("sha256").update(input.directory.toLocaleLowerCase("en-US")).digest("hex").slice(0, 24)}`
  return input.background.start({
    id: jobId,
    type: "novelx-story-cover-queue",
    title: "故事封面图片队列",
    metadata: { directory: input.directory },
    run: runStoryCoverQueue({ directory: input.directory }).pipe(
      Effect.provideService(FSUtil.Service, input.fs),
      Effect.provideService(EventV2Bridge.Service, input.events),
      Effect.provideService(Provider.Service, input.provider),
      Effect.as("Story cover queue reached an authoritative terminal projection."),
    ),
  })
}

export function runStoryCoverQueue(options: { directory: string }) {
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const provider = yield* Provider.Service
    const info = yield* provider.getProvider(IMAGE_PROVIDER)
    yield* provider.getModel(IMAGE_PROVIDER, STORY_COVER_MODEL)
    const baseURL = typeof info.options.baseURL === "string" ? info.options.baseURL.replace(/\/$/u, "") : undefined
    const apiKey = typeof info.options.apiKey === "string" ? info.options.apiKey : info.key
    if (!baseURL || !apiKey) throw new StoryVisualError("NOVELX_IMAGE_PROVIDER_UNCONFIGURED", "Image Provider is missing.")
    const initial = yield* loadStoryCoverRuntime(fs)
    if (initial.story.world.directory !== options.directory) throw new StoryVisualError("NOVELX_IMAGE_DIRECTORY_MISMATCH", "Cover worker project mismatch.")
    for (const initialTask of initial.manifest.tasks) {
      while (true) {
        const runtime = yield* loadStoryCoverRuntime(fs)
        const task = runtime.manifest.tasks.find((candidate) => candidate.id === initialTask.id)
        if (!task || task.status === "attached" || (task.status === "failed" && task.attempts >= 3)) break
        if (task.status === "generating" || task.status === "validating") {
          const recovered = updateStoryImageTask({
            manifest: runtime.manifest,
            taskId: task.id,
            status: "failed",
            now: Date.now(),
            errorCode: "NOVELX_IMAGE_WORKER_INTERRUPTED",
          })
          yield* persistStoryCovers(fs, events, runtime, recovered)
          continue
        }
        const generating = updateStoryImageTask({
          manifest: runtime.manifest,
          taskId: task.id,
          status: "generating",
          now: Date.now(),
          model: `${IMAGE_PROVIDER}/${STORY_COVER_MODEL}`,
        })
        yield* persistStoryCovers(fs, events, runtime, generating)
        const attempt = Effect.gen(function* () {
          const bytes = yield* requestImage(`${baseURL}/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              model: STORY_COVER_MODEL,
              prompt: storyCoverProviderPrompt(generating, task),
              size: task.aspect === "portrait" ? "1024x1536" : "1536x1024",
              quality: "low",
              response_format: "b64_json",
            }),
          }, 600_000)
          const validating = updateStoryImageTask({ manifest: generating, taskId: task.id, status: "validating", now: Date.now() })
          yield* persistStoryCovers(fs, events, runtime, validating)
          const image = yield* validateImage(bytes)
          const target = path.join(options.directory, ...task.targetPath.split("/"))
          const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
          yield* fs.ensureDir(path.dirname(target))
          yield* fs.writeFile(temporary, image.bytes).pipe(
            Effect.andThen(fs.rename(temporary, target)),
            Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
          )
          const attached = updateStoryImageTask({
            manifest: validating,
            taskId: task.id,
            status: "attached",
            now: Date.now(),
            mime: image.mime,
            assetSha256: image.sha256,
          })
          yield* persistStoryCovers(fs, events, runtime, attached)
          yield* publishWorldFile(events, target, "add")
        })
        const exit = yield* Effect.exit(attempt)
        if (exit._tag === "Failure") {
          const latest = yield* loadStoryCoverRuntime(fs)
          const current = latest.manifest.tasks.find((candidate) => candidate.id === task.id)
          if (current && (current.status === "generating" || current.status === "validating")) {
            const failed = updateStoryImageTask({
              manifest: latest.manifest,
              taskId: current.id,
              status: "failed",
              now: Date.now(),
              errorCode: imageErrorCode(exit.cause),
            })
            yield* persistStoryCovers(fs, events, latest, failed)
          }
          yield* Effect.logError("NovelX story cover attempt failed", { taskId: task.id, cause: exit.cause })
        }
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
