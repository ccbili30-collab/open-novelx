import path from "node:path"
import { Effect, Schema } from "effect"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Provider } from "@/provider/provider"
import { BackgroundJob } from "@/background/job"
import { compileStoryVisual, verifyStoryVisual } from "@/novelx/story-visual"
import { launchStoryCoverQueue } from "@/novelx/story-cover-queue"
import { Tool } from "@/tool/tool"
import { loadStoryRuntime } from "./novelx-story-runtime"
import { assertVisualTool, loadStoryVisualLanguage, persistStoryCovers } from "./novelx-story-cover-runtime"

const TOOL_ID = "novelx_register_story_covers"
export const Parameters = Schema.Struct({
  covers: Schema.Array(NovelXStoryVisual.CoverProfile).check(Schema.isMinLength(2), Schema.isMaxLength(6)),
})
type Metadata = { manifestPath: string; integritySha256: string; tasks: number; replayed: boolean }

export const NovelXRegisterStoryCoversTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service | Provider.Service | BackgroundJob.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const provider = yield* Provider.Service
    const background = yield* BackgroundJob.Service
    return {
      description: "Register the exact mandatory Story cover set and launch the real asynchronous image Provider worker.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertVisualTool(ctx)
          const story = yield* loadStoryRuntime(fs)
          const visualLanguage = yield* loadStoryVisualLanguage(fs, story)
          const manifestPath = path.join(story.world.directory, ...NovelXStoryVisual.MANIFEST_PATH.split("/"))
          const existing = yield* fs.readFileStringSafe(manifestPath)
          if (existing) {
            const manifest = verifyStoryVisual(
              Schema.decodeUnknownSync(NovelXStoryVisual.Manifest)(JSON.parse(existing)),
              story.manifest,
            )
            if (manifest.status !== "ready" && manifest.status !== "partial" && manifest.status !== "failed") {
              yield* launchStoryCoverQueue({ directory: story.world.directory, fs, events, provider, background })
            }
            return result(manifest, true)
          }
          const manifest = compileStoryVisual({
            story: story.manifest,
            editorSessionId: ctx.sessionID,
            visualLanguage,
            covers: params.covers,
            now: Date.now(),
          })
          yield* ctx.ask({
            permission: TOOL_ID,
            patterns: [NovelXStoryVisual.MANIFEST_PATH, `${NovelXStoryVisual.COVER_DIRECTORY}/**`],
            always: [NovelXStoryVisual.MANIFEST_PATH, `${NovelXStoryVisual.COVER_DIRECTORY}/**`],
            metadata: { tasks: manifest.tasks.length },
          })
          yield* persistStoryCovers(fs, events, { story, manifestPath, manifestExisted: false }, manifest)
          yield* launchStoryCoverQueue({ directory: story.world.directory, fs, events, provider, background })
          return result(manifest, false)
        }).pipe(Effect.orDie),
    }
  }),
)

function result(manifest: NovelXStoryVisual.Manifest, replayed: boolean) {
  return {
    title: replayed ? "故事封面队列已存在" : "故事封面已入队",
    metadata: {
      manifestPath: NovelXStoryVisual.MANIFEST_PATH,
      integritySha256: manifest.integritySha256,
      tasks: manifest.tasks.length,
      replayed,
    },
    output: `${manifest.tasks.length} 个强制封面任务已进入真实图片队列；每个任务只有一条已冻结的最终 Prompt，Worker 只执行并在失败时原样重试。`,
  }
}
