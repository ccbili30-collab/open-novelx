import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import * as NovelXWorldVisual from "@opencode-ai/schema/novelx-world-visual"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import type { Tool } from "@/tool/tool"
import { verifyStoryVisual } from "@/novelx/story-visual"
import { verifyWorldVisuals } from "@/novelx/world-visual"
import { loadStoryRuntime, type StoryRuntime } from "./novelx-story-runtime"
import { publishWorldFile, withWorldMutation } from "./novelx-world-runtime"

export type StoryCoverRuntime = {
  story: StoryRuntime
  manifest: NovelXStoryVisual.Manifest
  manifestPath: string
  manifestExisted: boolean
}

export function loadStoryCoverRuntime(fs: FSUtil.Interface) {
  return Effect.gen(function* () {
    const story = yield* loadStoryRuntime(fs)
    if (story.manifest.status !== "text_completed") throw new Error("NOVELX_STORY_TEXT_INCOMPLETE")
    const manifestPath = path.join(story.world.directory, ...NovelXStoryVisual.MANIFEST_PATH.split("/"))
    const text = yield* fs.readFileStringSafe(manifestPath)
    if (!text) throw new Error("NOVELX_STORY_COVER_MANIFEST_REQUIRED")
    const manifest = verifyStoryVisual(
      Schema.decodeUnknownSync(NovelXStoryVisual.Manifest)(JSON.parse(text)),
      story.manifest,
    )
    return { story, manifest, manifestPath, manifestExisted: true }
  })
}

export function persistStoryCovers(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  runtime: Pick<StoryCoverRuntime, "story" | "manifestPath" | "manifestExisted">,
  manifest: NovelXStoryVisual.Manifest,
) {
  return withWorldMutation(
    Effect.gen(function* () {
      const temporary = `${runtime.manifestPath}.${process.pid}.${randomUUID()}.tmp`
      yield* fs.ensureDir(path.dirname(runtime.manifestPath))
      yield* fs.writeFileString(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }).pipe(
        Effect.andThen(fs.rename(temporary, runtime.manifestPath)),
        Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
      )
      yield* publishWorldFile(events, runtime.manifestPath, runtime.manifestExisted ? "change" : "add")
    }),
  )
}

export function loadStoryVisualLanguage(fs: FSUtil.Interface, story: StoryRuntime) {
  return Effect.gen(function* () {
    const manifestPath = path.join(story.world.directory, ...NovelXWorldVisual.MANIFEST_PATH.split("/"))
    const text = yield* fs.readFileStringSafe(manifestPath)
    if (!text) throw new Error("NOVELX_WORLD_VISUAL_MANIFEST_REQUIRED")
    return verifyWorldVisuals({
      manifest: Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(text)),
      materialization: story.world.materialization,
    }).visualLanguage
  })
}

export function assertVisualTool(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-visual-editor") throw new Error("NOVELX_VISUAL_TOOL_REQUIRED")
}
