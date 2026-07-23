import path from "node:path"
import { Effect } from "effect"
import * as NovelXCharacterVisual from "@opencode-ai/schema/novelx-character-visual"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import * as NovelXWorldVisual from "@opencode-ai/schema/novelx-world-visual"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { Provider } from "@/provider/provider"
import { BackgroundJob } from "@/background/job"
import { launchWorldImageQueue, loadManifest, persistManifest, worldImageJobId } from "./world-image-queue"
import { characterPortraitJobId, launchCharacterPortraitQueue } from "./character-portrait-queue"
import { launchStoryCoverQueue, storyCoverJobId } from "./story-cover-queue"
import { loadCharacterVisualRuntime, persistCharacterVisual } from "@/tool/novelx-character-visual-runtime"
import { loadStoryCoverRuntime, persistStoryCovers } from "@/tool/novelx-story-cover-runtime"
import { retryCharacterPortraitTask } from "./character-visual"
import { retryFailedStoryImageTasks } from "./story-visual"
import { retryFailedImageTasks } from "./world-visual"
import { loadWorldRuntime } from "@/tool/novelx-world-runtime"
import { readGrowthImageQueueControl } from "./image-queue-control-state"

export { setGrowthImageQueuePaused } from "./image-queue-control-state"

export type GrowthImageQueueKind = "world" | "character" | "story"
export type GrowthImageQueueJobStatus = "idle" | BackgroundJob.Status

export type GrowthImageQueueState = {
  paused: boolean
  jobs: Array<{
    kind: GrowthImageQueueKind
    available: boolean
    status: GrowthImageQueueJobStatus
    error?: string
  }>
}

const absolute = (directory: string, relative: string) => path.join(directory, ...relative.split("/"))

function availability(fs: FSUtil.Interface, directory: string) {
  return Effect.all({
    world: fs.existsSafe(absolute(directory, NovelXWorldVisual.MANIFEST_PATH)),
    character: fs.existsSafe(absolute(directory, NovelXCharacterVisual.MANIFEST_PATH)),
    story: fs.existsSafe(absolute(directory, NovelXStoryVisual.MANIFEST_PATH)),
  })
}

const jobIds = (directory: string) => ({
  world: worldImageJobId(directory),
  character: characterPortraitJobId(directory),
  story: storyCoverJobId(directory),
})

export function growthImageQueueState(input: {
  directory: string
  fs: FSUtil.Interface
  background: BackgroundJob.Interface
}) {
  return Effect.gen(function* () {
    const [control, available] = yield* Effect.all([
      readGrowthImageQueueControl(input.fs, input.directory),
      availability(input.fs, input.directory),
    ])
    const ids = jobIds(input.directory)
    const jobs = yield* Effect.all({
      world: input.background.get(ids.world),
      character: input.background.get(ids.character),
      story: input.background.get(ids.story),
    })
    return {
      paused: control.paused,
      jobs: (["world", "character", "story"] as const).map((kind) => ({
        kind,
        available: available[kind],
        status: jobs[kind]?.status ?? "idle",
        ...(jobs[kind]?.error ? { error: jobs[kind]!.error } : {}),
      })),
    } satisfies GrowthImageQueueState
  })
}

export function launchGrowthImageQueues(input: {
  directory: string
  fs: FSUtil.Interface
  events: EventV2.Interface
  provider: Provider.Interface
  background: BackgroundJob.Interface
}) {
  return Effect.gen(function* () {
    const available = yield* availability(input.fs, input.directory)
    const launches = [
      available.world ? launchWorldImageQueue(input) : Effect.void,
      available.character ? launchCharacterPortraitQueue(input) : Effect.void,
      available.story ? launchStoryCoverQueue(input) : Effect.void,
    ]
    yield* Effect.all(launches, { concurrency: "unbounded" })
    return yield* growthImageQueueState(input)
  })
}

export function retryFailedGrowthImageTasks(input: {
  directory: string
  fs: FSUtil.Interface
  events: EventV2.Interface
}) {
  return Effect.gen(function* () {
    const available = yield* availability(input.fs, input.directory)
    if (available.world) {
      const runtime = yield* loadWorldRuntime(input.fs)
      const manifest = yield* loadManifest(input.fs, runtime.directory, runtime.materialization)
      const next = retryFailedImageTasks(manifest, Date.now())
      if (next !== manifest) yield* persistManifest(input.fs, input.events, runtime.directory, next)
    }
    if (available.character) {
      const runtime = yield* loadCharacterVisualRuntime(input.fs)
      const next = retryCharacterPortraitTask(runtime.manifest, Date.now())
      if (next !== runtime.manifest) yield* persistCharacterVisual(input.fs, input.events, runtime, next)
    }
    if (available.story) {
      const runtime = yield* loadStoryCoverRuntime(input.fs)
      const next = retryFailedStoryImageTasks(runtime.manifest, Date.now())
      if (next !== runtime.manifest) yield* persistStoryCovers(input.fs, input.events, runtime, next)
    }
  })
}
